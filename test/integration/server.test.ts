/**
 * server.test.ts — P1 重构前的占位骨架。必须永远不失败（不 import server.ts，避免起监听端口）。
 *
 * 计划中的端到端用例（P1 重构 server.ts 使 HTTP/WS 可注入、pi 子进程可 mock 后落地）：
 *   1. 用假 pi 子进程（stdout 吐 NDJSON 事件、stdin 收 JSONL 命令并应答 response）替代真实 `pi`。
 *   2. 启动 server.ts 监听在随机空闲端口（注入假子进程 + 测试用 token/origin）。
 *   3. 自写 WS 客户端带 token 连 /ws，断言：收到 replay 帧、能驱动 prompt 命令拿到 cmd_result、
 *      command 白名单拒绝未授权命令、Origin 校验拒绝跨站。
 *   4. 断言 GET /api/state、/api/history 返回预期 JSON。
 */
import test from "node:test";

test(
  "TODO: end-to-end — 假 pi 子进程 + 自写 WS 客户端驱动 server.ts",
  { skip: true },
  () => {
    // 占位：P1 重构后在此实现真实端到端驱动。当前阶段仅占位，永远不执行体、不失败。
  }
);
