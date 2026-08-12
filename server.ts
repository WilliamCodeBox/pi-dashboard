/**
 * server.ts — HTTP + WS（阶段1）
 * 安全：随机 token（启动打印）+ Origin 校验 + 命令白名单（永不转发 bash）。
 * 路由：GET /（静态前端）、WS /ws?token=、GET /api/state、GET /api/history。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawn } from "node:child_process";
import { WebSocketServer, WebSocket } from "ws";
import { Bridge } from "./bridge.ts";
import { Hub } from "./hub.ts";

const PORT = Number(process.env.PI_DASH_PORT ?? 7777);
let actualPort = PORT;
const CONFIG_DIR = path.join(os.homedir(), ".pi-dashboard");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
function loadConfigProject(): string | undefined {
  try { const raw = fs.readFileSync(CONFIG_FILE, "utf8"); const cfg = JSON.parse(raw); return typeof cfg.projectCwd === "string" && cfg.projectCwd ? cfg.projectCwd : undefined; } catch { return undefined; }
}
function saveConfigProject(dir: string) { try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); fs.writeFileSync(CONFIG_FILE, JSON.stringify({ projectCwd: dir }, null, 2)); } catch (e) { console.error("[dash] 无法写入 config:", e); } }
// 启动解析优先级：--cwd= > config.json > PI_DASH_PROJECT > process.cwd()
function resolveInitialCwd(): string {
  const flag = process.argv.find((a) => a.startsWith("--cwd="))?.slice(6);
  if (flag) return flag;
  const cfg = loadConfigProject();
  if (cfg) return cfg;
  const env = process.env.PI_DASH_PROJECT;
  if (env) return env;
  return process.cwd();
}
let projectCwd = resolveInitialCwd();
const PUBLIC = path.join(import.meta.dirname, "public");
const TOKEN = crypto.randomBytes(12).toString("hex");

const hub = new Hub();
const bridge = new Bridge({
  cwd: projectCwd,
  onEvent: (e) => hub.ingest(e),
  onStatus: (s) => hub.sys("status", s),
});
bridge.start();
bridge.handshake().then((st) => {
  hub.sys("state", st ?? {});
  console.log("[dash] pi state:", st ? `session=${st.sessionId.slice(0, 8)}… model=${st.model?.id}` : "handshake failed");
}).catch((err) => hub.sys("handshake", { error: String(err) }));

const allowedCommands = new Set(["prompt", "steer", "follow_up", "abort", "set_project", "pick_directory"]);
let ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${actualPort}`, `http://localhost:${actualPort}`]);

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  // 静态与 API 都校验 Origin（防 DNS rebinding；本地工具，够用）
  const origin = req.headers.origin;
  // token + Origin 校验：静态与 API 共用同一道闸，避免静态路由绕过鉴权
  if (origin && !ALLOWED_ORIGINS.has(origin)) { res.writeHead(403); res.end("forbidden"); return; }
  if (url.searchParams.get("t") !== TOKEN) { res.writeHead(401); res.end("unauthorized"); return; }
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname === "/api/state") { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify({ state: bridge.lastState, bridge: bridge.state, cwd: projectCwd })); return; }
    if (url.pathname === "/api/history") { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(listSessions())); return; }
    res.writeHead(404); res.end(); return;
  }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    const f = path.join(PUBLIC, "index.html");
    if (fs.existsSync(f)) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(fs.readFileSync(f)); return; }
    res.writeHead(404); res.end("no frontend"); return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const okToken = url.searchParams.get("token") === TOKEN;
  const okOrigin = !req.headers.origin || ALLOWED_ORIGINS.has(req.headers.origin);
  if (!okToken || !okOrigin) { socket.write("HTTP/1.1 403 Forbidden\r\n\r\n"); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", (ws: WebSocket) => {
  const off = hub.subscribe((ev) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "event", ev }));
  });
  // 补发缓冲
  const events = hub.replay(0) ?? [];
  ws.send(JSON.stringify({ type: "replay", events }));
  ws.on("message", (raw) => {
    let cmd: any;
    try { cmd = JSON.parse(raw.toString()); } catch { return; }
    if (cmd.type === "extension_ui_response") {
      bridge.respondExtensionUi(cmd.id, { value: cmd.value, confirmed: cmd.confirmed, cancelled: cmd.cancelled });
      return;
    }
    if (!allowedCommands.has(cmd.type)) { ws.send(JSON.stringify({ type: "denied", command: cmd.type })); return; }
    const p = cmd.type === "set_project"
      ? handleSetProject(String(cmd.cwd ?? ""))
      : cmd.type === "pick_directory"
      ? pickDirectory()
      : cmd.type === "prompt"
      ? bridge.prompt(cmd.message, cmd.streamingBehavior)
      : cmd.type === "steer" ? bridge.steer(cmd.message)
      : cmd.type === "follow_up" ? bridge.followUp(cmd.message)
      : bridge.abort();
    p.then((r) => ws.send(JSON.stringify({ type: "cmd_result", id: cmd.id, success: r.success, error: r.error, path: (r as any).path })))
     .catch((err) => ws.send(JSON.stringify({ type: "cmd_result", id: cmd.id, success: false, error: String(err) })));
  });
  ws.on("close", off);
});

function listSessions() {
  const base = path.join(os.homedir(), ".pi", "agent", "sessions");
  try {
    const out: any[] = [];
    for (const dir of fs.readdirSync(base, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const sub = path.join(base, dir.name);
      for (const f of fs.readdirSync(sub)) {
        if (!f.endsWith(".jsonl")) continue;
        const fp = path.join(sub, f);
        let projectCwd = "";
        try {
          const fh = fs.openSync(fp, "r");
          const buf = Buffer.alloc(4096);
          const n = fs.readSync(fh, buf, 0, 4096, 0);
          fs.closeSync(fh);
          const line = buf.toString("utf8", 0, n).split("\n", 1)[0];
          const m = line.match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/);
          if (m) { try { projectCwd = JSON.parse('"' + m[1] + '"'); } catch { projectCwd = ""; } }
        } catch { /* 读首行失败 → 视为未知项目 */ }
        const st = fs.statSync(fp);
        out.push({ dir: dir.name, file: f, size: st.size, mtime: st.mtime.toISOString(), projectCwd });
      }
    }
    out.sort((a, b) => b.mtime.localeCompare(a.mtime));
    return out.slice(0, 50);
  } catch { return []; }
}

