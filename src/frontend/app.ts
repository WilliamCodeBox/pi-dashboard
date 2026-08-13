/**
 * app.ts — 前端引导（浏览器原生 ES module，由 server.ts 的 /frontend 路由现场 transpile）
 * 顺序：构建架构图 → 绑定语言按钮 → 连 WS → 项目/历史控件 → 首屏 /api/state → 输入 → demo → 初始化 i18n/筛选。
 * 逐段搬自 public/index.html 内联 script 尾部的绑定与初始化代码，行为保持不变。
 */
import { buildArch, pushEvent, refreshArchI18n, updateSessionCount } from "./arch.ts";
import { currentLang, I18N, initLang, setLang, stageLabel } from "./i18n.ts";
import { connect, wsSend, wsSendCmd } from "./ws-client.ts";
import {
  $,
  addToolCard,
  addUserMsg,
  applyTlFilterFromChips,
  confirmTextForPath,
  esc,
  hasHistory,
  initTlFilter,
  isAgentBusy,
  isDemoMode,
  loadInitialState,
  msgAssistantEnd,
  msgStartAssistant,
  msgTextDelta,
  msgThinkingDelta,
  msgThinkingStart,
  refreshHistory,
  renderHistory,
  renderRecentProjects,
  setAgentBusy,
  setDemoMode,
  setHistScope,
  setState,
  tlRow,
  getCurrentProject,
} from "./render.ts";

/* ============ 首屏：运行时构建架构图（原内联 SVG 的替代） ============ */
buildArch();

/* ============ 中英文切换 ============ */
$("#btn-lang").addEventListener("click", () => {
  const cur = currentLang();
  setLang(cur === "en" ? "zh" : "en");
  refreshArchI18n();
});

/* ============ WS 连接 ============ */
connect();

/* ============ 项目目录控制 + 历史会话 ============ */
let pendingProjectPath = "";
$("#projctl").addEventListener("click", () => {
  const pp = $("#projpop");
  pp.hidden = !pp.hidden;
  if (!pp.hidden) {
    const i = $<HTMLInputElement>("#projinput");
    i.value = getCurrentProject() || "";
    i.focus();
    i.select();
    if (!hasHistory()) refreshHistory();
    renderRecentProjects();
  }
});
$("#proj-browse").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("#proj-browse");
  const old = btn.textContent;
  const en = currentLang() === "en";
  btn.disabled = true;
  btn.textContent = en ? I18N.en["ui.browseOpening"] || "Opening…" : I18N.zh["ui.browseOpening"] || "打开中…";
  const r = await wsSendCmd({ type: "pick_directory" });
  btn.disabled = false;
  btn.textContent = old;
  if (r && r.success && r.path) {
    const i = $<HTMLInputElement>("#projinput");
    if (i) { i.value = r.path; i.focus(); i.select(); }
  } else if (r && r.error && r.error !== "已取消") {
    alert((en ? "Browse failed: " : "浏览选择失败：") + r.error);
  }
});
$("#proj-cancel").addEventListener("click", () => {
  $("#projpop").hidden = true;
});
$("#proj-apply").addEventListener("click", () => {
  const p = $<HTMLInputElement>("#projinput").value.trim();
  if (!p) return;
  $("#projpop").hidden = true;
  pendingProjectPath = p;
  $("#confirmtext").textContent = confirmTextForPath(p);
  $("#confirmbox").hidden = false;
});
$("#confirm-no").addEventListener("click", () => {
  $("#confirmbox").hidden = true;
  pendingProjectPath = "";
});
$("#confirm-yes").addEventListener("click", async () => {
  $("#confirmbox").hidden = true;
  const p = pendingProjectPath;
  pendingProjectPath = "";
  if (!p) return;
  const r = await wsSendCmd({ type: "set_project", cwd: p });
  if (r && r.success) refreshHistory();
  else alert("切换失败：" + ((r && r.error) || "未知错误"));
});
document.querySelectorAll<HTMLElement>(".coltab").forEach((t) =>
  t.addEventListener("click", () => {
    document.querySelectorAll(".coltab").forEach((x) => x.classList.toggle("on", x === t));
    $("#tlcol").dataset.tab = t.dataset.tab;
    if (t.dataset.tab === "history") refreshHistory();
  })
);
document.querySelectorAll<HTMLElement>("#histfilters .chip").forEach((c) =>
  c.addEventListener("click", () => {
    document.querySelectorAll("#histfilters .chip").forEach((x) => x.classList.toggle("on", x === c));
    setHistScope(c.dataset.scope as string);
    renderHistory();
  })
);

/* ============ 首屏状态 ============ */
loadInitialState();

/* ============ 输入：prompt / steer / follow_up ============ */
function sendInput(v: string, behavior: string | null): void {
  if (isDemoMode()) {
    addUserMsg(v);
    return;
  }
  if (isAgentBusy() && !behavior) behavior = "steer";
  wsSend({ type: behavior === "followUp" ? "follow_up" : behavior === "steer" ? "steer" : "prompt", message: v });
  $("#modehint").textContent = behavior === "followUp" ? "follow_up" : behavior === "steer" ? "steer" : "prompt";
}
$("#btn-send").addEventListener("click", (e: MouseEvent) => {
  const box = $<HTMLInputElement>("#msgbox");
  const v = box.value.trim();
  if (!v) return;
  box.value = "";
  sendInput(v, e.altKey || e.ctrlKey ? "followUp" : null);
});
$("#msgbox").addEventListener("keydown", (ev: Event) => {
  const e = ev as KeyboardEvent;
  if (e.key !== "Enter") return;
  e.preventDefault();
  const box = $<HTMLInputElement>("#msgbox");
  const v = box.value.trim();
  if (!v) return;
  box.value = "";
  sendInput(v, e.altKey || e.ctrlKey ? "followUp" : null);
});
document.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    wsSend({ type: "abort" });
    stageLabel("ABORT 已发送");
  }
});

