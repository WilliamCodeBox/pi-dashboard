/**
 * render.ts — 把 pi 事件渲染进 UI
 * 逐段搬自 public/index.html 内联 script：时间线（#tlfeed）、对话（#chatfeed）、工具卡、
 * extension UI 交互卡、全局状态位、项目目录标签与历史会话列表、事件归一化 handlePiEvent/safeHandle。
 * 只做 DOM 渲染与状态维护；WS 收发在 ws-client.ts，图形动画在 arch.ts。
 */
import { I18N } from "./i18n.ts";
import { pushEvent, hot, streamBit, setArchStatusHtml, updateSessionCount } from "./arch.ts";
import { TOKEN, wsSend } from "./ws-client.ts";

/* ============ 小工具 ============ */
/** 与搬移前的 `$` 等价；调用点均确信元素存在，故按非空返回以保持原逻辑形状 */
export function $<T extends Element = HTMLElement>(sel: string): T {
  return document.querySelector(sel) as unknown as T;
}
export const esc = (s: unknown): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ============ 状态 ============ */
let evCount = 0;
const agg: Record<string, number> = { llm: 0, think: 0 };
let tlFilter = new Set<string | undefined>(["all", "llm", "tool", "gate", "turn", "err"]);
let agentBusy = false;
let demoMode = false;
let msgCount = 0;

export const isAgentBusy = (): boolean => agentBusy;
export const setAgentBusy = (v: boolean): void => {
  agentBusy = v;
};
export const isDemoMode = (): boolean => demoMode;
export const setDemoMode = (v: boolean): void => {
  demoMode = v;
};

/* ============ 时间线 ============ */
export function tlRow(kind: string, tag: string, sum: string, aggKey?: string | null): void {
  if (aggKey) {
    agg[aggKey]++;
    tlAggRefresh(aggKey);
    return;
  }
  evCount++;
  const feed = $("#tlfeed");
  const row = document.createElement("div");
  row.className = "tlrow";
  row.dataset.kl = kind;
  row.style.display = tlRowMatches(kind) ? "" : "none";
  row.innerHTML = `<span class="num">${String(evCount).padStart(3, "0")}</span><span class="ts">${new Date().toTimeString().slice(0, 8)}</span><span class="tag">${tag}</span><span class="sum"></span>`;
  (row.querySelector(".sum") as HTMLElement).textContent = sum;
  row.onclick = () => {
    document.querySelectorAll(".tlrow.sel").forEach((r) => r.classList.remove("sel"));
    row.classList.add("sel");
    const map: Record<string, string> = { llm: "llm", think: "llm", tool: "tools", gate: "q-allowed", err: "q-allowed", turn: "loop", meta: "session" };
    const t = map[kind];
    if (t) hot(`[data-node="${t}"]`, "hot", 1500);
  };
  feed.appendChild(row);
  feed.scrollTop = feed.scrollHeight;
  if (feed.children.length % 8 === 0) {
    const r = document.createElement("div");
    r.className = "ruler";
    feed.appendChild(r);
  }
  $("#tlcount").textContent = evCount + " EV";
}

function tlRowMatches(kind: string | undefined): boolean {
  if (tlFilter.has("all")) return true;
  return tlFilter.has(kind);
}

export function tlApplyFilter(): void {
  document.querySelectorAll<HTMLElement>("#tlfeed .tlrow").forEach((r) => {
    const kind = r.dataset.kl || r.dataset.k;
    r.style.display = tlRowMatches(kind) ? "" : "none";
  });
}

let aggRow: HTMLElement | null = null;
function tlAggRefresh(key: string): void {
  const label = key === "llm" ? "LLM·DELTA" : "THINK·DELTA";
  if (!aggRow || aggRow.dataset.k !== key) {
    aggRow = document.createElement("div");
    aggRow.className = "tlrow agg";
    aggRow.dataset.k = key;
    aggRow.innerHTML = `<span class="num">~</span><span class="ts"></span><span class="tag">${label}</span><span class="sum"></span>`;
    (aggRow.querySelector(".ts") as HTMLElement).textContent = new Date().toTimeString().slice(0, 8);
    $("#tlfeed").appendChild(aggRow);
  }
  aggRow.style.display = tlRowMatches(key) ? "" : "none";
  (aggRow.querySelector(".sum") as HTMLElement).textContent = (key === "llm" ? "text_delta" : "thinking_delta") + " ×" + agg[key];
}

