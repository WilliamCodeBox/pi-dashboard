# pi-dashboard

A **local, read-only** live monitor for the [pi](https://github.com/earendil-works/pi) coding agent
(`@earendil-works/pi-coding-agent`). It renders pi's real-time run state — session, loop, tool
calls, and an event timeline — in a browser, fed by a local WebSocket bridge that talks to
`pi --mode rpc`. The browser can also send back a small whitelist of commands
(`prompt` / `steer` / `follow_up` / `abort`).

> This is a personal developer tool. It runs entirely on `localhost` and is **not** meant to be
> deployed or exposed to a network.

## Features

- Live event timeline + chat feed from pi's rpc event stream
- Architectural whiteboard (left panel) showing the pi call-flow:
  `Entry → Session → Context → THE LOOP (LLM / tools? / allowed?) → Reply / JSONL / Pipe`
- Reverse control from the browser via a command whitelist (never forwards a shell)
- **No build step** — runs TypeScript source directly with Node's type stripping

## Requirements

- **Node.js ≥ 22.6** (use `--experimental-strip-types`; Node 23+ can drop the flag)
- The **`pi` CLI** (`@earendil-works/pi-coding-agent`) installed and resolvable
  (global or local)
- `ws` — install via `npm install`

## Quick start

```bash
npm install
npm start          # = node --experimental-strip-types server.ts
```

On Windows you can also double-click `start.bat`.

Then open the URL printed in the console:

```
http://127.0.0.1:7777/?t=<TOKEN>
```

You **must** use the printed URL — it carries a random `?t=` token that is required for access.

## How it works

```
pi CLI (child process, --mode rpc, stdout NDJSON)
   │ events
   ▼
bridge.ts ──ingest──► hub.ts (event bus + broadcast)
   ▲                        │
   │ command (id-linked)    │ WS push
   │                        ▼
server.ts ◄──────────── browser (WebSocket)
```

| File | Role |
|------|------|
| `server.ts` | HTTP + WebSocket server on `127.0.0.1:7777` (override with `PI_DASH_PORT`). Generates a random token at startup; validates token + `Origin` on every request. |
| `bridge.ts` | Spawns `pi --mode rpc`, reads NDJSON events, writes JSONL commands. Resolves the pi CLI via `PI_CLI_PATH` → module resolution → `pi` on PATH (3-level fallback). Stops auto-restart if the CLI is missing. |
| `hub.ts` | In-process event bus (monotonic id + 2000-entry ring buffer). |
| `public/index.html` | Static front-end (timeline + whiteboard). `rebuild-svg.cjs` regenerates its architecture SVG — run `node rebuild-svg.cjs` after editing that script. |
| `headless-test.cjs` | Dev self-test that drives the front-end script with a real event stream (needs `events-live.jsonl`, not in this repo). |

## Configuration

| Env var | Meaning | Default |
|---------|---------|---------|
| `PI_DASH_PORT` | Listen port | `7777` |
| `PI_CLI_PATH` | Explicit path to pi's `cli.js` | Resolved via module / `pi` on PATH |

## Security & Privacy

This dashboard is **local-only by design**:

- It binds `127.0.0.1` (not `0.0.0.0`); never forward or expose the port to a network.
- Every request / WebSocket needs the random **startup token** (`?t=` / `?token=`) **and** an
  `Origin` of `localhost` / `127.0.0.1` (defense against DNS-rebinding).
- **No secrets are stored in this repo.** The token is generated at runtime and printed to your
  local console only.

**What it reads at runtime:** the dashboard lists session metadata from
`~/.pi/agent/sessions` (pi's conversation history). Keep it on your own machine.

**Repo hygiene:** `.workbuddy/` (local notes) and `node_modules/` are git-ignored.
`start.bat` uses `node` from your `PATH`; contributors should prefer `npm start`.

## Disclaimer

Unofficial community tool. Not affiliated with the pi project.

---

# pi-dashboard（中文）

一个**本地、只读**的实时监控面板，用于查看 [pi](https://github.com/earendil-works/pi) 编程智能体
（`@earendil-works/pi-coding-agent`）的运行状态。它通过本地 WebSocket 桥接 `pi --mode rpc`，
在浏览器中实时渲染 pi 的会话、主循环、工具调用和事件时间线；浏览器也可回传一小部分白名单命令
（`prompt` / `steer` / `follow_up` / `abort`）。

> 这是一个个人开发者工具。它完全运行在 `localhost` 上，**不应**被部署或暴露到网络中。

## 功能特性

- 来自 pi rpc 事件流的实时时间线 + 对话流
- 左侧架构白板，展示 pi 的调用链路：
  `入口 → 会话 → 上下文 → 主循环（LLM / 工具？ / 允许？）→ 回复 / JSONL / 通道`
- 浏览器通过命令白名单反向控制（绝不转发 shell）
- **无构建步骤** —— 借助 Node 的类型剥离直接运行 TypeScript 源码

## 环境要求

- **Node.js ≥ 22.6**（使用 `--experimental-strip-types`；Node 23+ 可省略该参数）
- 已安装且可解析的 **`pi` CLI**（`@earendil-works/pi-coding-agent`，全局或局部均可）
- `ws` —— 通过 `npm install` 安装

## 快速开始

```bash
npm install
npm start          # = node --experimental-strip-types server.ts
```

Windows 下也可以直接双击 `start.bat` 启动。

然后打开控制台打印的 URL：

```
http://127.0.0.1:7777/?t=<TOKEN>
```

你**必须**使用控制台打印出来的这个 URL —— 其中携带的随机 `?t=` token 是访问必需的凭证。

## 工作原理

```
pi CLI（子进程，--mode rpc，stdout 输出 NDJSON）
   │ 事件
   ▼
bridge.ts ──接入──► hub.ts（事件总线 + 广播）
   ▲                        │
   │ 命令（按 id 关联）      │ WebSocket 推送
   │                        ▼
server.ts ◄──────────── 浏览器（WebSocket）
```

| 文件 | 作用 |
|------|------|
| `server.ts` | 监听 `127.0.0.1:7777` 的 HTTP + WebSocket 服务（可用 `PI_DASH_PORT` 覆盖）。启动时生成随机 token；对每个请求校验 token 与 `Origin`。 |
| `bridge.ts` | 启动 `pi --mode rpc`，读取 NDJSON 事件、写入 JSONL 命令。解析 pi CLI 路径采用三级回退：`PI_CLI_PATH` → 模块解析 → PATH 中的 `pi`。CLI 缺失时停止自动重启。 |
| `hub.ts` | 进程内事件总线（单调 id + 2000 条环形缓冲）。 |
| `public/index.html` | 静态前端（时间线 + 白板）。`rebuild-svg.cjs` 负责重新生成其中的架构 SVG —— 修改该脚本后运行 `node rebuild-svg.cjs`。 |
| `headless-test.cjs` | 开发自测脚本，用真实事件流驱动前端（依赖仓库外的 `events-live.jsonl`）。 |

## 配置项

| 环境变量 | 含义 | 默认值 |
|---------|---------|---------|
| `PI_DASH_PORT` | 监听端口 | `7777` |
| `PI_CLI_PATH` | pi 的 `cli.js` 显式路径 | 经模块解析 / PATH 中的 `pi` 推断 |

## 安全与隐私

本面板**从设计上仅限本地使用**：

- 绑定 `127.0.0.1`（而非 `0.0.0.0`）；切勿将端口转发或暴露到网络。
- 每个请求 / WebSocket 都需携带随机的**启动 token**（`?t=` / `?token=`）**且** `Origin` 为
  `localhost` / `127.0.0.1`（防御 DNS rebinding 攻击）。
- **本仓库不存储任何密钥。** token 仅在运行时生成并打印到你的本地控制台。

**运行时读取内容：** 面板会从 `~/.pi/agent/sessions`（pi 的会话历史）读取会话元数据。请保留在你自己的机器上。

**仓库卫生：** `.workbuddy/`（本地笔记）与 `node_modules/` 已被 git 忽略。
`start.bat` 使用 `PATH` 中的 `node`；贡献者建议优先使用 `npm start`。

## 免责声明

非官方社区工具，与 pi 项目无隶属关系。