/* ============ DEMO（离线演示，与真实事件同管线） ============ */
$("#btn-demo").onclick = async () => {
  if (isDemoMode()) return;
  setDemoMode(true);
  setAgentBusy(true);
  setState("busy");
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  pushEvent({ stage: "turn_start" });
  tlRow("turn", "TURN·START", "turn 1 begin (demo)");
  addUserMsg("在 demo-repo 里修复失败的测试：tests/app_test.py::test_login");
  await sleep(400);
  pushEvent({ stage: "user_in" });
  tlRow("meta", "USER·IN", "demo");
  await sleep(500);
  pushEvent({ stage: "llm_start" });
  msgStartAssistant();
  tlRow("llm", "LLM·START", "deepseek-v4-flash · demo");
  const th = "先看测试内容定位失败原因：test_login 断言 302 跳转，但实现返回 200。";
  msgThinkingStart();
  for (let i = 0; i < th.length; i += 3) { msgThinkingDelta(th.slice(i, i + 3)); await sleep(12); }
  tlRow("think", "THINK·DELTA", "", "think");
  const r1 = "我来定位这个问题。先看测试文件和登录路由。";
  for (let i = 0; i < r1.length; i += 2) { msgTextDelta(r1.slice(i, i + 2)); await sleep(20); }
  tlRow("llm", "LLM·DELTA", "", "llm");
  await sleep(300);
  pushEvent({ stage: "tool_gate_pending" });
  tlRow("gate", "GATE·PENDING", "tool_call: bash (demo)");
  await sleep(400);
  const b = addToolCard("bash", { command: "cat tests/app_test.py" }, "demo-1");
  pushEvent({ stage: "tool_start" });
  b.stat.classList.add("run");
  b.stxt.textContent = "RUNNING";
  pushEvent({ stage: "tool_run", toolName: "bash" });
  for (const ln of ["$ cat tests/app_test.py", "def test_login(client):", "    assert r.status_code == 302"]) {
    b.body.insertAdjacentHTML("beforeend", "\n" + esc(ln));
    await sleep(120);
  }
  pushEvent({ stage: "tool_end_ok" });
  b.stat.classList.remove("run");
  b.stat.classList.add("ok");
  b.stxt.textContent = "OK";
  tlRow("tool", "TOOL·END", "bash · exit 0 · demo");
  await sleep(300);
  pushEvent({ stage: "tool_gate_pending" });
  tlRow("gate", "GATE·PENDING", "tool_call: write (demo)");
  const w = addToolCard("write", { path: "app.py" }, "demo-2");
  pushEvent({ stage: "tool_start" });
  await sleep(300);
  pushEvent({ stage: "tool_end_err" });
  w.stat.classList.add("err");
  w.stxt.textContent = "BLOCKED";
  w.card.classList.add("err");
  w.body.insertAdjacentHTML("beforeend", "\n[blocked] 扩展 protected-paths: 路径受保护");
  tlRow("err", "ERR·BLOCKED", "write blocked → tool result · demo");
  await sleep(400);
  pushEvent({ stage: "turn_end" });
  tlRow("turn", "TURN·END", "demo");
  await sleep(400);
  pushEvent({ stage: "retry_wait" });
  setState("wait");
  tlRow("gate", "RETRY", "provider rate-limit · demo");
  await sleep(900);
  setState("busy");
  const r2 = "修复完成：login 返回 302。";
  msgStartAssistant();
  for (let i = 0; i < r2.length; i += 2) { msgTextDelta(r2.slice(i, i + 2)); await sleep(20); }
  msgAssistantEnd({ stopReason: "stop", usage: { output: 42, cost: { total: 0.0002 } } });
  tlRow("llm", "LLM·END", "stop · 42 tok · demo");
  await sleep(300);
  pushEvent({ stage: "session_write" });
  tlRow("meta", "SESSION", "JSONL +1 · demo");
  updateSessionCount(6);
  await sleep(300);
  pushEvent({ stage: "settled" });
  tlRow("turn", "AGENT·SETTLED", "demo done");
  setState("idle");
  setAgentBusy(false);
  setDemoMode(false);
};
document.querySelectorAll<HTMLElement>("[data-st]").forEach((b) => b.addEventListener("click", () => setState(b.dataset.st as string)));
document.querySelectorAll<HTMLElement>(".chip").forEach((c) =>
  c.addEventListener("click", () => {
    c.classList.toggle("on");
    applyTlFilterFromChips();
  })
);

/* ============ 初始化语言（记忆上次选择，默认中文） ============ */
initLang();
refreshArchI18n();

/* ============ 初始化时间线筛选（记忆上次选择，默认全开） ============ */
initTlFilter();
