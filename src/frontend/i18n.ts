/**
 * i18n.ts — 中英文字典与语言切换（浏览器原生 ES module）
 * 从 public/index.html 内联 script 原样搬移：I18N 字典 / setLang / stageLabel / EN_STAGE / _lastStageKey。
 * 语言记忆：localStorage["pidash-lang"]，默认 zh。
 * 注意：当前语言以 <body class="lang-en"> 为唯一真源（与搬移前一致，setState 会重写 body.className）。
 */
export type Lang = "zh" | "en";

export const I18N: Record<Lang, Record<string, string>> = {
  zh: {
    "ui.archCol": "Architecture · pi 调用流程",
    "ui.chatCol": "Conversation",
    "ui.tlCol": "Event Recorder",
    "ui.awaiting": "AWAITING SIGNAL",
    "ui.awaitHint": "发消息或运行 demo 开始",
    "ui.modePrompt": "prompt",
    "ui.msgPlaceholder": "输入消息… (Enter=prompt · 流式中 Enter=steer / Alt+Enter=follow_up)",
    "ui.queued": "◈ 2 QUEUED",
    "ui.tlHead": "live · delta 已聚合",
    "ui.histCol": "历史会话",
    "ui.histHead": "会话历史 · 按项目归类",
    "ui.scopeFollow": "跟随当前项目",
    "ui.scopeAll": "全部项目",
    "ui.projTitle": "项目目录",
    "ui.projLabel": "项目：",
    "ui.apply": "应用",
    "ui.cancel": "取消",
    "ui.browse": "浏览…",
    "ui.recent": "最近项目",
    "ui.recentEmpty": "暂无其他项目",
    "ui.browseOpening": "打开中…",
    "ui.confirmTitle": "切换项目",
    "ui.confirmYes": "确认切换",
    "svg.grpEntry": "① 入口 · Entry",
    "svg.pEntry": "4 种方式启动 pi",
    "svg.nFacesRpc": "面板走 rpc 这一路",
    "svg.nRpcCh": "rpc 通道 ◉ 实时接入",
    "svg.grpSession": "② 会话核心 · Session",
    "svg.pSession": "事件总线 · 35 类",
    "svg.nSessionSub": "subscribe() 订阅",
    "svg.nSessionSkill": "hooks · skills · 扩展",
    "svg.grpContext": "③ 上下文 · Context",
    "svg.pContext": "喂给模型的全部信息",
    "svg.nContextHist": "+ history + 你的 prompt",
    "svg.grpLoop": "THE LOOP · 主循环",
    "svg.nLlm": "模型推理（LLM）",
    "svg.grpReply": "回复 · Reply",
    "svg.pReply": "结果回到你",
    "svg.nReplyOut": "TUI / json / rpc 输出",
    "svg.nReplyWake": "唤醒点：agent_settled",
    "svg.grpJsonl": "会话存档 · JSONL",
    "svg.pJsonl": "每会话一个日志文件",
    "svg.nJsonlFork": "{id, parentId} · 可 fork",
    "svg.grpPipe": "管道 · Pipe",
    "svg.pPipe": "事件出 / 命令入",
    "svg.nPipeWh": "SESSION · 白名单",
    "svg.grpSignal": "事件流 · Signal — 35 种事件",
    "svg.nSignalDesc": "pi 实时吐出的全部事件（右侧时间线同款）",
    "svg.nSignalMore": "… 共 35 种",
    "svg.grpBus": "数据流 · Bus",
    "svg.pBus": "落盘路径 · 命令白名单",
    "svg.railRpc": "rpc · prompt/steer/follow_up/abort 白名单",
  },
  en: {
    "ui.archCol": "Architecture · pi call flow",
    "ui.chatCol": "Conversation",
    "ui.tlCol": "Event Recorder",
    "ui.awaiting": "AWAITING SIGNAL",
    "ui.awaitHint": "Send a message or run the demo to start",
    "ui.modePrompt": "prompt",
    "ui.msgPlaceholder": "Type a message… (Enter=prompt · during stream Enter=steer / Alt+Enter=follow_up)",
    "ui.queued": "◈ 2 QUEUED",
    "ui.tlHead": "live · deltas aggregated",
    "ui.histCol": "History",
    "ui.histHead": "Session history · grouped by project",
    "ui.scopeFollow": "Follow current project",
    "ui.scopeAll": "All projects",
    "ui.projTitle": "Project directory",
    "ui.projLabel": "Project: ",
    "ui.apply": "Apply",
    "ui.cancel": "Cancel",
    "ui.browse": "Browse…",
    "ui.recent": "Recent projects",
    "ui.recentEmpty": "No other projects yet",
    "ui.browseOpening": "Opening…",
    "ui.confirmTitle": "Switch project",
    "ui.confirmYes": "Confirm switch",
    "svg.grpEntry": "① Entry",
    "svg.pEntry": "4 ways to start pi",
    "svg.nFacesRpc": "Dashboard uses the rpc path",
    "svg.nRpcCh": "rpc channel ◉ live",
    "svg.grpSession": "② Session",
    "svg.pSession": "Event bus · 35 types",
    "svg.nSessionSub": "subscribe()",
    "svg.nSessionSkill": "hooks · skills · extensions",
    "svg.grpContext": "③ Context",
    "svg.pContext": "Everything fed to the model",
    "svg.nContextHist": "+ history + your prompt",
    "svg.grpLoop": "THE LOOP · Main loop",
    "svg.nLlm": "Model inference (LLM)",
    "svg.grpReply": "Reply",
    "svg.pReply": "Results return to you",
    "svg.nReplyOut": "TUI / json / rpc output",
    "svg.nReplyWake": "Wakes on: agent_settled",
    "svg.grpJsonl": "Session Log · JSONL",
    "svg.pJsonl": "One log file per session",
    "svg.nJsonlFork": "{id, parentId} · forkable",
    "svg.grpPipe": "Pipe",
    "svg.pPipe": "Events out / Commands in",
    "svg.nPipeWh": "SESSION · allowlist",
    "svg.grpSignal": "Signal — 35 event types",
    "svg.nSignalDesc": "All events pi emits live (same as right timeline)",
    "svg.nSignalMore": "… 35 types total",
    "svg.grpBus": "Data Bus",
    "svg.pBus": "Write path · Command allowlist",
    "svg.railRpc": "rpc · prompt/steer/follow_up/abort allowlist",
  },
};