/** 点 chip 后按 .chip.on 重建筛选集并持久化 */
export function applyTlFilterFromChips(): void {
  tlFilter = new Set([...document.querySelectorAll<HTMLElement>(".chip.on")].map((x) => x.dataset.f));
  tlApplyFilter();
  try {
    localStorage.setItem("pidash-tlfilter", JSON.stringify([...tlFilter]));
  } catch {
    /* 忽略 */
  }
}

/** 初始化时间线筛选（记忆上次选择，默认全开） */
export function initTlFilter(): void {
  try {
    const s = localStorage.getItem("pidash-tlfilter");
    if (s) {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        tlFilter = new Set(arr);
        document.querySelectorAll<HTMLElement>(".chip").forEach((c) => c.classList.toggle("on", tlFilter.has(c.dataset.f)));
        tlApplyFilter();
      }
    }
  } catch {
    /* 忽略 */
  }
}

/* ============ 对话渲染 ============ */
interface MsgCtx {
  root: HTMLElement;
  caret: HTMLElement | null;
  toolPend: HTMLElement | null;
  stream: HTMLElement | null;
  thinking: HTMLElement | null;
}
let cur: MsgCtx | null = null; // 当前 assistant 消息上下文

function chatClearEmpty(): void {
  const e = $("#chatfeed .empty");
  if (e) e.remove();
}
export function addUserMsg(text: string): void {
  chatClearEmpty();
  const d = document.createElement("div");
  d.className = "msg user";
  d.textContent = text;
  $("#chatfeed").appendChild(d);
  $("#chatfeed").scrollTop = 1e9;
}
export function msgStartAssistant(): void {
  chatClearEmpty();
  const m = document.createElement("div");
  m.className = "msg assistant";
  const caret = document.createElement("span");
  caret.className = "caret";
  m.appendChild(caret);
  cur = { root: m, caret, toolPend: null, stream: null, thinking: null };
  $("#chatfeed").appendChild(m);
  $("#chatfeed").scrollTop = 1e9;
}
export function msgTextDelta(delta: string): void {
  if (!cur) msgStartAssistant();
  const c = cur as MsgCtx;
  if (!c.stream) {
    c.stream = document.createElement("span");
    c.root.insertBefore(c.stream, c.caret);
  }
  c.stream.append(delta);
  $("#chatfeed").scrollTop = 1e9;
}
export function msgThinkingStart(): void {
  if (!cur) msgStartAssistant();
}
export function msgThinkingDelta(delta: string): void {
  if (!cur) msgStartAssistant();
  const c = cur as MsgCtx;
  if (!c.thinking) {
    const d = document.createElement("details");
    d.className = "think";
    d.innerHTML = `<summary>THINKING</summary><div class="body"></div>`;
    c.thinking = d;
    c.root.insertBefore(d, c.caret);
  }
  (c.thinking.querySelector(".body") as HTMLElement).textContent += delta;
  $("#chatfeed").scrollTop = 1e9;
}
function msgToolcallStart(): void {
  if (!cur) msgStartAssistant();
  const c = cur as MsgCtx;
  if (!c.toolPend) {
    c.toolPend = document.createElement("div");
    c.toolPend.className = "think";
    c.toolPend.innerHTML = "<summary>TOOLCALL · 等待工具名…</summary><div class=\"body\"></div>";
    c.root.insertBefore(c.toolPend, c.caret);
  }
}
function msgToolcallDelta(p: string): void {
  const b = cur && cur.toolPend && (cur.toolPend.querySelector(".body") as HTMLElement | null);
  if (b) b.textContent = p;
}
export function msgAssistantEnd(message: any): void {
  if (!cur) return;
  // 权威消息重建：移除流式 span，按 content 块重建
  const blocks = (message.content || []).filter((c: any) => c.type === "text" || c.type === "thinking");
  const text = blocks.filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  const thinking = blocks.filter((c: any) => c.type === "thinking").map((c: any) => c.thinking).join("\n");
  cur.stream?.remove();
  cur.stream = null;
  if (cur.thinking) {
    (cur.thinking.querySelector(".body") as HTMLElement).textContent = thinking;
    (cur.thinking.querySelector("summary") as HTMLElement).textContent = `THINKING · ${thinking.length} chars`;
  }
  const tspan = document.createElement("span");
  tspan.textContent = text;
  cur.root.insertBefore(tspan, cur.caret);
  cur.caret?.remove();
  cur.caret = null;
  const foot = document.createElement("span");
  foot.className = "foot";
  foot.textContent = `stopReason=${message.stopReason ?? "?"} · ${message.usage?.output ?? 0} tok out · cost $${(message.usage?.cost?.total ?? 0).toFixed(6)}`;
  cur.root.appendChild(foot);
  $("#chatfeed").scrollTop = 1e9;
}
function msgToolResultEnd(message: any): void {
  // toolResult message_end → 挂到最近工具卡
  const cards = [...document.querySelectorAll<HTMLElement>(".toolcard")];
  const card = cards[cards.length - 1];
  if (card) {
    const body = card.querySelector(".tcbody") as HTMLElement;
    const txt = (message.content || []).map((c: any) => c.text || "").join("");
    body.insertAdjacentHTML("beforeend", "\n" + esc(txt).slice(0, 2000));
    if (message.isError) card.classList.add("err");
  }
}

