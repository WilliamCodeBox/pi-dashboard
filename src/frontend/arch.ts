/**
 * arch.ts — 左栏架构图：运行时构建 SVG + 动画引擎
 * SVG 结构由 rebuild-svg.cjs 的 newSvg 模板移植而来（该脚本已删除，此文件是唯一来源）。
 * 文字节点保留 data-i18n 属性并按当前语言写 textContent；语言切换后调 refreshArchI18n() 刷新。
 * 动画：STAGE_ANIM（节点/连线/样式类）+ 阶段队列 pushEvent/playNext（原内联 script 逐段搬移）。
 */
import { dict, stageLabel, tr } from "./i18n.ts";

const NS = "http://www.w3.org/2000/svg";
type Attrs = Record<string, string>;

function e(tag: string, attrs: Attrs = {}, children: Element[] = []): SVGElement {
  const n = document.createElementNS(NS, tag) as SVGElement;
  for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
  for (const c of children) n.appendChild(c);
  return n;
}

/** <text>：key 存在时挂 data-i18n 并按当前语言取文案，否则用字面量 */
function txt(cls: string, attrs: Attrs, content: string, key?: string): SVGElement {
  const t = e("text", { class: cls, ...attrs });
  if (key) {
    t.setAttribute("data-i18n", key);
    t.textContent = tr(key, content);
  } else {
    t.textContent = content;
  }
  return t;
}

function stop(offset: string, color: string, opacity?: string): SVGElement {
  const a: Attrs = { offset, "stop-color": color };
  if (opacity != null) a["stop-opacity"] = opacity;
  return e("stop", a);
}

function defs(): SVGElement {
  return e("defs", {}, [
    e("marker", { id: "arr", viewBox: "0 0 12 12", refX: "11", refY: "6", markerWidth: "8", markerHeight: "8", orient: "auto-start-reverse" }, [
      e("path", { d: "M0 0 L12 6 L0 12 z", class: "head" }),
    ]),
    e("pattern", { id: "grid", width: "24", height: "24", patternUnits: "userSpaceOnUse" }, [
      e("path", { d: "M24 0H0V24", fill: "none", stroke: "#1A2330", "stroke-width": "1" }),
    ]),
    e("radialGradient", { id: "llmGlow", cx: "50%", cy: "50%", r: "50%" }, [
      stop("0%", "#2DE0A0", ".22"),
      stop("100%", "#2DE0A0", "0"),
    ]),
    e("linearGradient", { id: "boxGrad", x1: "0", y1: "0", x2: "0", y2: "1" }, [
      stop("0%", "#1B2636"),
      stop("100%", "#121A24"),
    ]),
    e("linearGradient", { id: "diaGrad", x1: "0", y1: "0", x2: "0", y2: "1" }, [
      stop("0%", "#1D2C3E"),
      stop("100%", "#0E151D"),
    ]),
    e("linearGradient", { id: "crtGrad", x1: "0", y1: "0", x2: "0", y2: "1" }, [
      stop("0%", "#FFFFFF", ".045"),
      stop("55%", "#FFFFFF", "0"),
      stop("100%", "#FFFFFF", ".02"),
    ]),
  ]);
}

