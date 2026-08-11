// 无头验证：整体注入前端脚本 + 最小 DOM 桩，用真实事件流驱动
"use strict";
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/public/index.html", "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function el(tag) {
  return {
    tagName: tag || "div", className: "", dataset: {}, style: {}, children: [],
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    _tc: "", set textContent(v){ this._tc = v; }, get textContent(){ return this._tc; },
    innerHTML: "", appendChild(c){ this.children.push(c); return c; }, append(...c){ this.children.push(...c); },
    insertBefore(c){ this.children.push(c); return c; },
    insertAdjacentHTML(){}, remove(){}, querySelector(){ return el(); }, querySelectorAll(){ return []; },
    scrollTop: 0, scrollHeight: 0, disabled: false, addEventListener(){}, onclick: null,
  };
}
const els = {};
const documentStub = {
  body: el("body"),
  querySelector(sel){ if(!els[sel]) els[sel] = el(); return els[sel]; },
  querySelectorAll(){ return []; },
  createElement(t){ return el(t); },
  addEventListener(){},
};
global.document = documentStub;
global.location = { search: "", port: "7777", hostname: "127.0.0.1", protocol: "http:" };
global.URLSearchParams = URLSearchParams;
global.WebSocket = class { constructor(){ this.readyState = 0; } };
global.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });

const run = new Function(script + "\n;return { handlePiEvent };");
const { handlePiEvent } = run();

const lines = fs.readFileSync(__dirname + "/events-live.jsonl", "utf8").split("\n").filter(Boolean);
let errs = 0, counts = {};
const all = lines.map(JSON.parse);
// 合成 toolcall 路径（覆盖历史盲区）：start → delta×3 → end → message_end(assistant 权威重建)
all.push(
  { type: "turn_start" },
  { type: "message_start", message: { role: "user", content: [{ type: "text", text: "你好" }] } },
  { type: "message_start", message: { role: "assistant", provider: "deepseek", model: "deepseek-v4-flash", content: [] } },
  { type: "message_update", assistantMessageEvent: { type: "toolcall_start" } },
  { type: "message_update", assistantMessageEvent: { type: "toolcall_delta", partial: '{"name":"bash"' } },
  { type: "message_update", assistantMessageEvent: { type: "toolcall_delta", partial: ',"input":{"command":"ls"}}' } },
  { type: "message_update", assistantMessageEvent: { type: "toolcall_end" } },
  { type: "message_end", message: { role: "assistant", stopReason: "toolUse", usage: { output: 10, cost: { total: 0.001 } },
      content: [{ type: "thinking", thinking: "合成 thinking" }, { type: "text", text: "合成文本回复" }] } },
  { type: "tool_execution_start", toolName: "bash", toolCallId: "synth-1", args: { command: "ls" } },
  { type: "tool_execution_update", toolName: "bash", toolCallId: "synth-1", partialResult: { content: [{ type: "text", text: "out\n" }] } },
  { type: "tool_execution_end", toolName: "bash", toolCallId: "synth-1", result: { content: [{ type: "text", text: "out\n" }] }, isError: false },
  { type: "agent_settled" }
);
for (const e of all) {
  counts[e.type] = (counts[e.type] || 0) + 1;
  try { handlePiEvent(e); } catch (err) { errs++; console.log("THROW @", e.type, ":", err.message.slice(0, 100)); }
}
console.log("events:", all.length, "throws:", errs);
console.log("types:", JSON.stringify(counts));
const chatfeed = els["#chatfeed"] ? els["#chatfeed"].children.length : 0;
const tlfeed = els["#tlfeed"] ? els["#tlfeed"].children.length : 0;
console.log("chatfeed children:", chatfeed, "| tlfeed children:", tlfeed);
console.log(errs === 0 ? "PASS" : "FAIL");