let toolSeq = 0;
export interface ToolCardRefs {
  card: HTMLElement;
  body: HTMLElement;
  stat: HTMLElement;
  stxt: HTMLElement;
}
export function addToolCard(name: string, args: any, toolCallId?: string): ToolCardRefs {
  chatClearEmpty();
  const d = document.createElement("div");
  d.className = "toolcard";
  d.dataset.tcid = toolCallId || "";
  const argTxt = args ? JSON.stringify(args) : "";
  d.innerHTML = `<div class="tchead"><span class="tid">#${String(++toolSeq).padStart(2, "0")}</span><span class="tname">${esc(name)}</span><span class="tstat"><span class="sd"></span><span class="stxt">PENDING</span></span></div><div class="tcbody">${esc(argTxt)}</div>`;
  $("#chatfeed").appendChild(d);
  $("#chatfeed").scrollTop = 1e9;
  return {
    card: d,
    body: d.querySelector(".tcbody") as HTMLElement,
    stat: d.querySelector(".tstat") as HTMLElement,
    stxt: d.querySelector(".stxt") as HTMLElement,
  };
}

/* ============ 全局状态 ============ */
const STATELABEL: Record<string, string> = { idle: "IDLE", busy: "BUSY", wait: "WAITING", err: "ERROR" };
export function setState(st: string): void {
  document.body.className = "st-" + st;
  $("#statustext").textContent = STATELABEL[st];
}