/** 第 1 层：入口 / 会话核心 / 上下文 */
function layerEntry(): Element[] {
  return [
    e("g", { "data-node": "faces", class: "node", tabindex: "0" }, [
      e("rect", { class: "box", x: "20", y: "24", width: "300", height: "150" }),
      e("line", { class: "hdr hdr-cyan", x1: "20", y1: "24", x2: "320", y2: "24" }),
      txt("tagid", { x: "284", y: "40" }, "U1"),
      txt("grp", { x: "34", y: "46" }, "① 入口 · Entry", "svg.grpEntry"),
      txt("purpose", { x: "34", y: "72", style: "fill:#2DE0A0" }, "4 种方式启动 pi", "svg.pEntry"),
      txt("nt", { x: "34", y: "96" }, "TUI · print · json · rpc"),
      txt("ns", { x: "34", y: "120" }, "面板走 rpc 这一路", "svg.nFacesRpc"),
      e("g", { "data-node": "face-rpc", tabindex: "0" }, [
        txt("nt", { x: "34", y: "144" }, "rpc 通道 ◉ 实时接入", "svg.nRpcCh"),
      ]),
    ]),
    e("path", { class: "flow", d: "M320 99 L370 99", "marker-end": "url(#arr)" }),

    e("g", { "data-node": "session-core", class: "node", tabindex: "0" }, [
      e("rect", { class: "box", x: "370", y: "24", width: "240", height: "150" }),
      e("line", { class: "hdr hdr-amber", x1: "370", y1: "24", x2: "610", y2: "24" }),
      txt("tagid", { x: "586", y: "40" }, "U2"),
      txt("grp", { x: "384", y: "46" }, "② 会话核心 · Session", "svg.grpSession"),
      txt("purpose", { x: "384", y: "72", style: "fill:#FFB224" }, "事件总线 · 35 类", "svg.pSession"),
      txt("nt", { x: "384", y: "96" }, "subscribe() 订阅", "svg.nSessionSub"),
      txt("ns", { x: "384", y: "120" }, "hooks · skills · 扩展", "svg.nSessionSkill"),
    ]),
    e("path", { class: "flow", d: "M610 99 L660 99", "marker-end": "url(#arr)" }),

    e("g", { "data-node": "context", class: "node", tabindex: "0" }, [
      e("rect", { class: "box", x: "660", y: "24", width: "220", height: "150" }),
      e("line", { class: "hdr hdr-green", x1: "660", y1: "24", x2: "880", y2: "24" }),
      txt("tagid", { x: "856", y: "40" }, "U3"),
      txt("grp", { x: "674", y: "46" }, "③ 上下文 · Context", "svg.grpContext"),
      txt("purpose", { x: "674", y: "72", style: "fill:#2DE0A0" }, "喂给模型的全部信息", "svg.pContext"),
      txt("nt", { x: "674", y: "96" }, "system + AGENTS.md"),
      txt("ns", { x: "674", y: "120" }, "+ history + 你的 prompt", "svg.nContextHist"),
    ]),
    e("path", { class: "flow", d: "M700 174 L700 200 L580 200", "marker-end": "url(#arr)" }),
  ];
}

