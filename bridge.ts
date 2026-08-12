/**
 * bridge.ts — pi 子进程桥（阶段1）
 * 职责：spawn `pi --mode rpc`，读 stdout NDJSON 事件，写 stdin JSONL 命令，
 *       get_state 握手，命令 id 关联，extension_ui_request 应答/超时取消，
 *       stderr 常开排空，异常重启（指数退避）。
 * 事实依据：phase0 验证报告（0.84.1 实测）。
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";

export interface CliResolution {
  /** spawn 的第一个参数：node 可执行文件，或 'pi' 命令名 */
  command: string;
  /** 紧跟 command 之后的参数（如解析到的 cli.js 路径）；不含 --mode rpc */
  cliArgs: string[];
}

/**
 * 解析 pi CLI 的启动方式，三级回退：
 *  a. PI_CLI_PATH 环境变量（保留覆盖能力，视为 .js 文件，用 node 启动）
 *  b. ESM 模块解析 require.resolve('@earendil-works/pi-coding-agent/dist/cli.js')
 *  c. 兜底到 PATH 中的 'pi' 命令
 * 解析阶段吞掉模块解析异常，永不抛未捕获异常；极端情况下由调用方给出清晰报错。
 */
export function resolveCliPath(): CliResolution {
  const envPath = process.env.PI_CLI_PATH;
  if (envPath) {
    return { command: process.execPath, cliArgs: [envPath] };
  }
  try {
    const require = createRequire(import.meta.url);
    const resolved = require.resolve("@earendil-works/pi-coding-agent/dist/cli.js");
    return { command: process.execPath, cliArgs: [resolved] };
  } catch {
    return { command: "pi", cliArgs: [] };
  }
}

export interface BridgeOptions {
  cwd: string;
  onEvent: (e: any) => void;
  onStatus: (s: { state: string; detail?: string }) => void;
  extUiTimeoutMs?: number; // extension_ui_request 自动取消兜底
}

export class Bridge {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buf = "";
  private cmdSeq = 0;
  private pending = new Map<string, { resolve: (r: any) => void; timer: NodeJS.Timeout }>();
  private extPending = new Map<string, NodeJS.Timeout>();
  private closed = false;
  private restartDelay = 500;
  private opts: BridgeOptions;
  state: "stopped" | "starting" | "running" | "restarting" | "dead" = "stopped";
  lastState: any = null;

  constructor(opts: BridgeOptions) {
    this.opts = opts;
  }

  start() {
    this.closed = false;
    this.spawnChild();
  }

  /** 切换工作目录并重启 pi 子进程（UI 切换项目用） */
  restart(dir?: string) {
    if (dir) this.opts.cwd = dir;
    this.rejectAll();
    if (this.child) {
      this.child.removeAllListeners();
      try { this.child.kill(); } catch { /* noop */ }
      this.child = null;
    }
    this.closed = false;
    this.restartDelay = 500;
    this.spawnChild();
  }

  private spawnChild() {
    this.state = "starting";
    this.opts.onStatus({ state: this.state, detail: "spawning pi --mode rpc" });
    const cli = resolveCliPath();
    const child = spawn(cli.command, [...cli.cliArgs, "--mode", "rpc"], {
      cwd: this.opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: false,
    });
    this.child = child;
    this.buf = "";

    // stdout: NDJSON 事件流（严格 LF 分帧；不依赖 readline，防 U+2028/2029 碎行）
    child.stdout.on("data", (d: Buffer) => {
      this.buf += d.toString("utf8");
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (!line) continue;
        let e: any;
        try { e = JSON.parse(line); } catch { this.opts.onStatus({ state: "running", detail: "bad json line" }); continue; }
        this.route(e);
      }
      if (this.state !== "running") { this.state = "running"; this.opts.onStatus({ state: "running" }); }
    });

    // stderr: 必须常开读取（诊断/扩展加载错误都在这；不排空会憋死 pi）
    child.stderr.on("data", (d: Buffer) => {
      const t = d.toString("utf8").trim();
      if (t) this.opts.onStatus({ state: "running", detail: "stderr: " + t.slice(0, 400) });
    });