/* ============ 真实事件归一化（pi → dashboard） ============ */
export function handlePiEvent(raw: any): void {
  const piType = raw && typeof raw === "object" ? raw.piType : null;
  let e = raw;
  if (e && typeof e === "object" && e.piType && e.data) e = e.data; // 解包 hub 的 DashboardEvent {piType,data}
  if (piType && typeof piType === "string" && piType.startsWith("sys.")) {
    handleSys(piType.slice(4), e);
    return;
  }
  const t = e.type;
  switch (t) {
    case "agent_start": agentBusy = true; setState("busy"); tlRow("turn", "AGENT·START", "run begin"); break;
    case "turn_start": pushEvent({ stage: "turn_start" }); tlRow("turn", "TURN·START", "turn begin"); break;
    case "turn_end": pushEvent({ stage: "turn_end" }); tlRow("turn", "TURN·END", e.message?.content?.length ? "turn end" : ""); break;
    case "message_start": {
      const role = e.message?.role;
      if (role === "user") {
        pushEvent({ stage: "user_in" });
        tlRow("meta", "USER·IN", "user message");
        addUserMsg((e.message.content || []).map((c: any) => c.text || "").join("") || "…");
      } else if (role === "assistant") {
        pushEvent({ stage: "llm_start" });
        msgStartAssistant();
        tlRow("llm", "LLM·START", `${e.message?.provider ?? ""} ${e.message?.model ?? ""}`);
        const p = e.message?.provider, m = e.message?.model;
        if (p && m) $("#modelbadge").textContent = `${p} · ${m}`;
      } else tlRow("meta", "MSG·START", role ?? "");
      break;
    }
    case "message_update": {
      const s = e.assistantMessageEvent;
      if (!s) break;
      switch (s.type) {
        case "text_start": break;
        case "text_delta": msgTextDelta(s.delta ?? ""); streamBit("llm", "breath", true); tlRow("llm", "LLM·DELTA", "", "llm"); break;
        case "text_end": break;
        case "thinking_start": msgThinkingStart(); streamBit("llm", "cyan", true); break;
        case "thinking_delta": msgThinkingDelta(s.delta ?? ""); tlRow("think", "THINK·DELTA", "", "think"); break;
        case "thinking_end": break;
        case "toolcall_start": pushEvent({ stage: "toolcall" }); msgToolcallStart(); tlRow("tool", "TOOLCALL", "assistant 声明工具调用"); break;
        case "toolcall_delta": msgToolcallDelta(s.partial ?? ""); break;
        case "toolcall_end": if (cur && cur.toolPend) cur.toolPend.remove(); break;
        default: break;
      }
      break;
    }
    case "message_end": {
      const m = e.message;
      const role = m?.role;
      if (role === "assistant") {
        pushEvent({ stage: "llm_end" });
        msgAssistantEnd(m);
        tlRow("llm", "LLM·END", `${m.stopReason ?? "?"} · ${m.usage?.output ?? 0} tok · $${(m.usage?.cost?.total ?? 0).toFixed(4)}`);
        msgCount++;
        updateSessionCount(msgCount);
      } else if (role === "toolResult") {
        msgToolResultEnd(m);
        tlRow(m.isError ? "err" : "tool", "TOOL·RESULT", `${m.toolName ?? ""} ${m.isError ? "ERR" : "ok"}`, null);
      }
      break;
    }
    case "tool_execution_start":
      pushEvent({ stage: "tool_gate_pending" });
      tlRow("gate", "GATE·PENDING", `tool_call: ${e.toolName}`);
      addToolCard(e.toolName, e.args, e.toolCallId);
      pushEvent({ stage: "tool_start" });
      break;
    case "tool_execution_update": {
      pushEvent({ stage: "tool_run", toolName: e.toolName });
      const txt = (e.partialResult?.content || []).map((c: any) => c.text || "").join("");
      if (txt) {
        const cards = [...document.querySelectorAll<HTMLElement>(".toolcard")];
        const card = cards[cards.length - 1];
        if (card) {
          const body = card.querySelector(".tcbody") as HTMLElement;
          body.insertAdjacentHTML("beforeend", esc(txt));
          (card.querySelector(".tstat") as HTMLElement).classList.add("run");
          (card.querySelector(".stxt") as HTMLElement).textContent = "RUNNING";
          $("#chatfeed").scrollTop = 1e9;
        }
      }
      break;
    }
    case "tool_execution_end": {
      const cards = [...document.querySelectorAll<HTMLElement>(".toolcard")];
      const card = cards.find((c) => c.dataset.tcid === e.toolCallId) || cards[cards.length - 1];
      if (card) {
        const st = card.querySelector(".tstat") as HTMLElement, sx = card.querySelector(".stxt") as HTMLElement;
        st.classList.remove("run");
        const txt = (e.result?.content || []).map((c: any) => c.text || "").join("") || "";
        if (e.isError) { st.classList.add("err"); sx.textContent = "ERR"; card.classList.add("err"); }
        else { st.classList.add("ok"); sx.textContent = "OK"; }
        const body = card.querySelector(".tcbody") as HTMLElement;
        body.insertAdjacentHTML("beforeend", "\n" + esc(txt));
      }
      pushEvent(e.isError ? { stage: "tool_end_err" } : { stage: "tool_end_ok" });
      tlRow(e.isError ? "err" : "tool", e.isError ? "TOOL·ERR" : "TOOL·END", `${e.toolName} ${e.isError ? "ERR" : "exit 0"}`, null);
      break;
    }
    case "agent_end":
      tlRow("turn", "AGENT·END", `willRetry=${e.willRetry}`);
      if (e.willRetry) { setState("wait"); setArchStatusHtml(`<span class="warn">● will retry</span>`); }
      break;
    case "agent_settled": pushEvent({ stage: "settled" }); agentBusy = false; setState("idle"); tlRow("turn", "AGENT·SETTLED", "idle · run complete"); break;
    case "auto_retry_start": pushEvent({ stage: "retry_wait" }); setState("wait"); tlRow("gate", "RETRY", `attempt ${e.attempt}/${e.maxAttempts} · +${e.delayMs}ms`); break;
    case "auto_retry_end": if (!e.success) setState("err"); else setState("busy"); tlRow("gate", "RETRY·END", e.success ? "retry ok" : "retry failed"); break;
    case "queue_update": $("#qcount").textContent = `◈ ${e.steering + e.followUp} QUEUED`; $("#qcount").classList.toggle("on", e.steering + e.followUp > 0); break;
    case "extension_ui_request": renderExtUi(e); tlRow("gate", "EXT·UI", `${e.method}`); break;
    case "compaction_start": tlRow("meta", "COMPACT", "compacting…"); break;
    case "compaction_end": tlRow("meta", "COMPACT", "done · " + (e.result?.reason ?? "")); break;
    case "bash_execution_update": tlRow("meta", "USER·BASH", "direct bash pipe"); break;
    case "entry_appended": tlRow("meta", "ENTRY", "extension appended entry"); break;
    case "session_info_changed": tlRow("meta", "SESSION·INFO", e.info?.name ?? ""); break;
    case "thinking_level_changed": tlRow("meta", "THINK·LEVEL", e.level); break;
    case "model_select": tlRow("meta", "MODEL", e.model?.id ?? ""); break;
    default:
      if (t.startsWith("sys.")) { tlRow("meta", "SYS", e.detail ?? t); if (e.error) setState("err"); }
      else tlRow("meta", t.toUpperCase(), e.detail ?? ""); // 未知类型透传（版本升级兜底）
  }
}