/** 第 2 层：THE LOOP（CRT 显像管 + 网格 + 辉光） */
function layerLoop(): Element {
  const brainPaths = [
    "M12 5a3 3 0 1 0-5.997.142 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z",
    "M12 5a3 3 0 1 1 5.997.142 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z",
    "M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4 4.5 4.5 0 0 1 3 4 4.5 4.5 0 0 1 3-4",
    "M17.599 6.5a3 3 0 0 0 .399-1.375",
    "M6.003 5.125A3 3 0 0 0 6.401 6.5",
    "M3.477 10.896a4 4 0 0 1 .585-.396",
    "M19.938 10.5a4 4 0 0 1 .585.396",
    "M6.003 14.5a3 3 0 0 0 .401 1.375",
    "M17.599 14.5a3 3 0 0 1-.399 1.375",
  ].map((d) => e("path", { d }));

  return e("g", {}, [
    e("rect", { class: "loopbox", "data-node": "loop", x: "20", y: "200", width: "560", height: "560" }),
    e("rect", { class: "gridly", x: "22", y: "202", width: "556", height: "556", fill: "url(#grid)", opacity: ".45" }),
    e("rect", { class: "gridly", x: "22", y: "202", width: "556", height: "556", fill: "url(#crtGrad)" }),
    e("line", { class: "hdr hdr-green", x1: "20", y1: "200", x2: "580", y2: "200" }),
    txt("tagid", { x: "540", y: "216" }, "CH1"),
    txt("grp", { x: "34", y: "222" }, "THE LOOP · 主循环", "svg.grpLoop"),

    e("g", { "data-node": "llm", class: "node", tabindex: "0" }, [
      e("rect", { class: "box", x: "272", y: "246", width: "196", height: "168", rx: "10" }),
      e("circle", { class: "gridly", cx: "370", cy: "300", r: "80", fill: "url(#llmGlow)" }),
      e("g", { class: "brain", transform: "translate(320,250) scale(4.2)" }, brainPaths),
      txt("tagid", { x: "442", y: "264" }, "IC1"),
      e("circle", { class: "led on", cx: "456", cy: "272", r: "3" }),
      txt("nt", { x: "370", y: "352", "text-anchor": "middle" }, "LLM"),
      txt("ns", { id: "llm-sub", x: "370", y: "372", "text-anchor": "middle" }, "模型推理（LLM）", "svg.nLlm"),
    ]),

    e("g", { "data-node": "q-tools", class: "node", tabindex: "0" }, [
      e("polygon", { class: "diamond", points: "370,432 420,480 370,528 320,480" }),
      txt("tagid", { x: "428", y: "470" }, "G1"),
      txt("nt", { x: "370", y: "485", "text-anchor": "middle" }, "tools?"),
    ]),

    e("g", { "data-node": "q-allowed", class: "node", tabindex: "0" }, [
      e("polygon", { class: "diamond", points: "370,572 420,620 370,668 320,620" }),
      txt("tagid", { x: "428", y: "610" }, "G2"),
      txt("nt", { x: "370", y: "625", "text-anchor": "middle" }, "allowed?"),
    ]),

    e("g", { "data-node": "tools", class: "node", tabindex: "0" }, [
      e("rect", { class: "box", x: "225", y: "696", width: "290", height: "52" }),
      txt("tagid", { x: "482", y: "714" }, "U4"),
      e("circle", { class: "led", cx: "490", cy: "716", r: "2.5" }),
      e("circle", { class: "led", cx: "498", cy: "716", r: "2.5" }),
      e("circle", { class: "led", cx: "506", cy: "716", r: "2.5" }),
      txt("nt", { x: "239", y: "716" }, "read · write · edit · bash"),
      txt("ns", { id: "tools-sub", x: "239", y: "734" }, "grep · find · ls · 扩展工具"),
    ]),

    e("path", { class: "flow", d: "M370 385 L370 430", "marker-end": "url(#arr)" }),
    e("path", { class: "flow", d: "M370 528 L370 570", "marker-end": "url(#arr)" }),
    e("path", { class: "flow", d: "M370 668 L370 694", "marker-end": "url(#arr)", "data-edge": "e-allowed-tools" }),
    txt("flowlbl", { x: "380", y: "686" }, "ext hook tool_call · allow"),
    e("path", { class: "flow", d: "M225 722 C130 722 130 330 265 330", "marker-end": "url(#arr)", "data-edge": "e-results-loop" }),
    txt("flowlbl", { x: "92", y: "690" }, "results → loop"),
    e("path", { class: "flow dash", d: "M320 620 C245 600 230 520 320 482", "marker-end": "url(#arr)", "data-edge": "e-blocked" }),
    txt("flowlbl", { x: "160", y: "545" }, "block:true → tool result"),
    e("path", { class: "flow", d: "M420 480 C600 480 600 360 658 360", "marker-end": "url(#arr)", "data-edge": "e-loop-reply" }),
    txt("flowlbl", { x: "486", y: "438" }, "no tool call → reply"),
  ]);
}

/** 第 3 层：REPLY / SESSION / PIPE */
function layerRight(): Element[] {
  return [
    e("g", { "data-node": "reply", class: "node", tabindex: "0" }, [
      e("rect", { class: "box", x: "640", y: "300", width: "240", height: "130" }),
      e("line", { class: "hdr hdr-cyan", x1: "640", y1: "300", x2: "880", y2: "300" }),
      txt("tagid", { x: "836", y: "316" }, "OUT1"),
      txt("grp", { x: "654", y: "322" }, "回复 · Reply", "svg.grpReply"),
      txt("purpose", { x: "654", y: "348", style: "fill:#2DE0A0" }, "结果回到你", "svg.pReply"),
      txt("nt", { x: "654", y: "374" }, "TUI / json / rpc 输出", "svg.nReplyOut"),
      txt("ns", { x: "654", y: "402" }, "唤醒点：agent_settled", "svg.nReplyWake"),
      e("circle", { class: "led on", cx: "862", cy: "318", r: "3.5" }),
    ]),

    e("g", { "data-node": "session", class: "node", tabindex: "0" }, [
      e("rect", { class: "box", x: "640", y: "450", width: "240", height: "180" }),
      e("line", { class: "hdr hdr-green", x1: "640", y1: "450", x2: "880", y2: "450" }),
      txt("tagid", { x: "836", y: "466" }, "LOG1"),
      txt("grp", { x: "654", y: "472" }, "会话存档 · JSONL", "svg.grpJsonl"),
      txt("purpose", { x: "654", y: "498", style: "fill:#FFB224" }, "每会话一个日志文件", "svg.pJsonl"),
      txt("nt", { x: "654", y: "524" }, "{id, parentId} · 可 fork", "svg.nJsonlFork"),
      txt("ns", { x: "654", y: "548" }, "~/.pi/agent/sessions/"),
      txt("ns", { id: "session-count", x: "654", y: "576" }, "entries: 0"),
    ]),
    e("path", { class: "flow dash", d: "M580 566 L640 566", "marker-end": "url(#arr)", "data-edge": "e-save" }),
    txt("flowlbl", { x: "448", y: "558" }, "message_end → append"),

    e("g", {}, [
      e("rect", { class: "box", x: "640", y: "650", width: "240", height: "120" }),
      e("line", { class: "hdr hdr-amber", x1: "640", y1: "650", x2: "880", y2: "650" }),
      txt("tagid", { x: "836", y: "666" }, "CH2"),
      txt("grp", { x: "654", y: "672" }, "管道 · Pipe", "svg.grpPipe"),
      txt("purpose", { x: "654", y: "698", style: "fill:#FFB224" }, "事件出 / 命令入", "svg.pPipe"),
      txt("ns", { x: "654", y: "724" }, "EVENTS OUT · CMDS IN"),
      txt("ns", { x: "654", y: "748" }, "SESSION · 白名单", "svg.nPipeWh"),
      e("circle", { class: "led on", cx: "862", cy: "668", r: "3.5" }),
    ]),
  ];
}