    child.on("error", (err) => {
      // ENOENT：命令/脚本不存在（如 'pi' 不在 PATH，或 PI_CLI_PATH 指向缺失文件）。
      // 属环境级错误，无限重启无意义；给出清晰提示并停止自动重启。
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        console.error(
          "[bridge] 找不到 pi CLI，无法启动（" + err.message + "）。\n" +
          "  请设置环境变量 PI_CLI_PATH 指向 cli.js，或确保 pi 已安装且在 PATH 中。"
        );
        this.opts.onStatus({ state: "dead", detail: "pi CLI not found — 已停止自动重启" });
        return;
      }
      this.opts.onStatus({ state: "dead", detail: "spawn error: " + err.message });
      this.scheduleRestart();
    });
    child.on("exit", (code, signal) => {
      this.opts.onStatus({ state: "dead", detail: `pi exited code=${code} signal=${signal}` });
      this.rejectAll();
      if (!this.closed) this.scheduleRestart();
    });
  }

  private scheduleRestart() {
    if (this.closed) return;
    this.state = "restarting";
    this.opts.onStatus({ state: "restarting", detail: `retry in ${this.restartDelay}ms` });
    setTimeout(() => { if (!this.closed) { this.restartDelay = Math.min(this.restartDelay * 2, 15000); this.spawnChild(); } }, this.restartDelay);
  }

  private route(e: any) {
    switch (e.type) {
      case "response": {
        const p = this.pending.get(e.id);
        if (p) { clearTimeout(p.timer); this.pending.delete(e.id); p.resolve(e); }
        break;
      }
      case "extension_ui_request": {
        // 转发给前端；超时未答自动 cancelled
        const t = setTimeout(() => {
          this.extPending.delete(e.id);
          this.send({ type: "extension_ui_response", id: e.id, cancelled: true });
          this.opts.onStatus({ state: "running", detail: `ext_ui ${e.method} timed out → cancelled` });
        }, this.opts.extUiTimeoutMs ?? 60000);
        this.extPending.set(e.id, t);
        this.opts.onEvent(e);
        break;
      }
      default:
        this.opts.onEvent(e);
    }
  }

  /** 应答扩展 UI 请求（由前端交互触发） */
  respondExtensionUi(id: string, data: { value?: string; confirmed?: boolean; cancelled?: boolean }) {
    const t = this.extPending.get(id);
    if (t) { clearTimeout(t); this.extPending.delete(id); }
    this.send({ type: "extension_ui_response", id, ...data });
  }

  /** 命令通道：id 关联 + 超时 */
  sendCommand(type: string, payload: Record<string, unknown> = {}, timeoutMs = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = "d" + String(++this.cmdSeq);
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`command ${type} timeout`)); }, timeoutMs);
      this.pending.set(id, { resolve, timer });
      this.send({ id, type, ...payload });
    });
  }

  private send(obj: any) {
    if (!this.child || this.child.stdin.destroyed) return;
    // stdin 永不主动关闭（EOF 会触发 pi 优雅退出）
    this.child.stdin.write(JSON.stringify(obj) + "\n");
  }

  /** 握手：get_state（rpc 无 header，会话身份唯一来源） */
  async handshake() {
    const r = await this.sendCommand("get_state");
    this.lastState = r.data ?? null;
    return r.data;
  }

  prompt(message: string, streamingBehavior?: "steer" | "followUp") {
    return this.sendCommand("prompt", { message, ...(streamingBehavior ? { streamingBehavior } : {}) });
  }
  steer(message: string) { return this.sendCommand("steer", { message }); }
  followUp(message: string) { return this.sendCommand("follow_up", { message }); }
  abort() { return this.sendCommand("abort", {}, 10000); }

  private rejectAll() {
    for (const [, p] of this.pending) { clearTimeout(p.timer); p.resolve({ type: "response", success: false, error: "pi exited" }); }
    this.pending.clear();
    for (const [, t] of this.extPending) clearTimeout(t);
    this.extPending.clear();
  }

  stop() {
    this.closed = true;
    try { this.child?.kill(); } catch { /* noop */ }
  }
}