/** 单事件容错：任何事件处理异常都不中断重放/实时流 */
export function safeHandle(e: any): void {
  try {
    handlePiEvent(e);
  } catch (err: any) {
    console.error("[dash] event failed:", e?.type ?? e?.piType, err);
    try {
      tlRow("meta", "SKIP", "事件处理异常: " + String(err?.message ?? err).slice(0, 80));
    } catch {
      /* noop */
    }
  }
}

function handleSys(detail: string, data: any): void {
  if (detail === "cwd") {
    updateProjectLabel((data && data.cwd) || "");
    return;
  }
  tlRow("meta", "SYS", detail);
  if (data && data.error) setState("err");
}

/* ============ extension_ui_request 交互卡 ============ */
function renderExtUi(e: any): void {
  chatClearEmpty();
  const d = document.createElement("div");
  d.className = "extcard";
  const m = e.method;
  // extension_ui method 友好名（未知 method 保留协议原始名，不全用裸字符串）
  const EXT_METHOD_LABEL: Record<string, string> = { select: "选择", confirm: "确认", editor: "编辑", input: "输入", setStatus: "状态更新" };
  const mLabel = EXT_METHOD_LABEL[m] || m;
  let body = "";
  if (m === "select") { body = `<span class="exopts">${(e.options || []).map((o: any, i: number) => `<button class="exopt" data-i="${i}">${esc(typeof o === "object" ? o.label ?? o.name ?? JSON.stringify(o) : o)}</button>`).join("")}</span>`; }
  else if (m === "confirm") { body = `<div style="color:var(--text-secondary);font-family:var(--font-mono);font-size:11.5px">${esc(e.message ?? e.title ?? "确认?")}</div>`; }
  else if (m === "editor") { body = `<textarea rows="8">${esc(e.initial ?? "")}</textarea>`; }
  else if (m === "input") { body = `<input value="${esc(e.initial ?? "")}" placeholder="${esc(e.placeholder ?? "")}">`; }
  else if (m === "setStatus") { const info = e.status ?? e.text ?? e.value ?? e.message ?? e.title ?? ""; body = `<div style="color:var(--text-secondary);font-family:var(--font-mono);font-size:11.5px">${esc(info)}</div>`; }
  d.innerHTML = `<div class="exhead">◈ EXTENSION UI · ${esc(mLabel)}${e.title ? ` · ${esc(e.title)}` : ""}</div><div class="exbody">${body}<div class="exbtns"></div></div>`;
  const btns = d.querySelector(".exbtns") as HTMLElement;
  const respond = (payload: any) => {
    wsSend({ type: "extension_ui_response", id: e.id, ...payload });
    d.remove();
  };
  if (m === "select") {
    d.querySelectorAll<HTMLElement>(".exopt").forEach((b) => (b.onclick = () => {
      const o = e.options[+(b.dataset.i as string)];
      respond({ value: typeof o === "object" ? o.value ?? o.name ?? JSON.stringify(o) : o });
    }));
  } else if (m === "confirm") {
    const ok = document.createElement("button"); ok.className = "primary"; ok.textContent = "CONFIRM"; ok.onclick = () => respond({ confirmed: true });
    const no = document.createElement("button"); no.textContent = "CANCEL"; no.onclick = () => respond({ cancelled: true });
    btns.append(ok, no);
  } else if (m === "editor") {
    const ok = document.createElement("button"); ok.className = "primary"; ok.textContent = "SUBMIT"; ok.onclick = () => respond({ value: (d.querySelector("textarea") as HTMLTextAreaElement).value });
    const no = document.createElement("button"); no.textContent = "CANCEL"; no.onclick = () => respond({ cancelled: true });
    btns.append(ok, no);
  } else if (m === "input") {
    const ok = document.createElement("button"); ok.className = "primary"; ok.textContent = "OK"; ok.onclick = () => respond({ value: (d.querySelector("input") as HTMLInputElement).value });
    const no = document.createElement("button"); no.textContent = "CANCEL"; no.onclick = () => respond({ cancelled: true });
    btns.append(ok, no);
  } else {
    const ok = document.createElement("button"); ok.className = "primary"; ok.textContent = "DISMISS"; ok.onclick = () => respond({ cancelled: true });
    btns.append(ok);
  }
  $("#chatfeed").appendChild(d);
  $("#chatfeed").scrollTop = 1e9;
}