function rehandshake() {
  bridge.handshake().then((st) => { hub.sys("state", st ?? {}); }).catch(() => {});
}
function handleSetProject(dir: string): Promise<{ success: boolean; error?: string }> {
  if (!dir) return Promise.resolve({ success: false, error: "empty path" });
  let st: any;
  try { st = fs.statSync(dir); } catch { return Promise.resolve({ success: false, error: `路径不存在: ${dir}` }); }
  if (!st || !st.isDirectory()) return Promise.resolve({ success: false, error: `不是目录: ${dir}` });
  projectCwd = dir;
  saveConfigProject(dir);
  bridge.restart(dir);
  rehandshake();
  hub.sys("cwd", { cwd: dir });
  return Promise.resolve({ success: true });
}

function pickDirectory(): Promise<{ success: boolean; error?: string; path?: string }> {
  if (process.platform !== "win32") return Promise.resolve({ success: false, error: "仅 Windows 支持浏览选择目录" });
  return new Promise((resolve) => {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$f = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$f.Description = '选择 pi 的项目目录'",
      "$f.ShowNewFolderButton = $true",
      "if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath } else { Write-Output '' }",
    ].join("\n");
    const ps = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: false });
    let out = "";
    ps.stdout.on("data", (d) => { out += d.toString(); });
    let done = false;
    const finish = (r: { success: boolean; error?: string; path?: string }) => { if (!done) { done = true; resolve(r); } };
    ps.on("close", () => { const sel = out.trim(); finish(sel ? { success: true, path: sel } : { success: false, error: "已取消" }); });
    ps.on("error", (e) => finish({ success: false, error: String(e) }));
    setTimeout(() => { try { ps.kill(); } catch {} finish({ success: false, error: "选择超时" }); }, 120000);
  });
}

function tryListen(port: number) {
  actualPort = port;
  ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${actualPort}`, `http://localhost:${actualPort}`]);
  const onErr = (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && port < PORT + 10) {
      console.warn(`[dash] port ${port} in use, trying ${port + 1}…`);
      tryListen(port + 1);
    } else {
      console.error(`[dash] fatal: cannot bind ${port}: ${err.code}`);
      process.exit(1);
    }
  };
  server.once("error", onErr);
  server.listen(port, "127.0.0.1");
}

tryListen(PORT);

// Single 'listening' listener — fires exactly once when a bind finally succeeds,
// printing the banner with the actually-bound (reachable) port. No accumulation.
server.once("listening", () => {
  console.log("[dash] ============================================");
  console.log(`[dash]  URL    http://127.0.0.1:${actualPort}/?t=${TOKEN}`);
  console.log(`[dash]  cwd    ${projectCwd}`);
  console.log(`[dash]  token  ${TOKEN}`);
  console.log("[dash] ============================================");
});
