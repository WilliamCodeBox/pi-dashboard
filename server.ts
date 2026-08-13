/**
 * server.ts — HTTP + WS（阶段3 编排）
 * 职责：HTTP 服务 / WS 升级 / 路由 / connection 编排 / 端口绑定生命周期。
 * 具体逻辑已下移到 src/（config / auth / sessions / picker / commands）。
 * 安全：随机 token（启动打印）+ Origin 校验 + 命令白名单（永不转发 bash）。
 * 路由：GET /（静态前端）、WS /ws?token=、GET /api/state、GET /api/history。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import type { RawData } from "ws";
import ts from "typescript";
import { Bridge } from "./bridge.ts";
import { Hub } from "./hub.ts";
import { PORT, resolveInitialCwd } from "./src/config.ts";
import { TOKEN, allowedCommands, buildAllowedOrigins, isOriginAllowed } from "./src/auth.ts";
import { listSessions } from "./src/sessions.ts";
import { pickDirectory } from "./src/picker.ts";
import { dispatchCommand, type DashState } from "./src/commands.ts";

// PUBLIC 必须留在根 server.ts：子模块的 import.meta.dirname 指向 src/，放进去会解析成 src/public 导致静态页 404。
const PUBLIC = path.join(import.meta.dirname, "public");
// 浏览器原生 ES module 直接由服务端即时 transpile（无构建步骤）。
const FRONTEND = path.join(import.meta.dirname, "src/frontend");
let actualPort = PORT;
let allowedOrigins = buildAllowedOrigins(PORT);
const state: DashState = { cwd: resolveInitialCwd() };

const hub = new Hub();
const bridge = new Bridge({
  cwd: state.cwd,
  onEvent: (e) => hub.ingest(e),
  onStatus: (s) => hub.sys("status", s),
});
bridge.start();
bridge.handshake().then((st) => {
  hub.sys("state", st ?? {});
  console.log("[dash] pi state:", st ? `session=${st.sessionId.slice(0, 8)}… model=${st.model?.id}` : "handshake failed");
}).catch((err) => hub.sys("handshake", { error: String(err) }));

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  // 静态与 API 都过 Origin 校验（防 DNS rebinding；本地工具，够用）
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) { res.writeHead(403); res.end("forbidden"); return; }
  // token 只 gate /api/* 与 WS 升级；静态前端（/ 与 /frontend/*）免 token——
  // 浏览器加载 ES module 子资源时不会带 ?t=，在此校验会导致前端整体 401 崩坏。
  if (url.pathname.startsWith("/api/")) {
    if (url.searchParams.get("t") !== TOKEN) { res.writeHead(401); res.end("unauthorized"); return; }
    if (url.pathname === "/api/state") { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify({ state: bridge.lastState, bridge: bridge.state, cwd: state.cwd })); return; }
    if (url.pathname === "/api/history") { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(listSessions())); return; }
    res.writeHead(404); res.end(); return;
  }
  if (url.pathname.startsWith("/frontend/")) {
    const rel = decodeURIComponent(url.pathname.slice("/frontend/".length));
    const f = path.join(FRONTEND, rel);
    // 防目录穿越：解析后必须仍落在 src/frontend 内
    if (!f.startsWith(FRONTEND + path.sep) && f !== FRONTEND) { res.writeHead(403); res.end("forbidden"); return; }
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end("not found"); return; }
    if (path.extname(f) === ".ts") {
      const out = ts.transpileModule(fs.readFileSync(f, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, isolatedModules: true },
      }).outputText;
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
      res.end(out); return;
    }
    const ext = path.extname(f);
    const mime = ext === ".css" ? "text/css" : ext === ".svg" ? "image/svg+xml" : "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime + "; charset=utf-8", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(f)); return;
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
  const okOrigin = isOriginAllowed(req.headers.origin, allowedOrigins);
  if (!okToken || !okOrigin) { socket.write("HTTP/1.1 403 Forbidden\r\n\r\n"); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws: WebSocket) => wss.emit("connection", ws, req));
});

wss.on("connection", (ws: WebSocket) => {
  const off = hub.subscribe((ev) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "event", ev }));
  });
  // 补发缓冲
  const events = hub.replay(0) ?? [];
  ws.send(JSON.stringify({ type: "replay", events }));
  ws.on("message", (raw: RawData) => {
    let cmd: any;
    try { cmd = JSON.parse(raw.toString()); } catch { return; }
    if (cmd.type === "extension_ui_response") {
      bridge.respondExtensionUi(cmd.id, { value: cmd.value, confirmed: cmd.confirmed, cancelled: cmd.cancelled });
      return;
    }
    if (!allowedCommands.has(cmd.type)) { ws.send(JSON.stringify({ type: "denied", command: cmd.type })); return; }
    const p = dispatchCommand(cmd, { bridge, hub, state, pickDirectory });
    p.then((r) => ws.send(JSON.stringify({ type: "cmd_result", id: cmd.id, success: r.success, error: r.error, path: r.path })))
     .catch((err) => ws.send(JSON.stringify({ type: "cmd_result", id: cmd.id, success: false, error: String(err) })));
  });
  ws.on("close", off);
});

function tryListen(port: number) {
  actualPort = port;
  allowedOrigins = buildAllowedOrigins(port);
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
  console.log(`[dash]  cwd    ${state.cwd}`);
  console.log(`[dash]  token  ${TOKEN}`);
  console.log("[dash] ============================================");
});