/* ============ 项目目录 + 历史会话 ============ */
let currentProject = "";
let histScope = "follow";
let histCache: any[] = [];

export const getCurrentProject = (): string => currentProject;
export const hasHistory = (): boolean => histCache.length > 0;
export const setHistScope = (scope: string): void => {
  histScope = scope;
};

function normPath(p: string): string {
  return (p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function updateProjectLabel(cwd: string): void {
  currentProject = cwd || "";
  const v = $("#projval");
  if (v) v.textContent = cwd ? (cwd.length > 46 ? cwd.slice(0, 20) + "…" + cwd.slice(-23) : cwd) : "—";
  const pi = $<HTMLInputElement>("#projinput");
  if (pi && document.activeElement !== pi) pi.value = cwd || "";
  if ($("#tlcol").dataset.tab === "history") renderHistory();
}

export function confirmTextForPath(p: string): string {
  const en = document.body.classList.contains("lang-en");
  return en
    ? `Switch pi's working directory to:\n${p}\n\nThis restarts pi; the current live session will be interrupted. Confirm?`
    : `即将把 pi 的工作目录切换到：\n${p}\n\n切换会重启 pi，当前实时会话会中断。确认？`;
}

export function refreshHistory(): void {
  fetch(`/api/history?t=${TOKEN}`)
    .then((r) => r.json())
    .then((arr) => {
      histCache = Array.isArray(arr) ? arr : [];
      renderHistory();
      renderRecentProjects();
    })
    .catch(() => {
      histCache = [];
      renderHistory();
      renderRecentProjects();
    });
}

export function renderHistory(): void {
  const feed = $("#histfeed");
  if (!feed) return;
  feed.innerHTML = "";
  const cur2 = normPath(currentProject);
  const rows = histCache.filter((h) => (histScope === "all" ? true : normPath(h.projectCwd) === cur2));
  const hc = $("#histcount");
  if (hc) hc.textContent = rows.length + " SES";
  if (!rows.length) {
    feed.innerHTML = `<div class="empty">${histScope === "all" ? "NO HISTORY" : "当前项目无历史会话"}</div>`;
    return;
  }
  for (const h of rows) {
    const proj = h.projectCwd ? h.projectCwd : "未知项目";
    const isCur = normPath(proj) === cur2;
    const div = document.createElement("div");
    div.className = "tlrow";
    div.innerHTML = `<span class="tag">${isCur ? "●" : "○"}</span><span class="sum">${esc(h.file)}</span>`;
    div.title = `${proj}\n${h.file}\n${h.size} bytes · ${h.mtime}`;
    feed.appendChild(div);
  }
}

export function renderRecentProjects(): void {
  const box = $("#projrecent");
  if (!box) return;
  const seen = new Set<string>();
  const items: string[] = [];
  for (const h of histCache) {
    const cwd = h.projectCwd;
    if (!cwd) continue;
    const n = normPath(cwd);
    if (n === normPath(currentProject)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    items.push(cwd);
  }
  if (!items.length) {
    const t = document.body.classList.contains("lang-en") ? I18N.en["ui.recentEmpty"] || "No other projects yet" : I18N.zh["ui.recentEmpty"] || "暂无其他项目";
    box.innerHTML = `<div class="pp-rec-empty">${esc(t)}</div>`;
    return;
  }
  box.innerHTML = "";
  for (const cwd of items) {
    const d = document.createElement("div");
    d.className = "pp-rec-item";
    d.textContent = cwd;
    d.title = cwd;
    d.addEventListener("click", () => {
      const i = $<HTMLInputElement>("#projinput");
      if (i) { i.value = cwd; i.focus(); i.select(); }
      box.querySelectorAll(".pp-rec-item").forEach((x) => x.classList.remove("on"));
      d.classList.add("on");
    });
    box.appendChild(d);
  }
}

/** 首屏拉一次 /api/state：session 文件 / 模型 / cwd + 历史 */
export function loadInitialState(): void {
  fetch(`/api/state?t=${TOKEN}`)
    .then((r) => r.json())
    .then((s) => {
      if (s.state?.sessionFile) {
        $("#sessionpath").textContent = s.state.sessionFile;
      } else {
        // bridge 已连上但 get_state 未返回会话数据（如本机 pi 未实现 get_state）→ 显示明确的连接状态，避免残留初始占位文案
        const t = s.bridge === "running" ? "已连接 · 等待会话数据"
          : s.bridge === "starting" ? "连接中…"
          : s.bridge === "error" ? "连接失败"
          : "等待会话…";
        $("#sessionpath").textContent = t;
      }
      if (s.state?.model?.id) $("#modelbadge").textContent = `${s.state.model.provider} · ${s.state.model.id}`;
      if (s.cwd) updateProjectLabel(s.cwd);
      refreshHistory();
    })
    .catch(() => {});
}