/** 第 4 层：事件流（示例 chip） */
function layerSignal(): Element {
  const chip = (tx: number, w: number, label: string) =>
    e("g", { class: "chip", transform: `translate(${tx},840)` }, [
      e("rect", { width: String(w), height: "24", rx: "3", class: "chip" }),
      txt("chip-txt", { x: "8", y: "16" }, label),
    ]);
  return e("g", {}, [
    e("rect", { class: "box", x: "20", y: "780", width: "860", height: "150" }),
    e("line", { class: "hdr hdr-gray", x1: "20", y1: "780", x2: "880", y2: "780" }),
    txt("tagid", { x: "836", y: "796" }, "PRT1"),
    txt("grp", { x: "34", y: "802" }, "事件流 · Signal — 35 种事件", "svg.grpSignal"),
    txt("ns", { x: "34", y: "826" }, "pi 实时吐出的全部事件（右侧时间线同款）", "svg.nSignalDesc"),
    chip(34, 120, "agent_start"),
    chip(164, 120, "message_end"),
    chip(294, 140, "tool_execution"),
    chip(444, 130, "agent_settled"),
    txt("ns", { x: "586", y: "858" }, "… 共 35 种", "svg.nSignalMore"),
  ]);
}

/** 第 5 层：数据流（终端铭牌） */
function layerBus(): Element {
  return e("g", {}, [
    e("rect", { class: "box", x: "20", y: "950", width: "860", height: "100" }),
    e("line", { class: "hdr hdr-gray", x1: "20", y1: "950", x2: "880", y2: "950" }),
    txt("tagid", { x: "836", y: "966" }, "BUS1"),
    txt("grp", { x: "34", y: "972" }, "数据流 · Bus", "svg.grpBus"),
    txt("purpose", { x: "34", y: "994", style: "fill:#2DE0A0" }, "落盘路径 · 命令白名单", "svg.pBus"),
    txt("pipe", { x: "34", y: "1016" }, "▶"),
    txt("rail", { x: "50", y: "1016" }, "session → ~/.pi/agent/sessions/…jsonl"),
    txt("pipe", { x: "34", y: "1038" }, "▶"),
    txt("rail", { x: "50", y: "1038" }, "rpc · prompt/steer/follow_up/abort 白名单", "svg.railRpc"),
  ]);
}

/** 构建架构图并挂载到 #archwrap（首屏调用一次） */
export function buildArch(): void {
  const wrap = document.querySelector("#archwrap");
  if (!wrap) return;
  const svg = e("svg", { class: "arch", viewBox: "0 0 900 1050", role: "img", "aria-label": "pi 调用流程白板" });
  svg.appendChild(defs());
  for (const n of layerEntry()) svg.appendChild(n);
  svg.appendChild(layerLoop());
  for (const n of layerRight()) svg.appendChild(n);
  svg.appendChild(layerSignal());
  svg.appendChild(layerBus());
  wrap.textContent = "";
  wrap.appendChild(svg);
}