/** 阶段中文标签（原 STAGE[key].label；动画部分见 arch.ts 的 STAGE_ANIM） */
export const STAGE_LABEL: Record<string, string> = {
  turn_start: "turn_start · 回合开始",
  user_in: "message_start · user 进入",
  llm_start: "message_start · LLM 流式",
  llm_end: "message_end · LLM 完成",
  llm_stream: "message_update · text_delta…",
  thinking: "message_update · thinking_delta…",
  toolcall: "message_update · toolcall…",
  tool_gate_pending: "tool_execution_start · 门禁判定",
  tool_start: "ext hook tool_call · 允许",
  tool_run: "tool_execution_update · 运行中",
  tool_end_ok: "tool_execution_end · OK",
  tool_end_err: "isError · 结果回流",
  retry_wait: "auto_retry_start · 退避…",
  settled: "agent_settled · 回复",
  session_write: "message_end · JSONL 落盘",
};

export const EN_STAGE: Record<string, string> = {
  turn_start: "turn_start · turn begins",
  user_in: "message_start · user in",
  llm_start: "message_start · LLM streaming",
  llm_end: "message_end · LLM done",
  llm_stream: "message_update · text_delta…",
  thinking: "message_update · thinking_delta…",
  toolcall: "message_update · tool_call…",
  tool_gate_pending: "tool_execution_start · gate check",
  tool_start: "ext hook tool_call · allow",
  tool_run: "tool_execution_update · running",
  tool_end_ok: "tool_execution_end · OK",
  tool_end_err: "isError · result back",
  retry_wait: "auto_retry_start · backoff…",
  settled: "agent_settled · reply",
  session_write: "message_end · JSONL write",
};

let _lastStageKey: string | null = null;

/** 当前语言：以 body.lang-en 为真源（与搬移前逐字一致） */
export function currentLang(): Lang {
  return document.body.classList.contains("lang-en") ? "en" : "zh";
}

/** 当前语言字典（arch.ts 构图时按当前语言取文案） */
export function dict(lang: Lang = currentLang()): Record<string, string> {
  return I18N[lang] || I18N.zh;
}

/** 取 key 对应文案，缺失时回落到内置默认（构图用） */
export function tr(key: string, fallback: string): string {
  const d = dict();
  return d[key] != null ? d[key] : fallback;
}

export function setLang(lang: Lang): void {
  const d = I18N[lang] || I18N.zh;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const k = el.getAttribute("data-i18n");
    if (k && d[k] != null) el.textContent = d[k];
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    const k = el.getAttribute("data-i18n-ph");
    if (k && d[k] != null) el.setAttribute("placeholder", d[k]);
  });
  document.body.classList.toggle("lang-en", lang === "en");
  document.documentElement.lang = lang === "en" ? "en-US" : "zh-CN";
  const btn = document.querySelector("#btn-lang");
  if (btn) btn.textContent = lang === "en" ? "中文" : "EN";
  try {
    localStorage.setItem("pidash-lang", lang);
  } catch {
    /* 隐私模式下 localStorage 不可用 */
  }
  if (_lastStageKey) stageLabel(_lastStageKey);
}

/** 写 #archstatus 阶段标签；非 STAGE 键直接返回（与搬移前一致） */
export function stageLabel(key: string): void {
  const zh = STAGE_LABEL[key];
  // STAGE 字典有对应阶段标签 → 用中/英版；否则（连接状态等自由文案，如 LIVE / LINK DOWN / ABORT）直接展示原文
  const label = zh == null ? key : (currentLang() === "en" ? EN_STAGE[key] || zh : zh);
  _lastStageKey = key;
  const st = document.querySelector("#archstatus");
  if (st) st.innerHTML = `<span class="live-dot"></span>${label}`;
}

/** 初始化语言（记忆上次选择，默认中文） */
export function initLang(): void {
  let lang: Lang = "zh";
  try {
    const s = localStorage.getItem("pidash-lang");
    if (s === "en" || s === "zh") lang = s;
  } catch {
    /* 忽略 */
  }
  setLang(lang);
}
