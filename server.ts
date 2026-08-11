/**
 * server.ts — HTTP + WS（阶段1）
 * 安全：随机 token（启动打印）+ Origin 校验 + 命令白名单（永不转发 bash）。
 * 路由：GET /（静态前端）、WS /ws?token=、GET /api/state、GET /api/history。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { Bridge } from "./bridge.ts";
import { Hub } from "./hub.ts";

const PORT = Number(process.env.PI_DASH_PORT ?? 7777);
const CWD = process.argv.find((a) => a.startsWith("--cwd="))?.slice(6) ?? process.cwd();
const PUBLIC = path.join(import.meta.dirname, "public");
const TOKEN = crypto.randomBytes(12).toString("hex");

const hub = new Hub();
const bridge = new Bridge({
  cwd: CWD,
  onEvent: (e) => hub.ingest(e),
  onStatus: (s) => hub.sys("status", s),
});
bridge.start();
bridge.handshake().then((st) => {
  hub.sys("state", st ?? {});
  console.log("[dash] pi state:", st ? `session=${st.sessionId.slice(0, 8)}… model=${st.model?.id}` : "handshake failed");
}).catch((err) => hub.sys("handshake", { error: String(err) }));

const allowedCommands = new Set(["prompt", "steer", "follow_up", "abort"]);
const ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  // 静态与 API 都校验 Origin（防 DNS rebinding；本地工具，够用）
  const origin = req.headers.origin;
  if (url.pathname.startsWith("/api/")) {
    if (origin && !ALLOWED_ORIGINS.has(origin)) { res.writeHead(403); res.end("forbidden"); return; }
    if (url.searchParams.get("t") !== TOKEN) { res.writeHead(401); res.end("unauthorized"); return; }
    if (url.pathname === "/api/state") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ state: bridge.lastState, bridge: bridge.state })); return; }
    if (url.pathname === "/api/history") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(listSessions())); return; }
    res.writeHead(404); res.end(); return;
  }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    const f = path.join(PUBLIC, "index.html");
    if (fs.existsSync(f)) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(fs.readFileSync(f)); return; }
    res.writeHead(404); res.end("no frontend"); return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ noServer: true });
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
    const p = cmd.type === "prompt"
      ? bridge.prompt(cmd.message, cmd.streamingBehavior)
      : cmd.type === "steer" ? bridge.steer(cmd.message)
      : cmd.type === "follow_up" ? bridge.followUp(cmd.message)
      : bridge.abort();
    p.then((r) => ws.send(JSON.stringify({ type: "cmd_result", id: cmd.id, success: r.success, error: r.error })))
     .catch((err) => ws.send(JSON.stringify({ type: "cmd_result", id: cmd.id, success: false, error: String(err) })));
  });
  ws.on("close", off);
});

function listSessions() {
  const base = path.join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".pi", "agent", "sessions");
  try {
    const out: any[] = [];
    for (const dir of fs.readdirSync(base, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const sub = path.join(base, dir.name);
      for (const f of fs.readdirSync(sub)) {
        if (!f.endsWith(".jsonl")) continue;
        const st = fs.statSync(path.join(sub, f));
        out.push({ dir: dir.name, file: f, size: st.size, mtime: st.mtime.toISOString() });
      }
    }
    out.sort((a, b) => b.mtime.localeCompare(a.mtime));
    return out.slice(0, 50);
  } catch { return []; }
}

server.listen(PORT, "127.0.0.1", () => {
  console.log("[dash] ============================================");
  console.log(`[dash]  URL    http://127.0.0.1:${PORT}/?t=${TOKEN}`);
  console.log(`[dash]  cwd    ${CWD}`);
  console.log(`[dash]  token  ${TOKEN}`);
  console.log("[dash] ============================================");
});
