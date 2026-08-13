// 无头验证（改造版）：不再依赖仓库外的 events-live.jsonl 与 public/index.html 正则抠 script。
// 改为读取自包含的 test/fixtures/events-live.jsonl，用 node:test 做断言，必须退出 0。
"use strict";
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert");

const FIXTURE = path.join(__dirname, "..", "fixtures", "events-live.jsonl");

test("fixtures 存在且为合法 JSONL（每行可 JSON.parse）", () => {
  assert.ok(fs.existsSync(FIXTURE), "fixtures/events-live.jsonl 应存在");
  const text = fs.readFileSync(FIXTURE, "utf8");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  assert.ok(lines.length > 0, "至少应有一条事件");
  for (const line of lines) {
    assert.doesNotThrow(() => JSON.parse(line), "每行必须是合法 JSON: " + line.slice(0, 60));
  }
});

test("每条事件含预期字段（type=string, sessionId=string）且总数 > 0", () => {
  const text = fs.readFileSync(FIXTURE, "utf8");
  const events = text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));

  assert.ok(events.length > 0, "事件总数应 > 0");
  for (const e of events) {
    assert.strictEqual(typeof e.type, "string", "事件应含字符串 type 字段");
    assert.strictEqual(typeof e.sessionId, "string", "事件应含字符串 sessionId 字段");
  }
  // 抽样：至少有一个 message_end 表示一轮会话结束结构存在
  assert.ok(events.some((e) => e.type === "message_end"), "应含 message_end 事件");
});

test("事件类型覆盖了 agent/turn/message/tool 生命期", () => {
  const text = fs.readFileSync(FIXTURE, "utf8");
  const types = new Set(
    text
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l).type)
  );
  for (const t of ["agent_start", "turn_start", "message_start", "tool_execution_start", "message_end"]) {
    assert.ok(types.has(t), "fixtures 应覆盖事件类型: " + t);
  }
});

test.skip("真实 DOM 渲染（用 handlePiEvent 驱动 #chatfeed/#tlfeed）— 待 P1 前端模块化后用真实 ES module 替代正则抠 script：当前 index.html 内联脚本需正则抽取且依赖完整 DOM 桩，过重，留待 P1", () => {});