/** 语言切换后刷新图内文字 */
export function refreshArchI18n(): void {
  const d = dict();
  document.querySelectorAll("#archwrap [data-i18n]").forEach((el) => {
    const k = el.getAttribute("data-i18n");
    if (k && d[k] != null) el.textContent = d[k];
  });
}

/* ============ 动画引擎（双通道：阶段队列 + 流状态位） ============ */
interface StageAnim {
  nodes: string[];
  edges: string[];
  cls?: string;
}
/** 阶段 → 高亮节点/连线（标签见 i18n.ts 的 STAGE_LABEL / EN_STAGE） */
const STAGE_ANIM: Record<string, StageAnim> = {
  turn_start: { nodes: ["loop"], edges: [] },
  user_in: { nodes: ["face-rpc", "context", "faces"], edges: [] },
  llm_start: { nodes: ["llm"], edges: [], cls: "breath" },
  llm_end: { nodes: ["llm"], edges: [], cls: "breath" },
  llm_stream: { nodes: ["llm"], edges: [], cls: "breath" },
  thinking: { nodes: ["llm"], edges: [], cls: "cyan" },
  toolcall: { nodes: ["llm", "q-tools"], edges: [] },
  tool_gate_pending: { nodes: ["q-allowed"], edges: [], cls: "" },
  tool_start: { nodes: ["q-allowed", "tools"], edges: ["e-allowed-tools"] },
  tool_run: { nodes: ["tools"], edges: [], cls: "hold" },
  tool_end_ok: { nodes: ["tools"], edges: ["e-results-loop"] },
  tool_end_err: { nodes: ["q-allowed"], edges: ["e-blocked"], cls: "errf" },
  retry_wait: { nodes: ["llm"], edges: [], cls: "amber" },
  settled: { nodes: ["reply"], edges: ["e-loop-reply"] },
  session_write: { nodes: ["session"], edges: ["e-save"] },
};

export interface StageEvent {
  stage: string;
  toolName?: string;
}

const evQueue: StageEvent[] = [];
let playing = false;

export function hot(sel: string, cls: string, ms: number): void {
  document.querySelectorAll(sel).forEach((el) => {
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  });
}
export function pulseEdge(eid: string): void {
  const el = document.querySelector(`[data-edge="${eid}"]`);
  if (!el) return;
  el.classList.add("pulse");
  setTimeout(() => el.classList.remove("pulse"), 650);
}
export function setNode(name: string, cls: string, on = true): void {
  const el = document.querySelector(`[data-node="${name}"]`);
  if (!el) return;
  el.classList.toggle(cls, on);
}
export function streamBit(node: string, cls: string, on: boolean): void {
  setNode(node, cls, on);
}
export function updateToolsSub(t: string): void {
  const s = document.querySelector("#tools-sub");
  if (t && s) s.textContent = "◉ " + t;
}
export function updateSessionCount(n: number): void {
  const el = document.querySelector("#session-count");
  if (el) el.textContent = "entries: " + n;
}
/** 直接写 #archstatus（will retry 提示 / 队列播完清空） */
export function setArchStatusHtml(html: string): void {
  const st = document.querySelector("#archstatus");
  if (st) st.innerHTML = html;
}

function animateStage(ev: StageEvent): void {
  const spec = STAGE_ANIM[ev.stage];
  if (!spec) return;
  stageLabel(ev.stage);
  const cls = spec.cls || "hot";
  spec.nodes.forEach((n) => hot(`[data-node="${n}"]`, cls, 1000));
  spec.edges.forEach((ed) => pulseEdge(ed));
  if (ev.stage === "tool_run") {
    setNode("tools", "hold");
    updateToolsSub(ev.toolName || "");
  }
  if (ev.stage === "tool_end_ok" || ev.stage === "tool_end_err") {
    setNode("tools", "hold", false);
  }
}

function playNext(): void {
  if (!evQueue.length) {
    playing = false;
    setTimeout(() => {
      if (!evQueue.length) setArchStatusHtml("");
    }, 400);
    return;
  }
  playing = true;
  animateStage(evQueue.shift() as StageEvent);
  setTimeout(playNext, 620);
}

export function pushEvent(ev: StageEvent): void {
  if (evQueue.length > 3) evQueue.splice(0, evQueue.length - 3);
  evQueue.push(ev);
  if (!playing) playNext();
}
