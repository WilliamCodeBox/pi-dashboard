// rebuild-svg.cjs — 左侧白板仪器风重构（只改 CSS + SVG，不动 JS）
"use strict";
const fs = require("fs");
const f = __dirname + "/public/index.html";
let html = fs.readFileSync(f, "utf8");

// ---------- 1. CSS 替换/插入 ----------
const cssOld = [
  [`.arch .box{fill:#16202D;stroke:#3D5A7A;stroke-width:1.5;rx:6}`,
   `.arch .box{fill:url(#boxGrad);stroke:#3D5A7A;stroke-width:1.5;rx:6}`],
  [`.arch .diamond{fill:#0E151D;stroke:#3D5A7A;stroke-width:1.5}`,
   `.arch .diamond{fill:url(#diaGrad);stroke:#3D5A7A;stroke-width:1.5}`],
  [`.arch .flow{fill:none;stroke:#4A6A8C;stroke-width:2}`,
   `.arch .flow{fill:none;stroke:#4A6A8C;stroke-width:2;filter:drop-shadow(0 0 2.5px rgba(74,106,140,.45))}`],
  [`.arch .flowlbl{fill:var(--text-secondary);font-size:11.5px}`,
   `.arch .flowlbl{fill:var(--text-secondary);font-size:11.5px}
/* 仪器风 v5：表头/编号/LED/chip */
.arch .hdr{stroke-width:3}
.arch .hdr-cyan{stroke:#4FD1FF}
.arch .hdr-amber{stroke:#FFB224}
.arch .hdr-green{stroke:#2DE0A0}
.arch .hdr-gray{stroke:#31455C}
.arch .tagid{fill:#5B6B80;font-size:9.5px;letter-spacing:.16em}
.arch .led{fill:#64748B}
.arch .led.on{fill:#2DE0A0;filter:drop-shadow(0 0 3px rgba(45,224,160,.8))}
.arch .led.amb{fill:#FFB224;filter:drop-shadow(0 0 3px rgba(255,178,36,.8))}
.arch .chip{fill:#0C1117;stroke:#31455C;stroke-width:1}
.arch .chip-txt{fill:#9FB0C3;font-size:10px;letter-spacing:.05em}
.arch .pipe{fill:#4FD1FF;font-size:11px}
   .arch .gridly{pointer-events:none}`],
  [`.arch .grp{fill:#8FA3BC;font-size:12px;letter-spacing:.12em;font-weight:500}`,
   `.arch .grp{fill:#8FA3BC;font-size:11px;letter-spacing:.12em;font-weight:500}`],
  [`.arch .nt{fill:var(--text-primary);font-size:15px;font-weight:600}`,
   `.arch .nt{fill:var(--text-primary);font-size:13px;font-weight:600}`],
  [`.arch .ns{fill:var(--text-secondary);font-size:12.5px}`,
   `.arch .ns{fill:var(--text-secondary);font-size:11.5px}`],
  // —— 全量重设计：放大字号（根治缩放糊字）——
  [`.arch .grp{fill:#8FA3BC;font-size:11px;letter-spacing:.12em;font-weight:500}`,
   `.arch .grp{fill:#8FA3BC;font-size:12.5px;letter-spacing:.1em;font-weight:500}`],
  [`.arch .nt{fill:var(--text-primary);font-size:13px;font-weight:600}`,
   `.arch .nt{fill:var(--text-primary);font-size:15px;font-weight:600}`],
  [`.arch .ns{fill:var(--text-secondary);font-size:11.5px}`,
   `.arch .ns{fill:var(--text-secondary);font-size:13px}`],
  [`.arch .chip-txt{fill:#9FB0C3;font-size:10px;letter-spacing:.05em}`,
   `.arch .chip-txt{fill:#9FB0C3;font-size:11.5px;letter-spacing:.04em}`],
  [`.arch .flowlbl{fill:var(--text-secondary);font-size:11.5px}`,
   `.arch .flowlbl{fill:var(--text-secondary);font-size:13px}`],
  [`.arch .rail{fill:var(--text-tertiary);font-size:11.5px}`,
   `.arch .rail{fill:var(--text-tertiary);font-size:13px}`],
  // —— 左栏加宽到 50%，避免放大后整体被缩回 ——
  [`#archcol{flex:0 0 42%;border-right:1px solid var(--border)}`,
   `#archcol{flex:0 0 50%;border-right:1px solid var(--border)}`],
  [`#archwrap{flex:1;min-width:640px;min-height:480px;display:flex;align-items:center;justify-content:center;padding:12px}`,
   `#archwrap{flex:1;min-width:760px;min-height:480px;display:flex;align-items:center;justify-content:center;padding:12px}`],
];
for (const [a, b] of cssOld) {
  if (!html.includes(a)) continue; // 幂等：已应用过的规则跳过，允许重复运行
  html = html.replace(a, b);
}
if (!html.includes(".arch .brain{")) {
  html = html.replace("</style>", ".arch .brain{fill:none;stroke:#2DE0A0;stroke-width:.55;stroke-linecap:round;stroke-linejoin:round}\n</style>");
}
if (!html.includes(".arch .purpose{")) {
  html = html.replace("</style>", ".arch .purpose{font-size:13px;font-weight:600}\n</style>");
}

// ---------- 2. defs 插入 ----------
const defsAdd = `
            <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#1A2330" stroke-width="1"/></pattern>
            <radialGradient id="llmGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#2DE0A0" stop-opacity=".22"/><stop offset="100%" stop-color="#2DE0A0" stop-opacity="0"/></radialGradient>
            <linearGradient id="boxGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1B2636"/><stop offset="100%" stop-color="#121A24"/></linearGradient>
            <linearGradient id="diaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1D2C3E"/><stop offset="100%" stop-color="#0E151D"/></linearGradient>
            <linearGradient id="crtGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFFFFF" stop-opacity=".045"/><stop offset="55%" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="100%" stop-color="#FFFFFF" stop-opacity=".02"/></linearGradient>`;
if (!html.includes('id="grid"')) html = html.replace("</defs>", defsAdd + "\n          </defs>");

// ---------- 3. SVG 主体替换 ----------
const svgStart = html.indexOf('<svg class="arch"');
const svgEnd = html.indexOf("</svg>") + "</svg>".length;
const newSvg = `<svg class="arch" viewBox="0 0 900 1050" role="img" aria-label="pi 调用流程白板">
          <defs>
            <marker id="arr" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0 0 L12 6 L0 12 z" class="head"/>
            </marker>${defsAdd}
          </defs>

          <!-- ===== 第 1 层：入口（人话说明 + 编号） ===== -->
          <g data-node="faces" class="node" tabindex="0">
            <rect class="box" x="20" y="24" width="300" height="150"/>
            <line class="hdr hdr-cyan" x1="20" y1="24" x2="320" y2="24"/>
            <text class="tagid" x="284" y="40">U1</text>
            <text class="grp" x="34" y="46">① 入口 · Entry</text>
            <text class="purpose" x="34" y="72" style="fill:#2DE0A0">4 种方式启动 pi</text>
            <text class="nt" x="34" y="96">TUI · print · json · rpc</text>
            <text class="ns" x="34" y="120">面板走 rpc 这一路</text>
            <g data-node="face-rpc" tabindex="0">
              <text class="nt" x="34" y="144">rpc 通道 ◉ 实时接入</text>
            </g>
          </g>
          <path class="flow" d="M320 99 L370 99" marker-end="url(#arr)"/>

          <g data-node="session-core" class="node" tabindex="0">
            <rect class="box" x="370" y="24" width="240" height="150"/>
            <line class="hdr hdr-amber" x1="370" y1="24" x2="610" y2="24"/>
            <text class="tagid" x="586" y="40">U2</text>
            <text class="grp" x="384" y="46">② 会话核心 · Session</text>
            <text class="purpose" x="384" y="72" style="fill:#FFB224">事件总线 · 35 类</text>
            <text class="nt" x="384" y="96">subscribe() 订阅</text>
            <text class="ns" x="384" y="120">hooks · skills · 扩展</text>
          </g>
          <path class="flow" d="M610 99 L660 99" marker-end="url(#arr)"/>

          <g data-node="context" class="node" tabindex="0">
            <rect class="box" x="660" y="24" width="220" height="150"/>
            <line class="hdr hdr-green" x1="660" y1="24" x2="880" y2="24"/>
            <text class="tagid" x="856" y="40">U3</text>
            <text class="grp" x="674" y="46">③ 上下文 · Context</text>
            <text class="purpose" x="674" y="72" style="fill:#2DE0A0">喂给模型的全部信息</text>
            <text class="nt" x="674" y="96">system + AGENTS.md</text>
            <text class="ns" x="674" y="120">+ history + 你的 prompt</text>
          </g>
          <path class="flow" d="M700 174 L700 200 L580 200" marker-end="url(#arr)"/>

          <!-- ===== 第 2 层：THE LOOP（CRT 显像管 + 网格 + 辉光） ===== -->
          <g>
            <rect class="loopbox" data-node="loop" x="20" y="200" width="560" height="560"/>
            <rect class="gridly" x="22" y="202" width="556" height="556" fill="url(#grid)" opacity=".45"/>
            <rect class="gridly" x="22" y="202" width="556" height="556" fill="url(#crtGrad)"/>
            <line class="hdr hdr-green" x1="20" y1="200" x2="580" y2="200"/>
            <text class="tagid" x="540" y="216">CH1</text>
            <text class="grp" x="34" y="222">THE LOOP · 主循环</text>

            <g data-node="llm" class="node" tabindex="0">
              <rect class="box" x="272" y="246" width="196" height="168" rx="10"/>
              <circle class="gridly" cx="370" cy="300" r="80" fill="url(#llmGlow)"/>
              <g class="brain" transform="translate(320,250) scale(4.2)">
                <path d="M12 5a3 3 0 1 0-5.997.142 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
                <path d="M12 5a3 3 0 1 1 5.997.142 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
                <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4 4.5 4.5 0 0 1 3 4 4.5 4.5 0 0 1 3-4"/>
                <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>
                <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>
                <path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>
                <path d="M19.938 10.5a4 4 0 0 1 .585.396"/>
                <path d="M6.003 14.5a3 3 0 0 0 .401 1.375"/>
                <path d="M17.599 14.5a3 3 0 0 1-.399 1.375"/>
              </g>
              <text class="tagid" x="442" y="264">IC1</text>
              <circle class="led on" cx="456" cy="272" r="3"/>
              <text class="nt" x="370" y="352" text-anchor="middle">LLM</text>
              <text class="ns" id="llm-sub" x="370" y="372" text-anchor="middle">模型推理（LLM）</text>
            </g>

            <g data-node="q-tools" class="node" tabindex="0">
              <polygon class="diamond" points="370,432 420,480 370,528 320,480"/>
              <text class="tagid" x="428" y="470">G1</text>
              <text class="nt" x="370" y="485" text-anchor="middle">tools?</text>
            </g>

            <g data-node="q-allowed" class="node" tabindex="0">
              <polygon class="diamond" points="370,572 420,620 370,668 320,620"/>
              <text class="tagid" x="428" y="610">G2</text>
              <text class="nt" x="370" y="625" text-anchor="middle">allowed?</text>
            </g>

            <g data-node="tools" class="node" tabindex="0">
              <rect class="box" x="225" y="696" width="290" height="52"/>
              <text class="tagid" x="482" y="714">U4</text>
              <circle class="led" cx="490" cy="716" r="2.5"/>
              <circle class="led" cx="498" cy="716" r="2.5"/>
              <circle class="led" cx="506" cy="716" r="2.5"/>
              <text class="nt" x="239" y="716">read · write · edit · bash</text>
              <text class="ns" id="tools-sub" x="239" y="734">grep · find · ls · 扩展工具</text>
            </g>

            <path class="flow" d="M370 385 L370 430" marker-end="url(#arr)"/>
            <path class="flow" d="M370 528 L370 570" marker-end="url(#arr)"/>
            <path class="flow" d="M370 668 L370 694" marker-end="url(#arr)" data-edge="e-allowed-tools"/>
            <text class="flowlbl" x="380" y="686">ext hook tool_call · allow</text>
            <path class="flow" d="M225 722 C130 722 130 330 265 330" marker-end="url(#arr)" data-edge="e-results-loop"/>
            <text class="flowlbl" x="92" y="690">results → loop</text>
            <path class="flow dash" d="M320 620 C245 600 230 520 320 482" marker-end="url(#arr)" data-edge="e-blocked"/>
            <text class="flowlbl" x="160" y="545">block:true → tool result</text>
            <path class="flow" d="M420 480 C600 480 600 360 658 360" marker-end="url(#arr)" data-edge="e-loop-reply"/>
            <text class="flowlbl" x="486" y="438">no tool call → reply</text>
          </g>

          <!-- ===== 第 3 层：REPLY / SESSION / PIPE（右栏加宽到 240） ===== -->
          <g data-node="reply" class="node" tabindex="0">
            <rect class="box" x="640" y="300" width="240" height="130"/>
            <line class="hdr hdr-cyan" x1="640" y1="300" x2="880" y2="300"/>
            <text class="tagid" x="836" y="316">OUT1</text>
            <text class="grp" x="654" y="322">回复 · Reply</text>
            <text class="purpose" x="654" y="348" style="fill:#2DE0A0">结果回到你</text>
            <text class="nt" x="654" y="374">TUI / json / rpc 输出</text>
            <text class="ns" x="654" y="402">唤醒点：agent_settled</text>
            <circle class="led on" cx="862" cy="318" r="3.5"/>
          </g>

          <g data-node="session" class="node" tabindex="0">
            <rect class="box" x="640" y="450" width="240" height="180"/>
            <line class="hdr hdr-green" x1="640" y1="450" x2="880" y2="450"/>
            <text class="tagid" x="836" y="466">LOG1</text>
            <text class="grp" x="654" y="472">会话存档 · JSONL</text>
            <text class="purpose" x="654" y="498" style="fill:#FFB224">每会话一个日志文件</text>
            <text class="nt" x="654" y="524">{id, parentId} · 可 fork</text>
            <text class="ns" x="654" y="548">~/.pi/agent/sessions/</text>
            <text class="ns" id="session-count" x="654" y="576">entries: 0</text>
          </g>
          <path class="flow dash" d="M580 566 L640 566" marker-end="url(#arr)" data-edge="e-save"/>
          <text class="flowlbl" x="448" y="558">message_end → append</text>

          <g>
            <rect class="box" x="640" y="650" width="240" height="120"/>
            <line class="hdr hdr-amber" x1="640" y1="650" x2="880" y2="650"/>
            <text class="tagid" x="836" y="666">CH2</text>
            <text class="grp" x="654" y="672">管道 · Pipe</text>
            <text class="purpose" x="654" y="698" style="fill:#FFB224">事件出 / 命令入</text>
            <text class="ns" x="654" y="724">EVENTS OUT · CMDS IN</text>
            <text class="ns" x="654" y="748">SESSION · 白名单</text>
            <circle class="led on" cx="862" cy="668" r="3.5"/>
          </g>

          <!-- ===== 第 4 层：事件流（简化为示例 chip） ===== -->
          <g>
            <rect class="box" x="20" y="780" width="860" height="150"/>
            <line class="hdr hdr-gray" x1="20" y1="780" x2="880" y2="780"/>
            <text class="tagid" x="836" y="796">PRT1</text>
            <text class="grp" x="34" y="802">事件流 · Signal — 35 种事件</text>
            <text class="ns" x="34" y="826">pi 实时吐出的全部事件（右侧时间线同款）</text>
            <g class="chip" transform="translate(34,840)"><rect width="120" height="24" rx="3" class="chip"/><text class="chip-txt" x="8" y="16">agent_start</text></g>
            <g class="chip" transform="translate(164,840)"><rect width="120" height="24" rx="3" class="chip"/><text class="chip-txt" x="8" y="16">message_end</text></g>
            <g class="chip" transform="translate(294,840)"><rect width="140" height="24" rx="3" class="chip"/><text class="chip-txt" x="8" y="16">tool_execution</text></g>
            <g class="chip" transform="translate(444,840)"><rect width="130" height="24" rx="3" class="chip"/><text class="chip-txt" x="8" y="16">agent_settled</text></g>
            <text class="ns" x="586" y="858">… 共 35 种</text>
          </g>

          <!-- ===== 第 5 层：数据流（终端铭牌 · 弱化） ===== -->
          <g>
            <rect class="box" x="20" y="950" width="860" height="100"/>
            <line class="hdr hdr-gray" x1="20" y1="950" x2="880" y2="950"/>
            <text class="tagid" x="836" y="966">BUS1</text>
            <text class="grp" x="34" y="972">数据流 · Bus</text>
            <text class="purpose" x="34" y="994" style="fill:#2DE0A0">落盘路径 · 命令白名单</text>
            <text class="pipe" x="34" y="1016">▶</text><text class="rail" x="50" y="1016">session → ~/.pi/agent/sessions/…jsonl</text>
            <text class="pipe" x="34" y="1038">▶</text><text class="rail" x="50" y="1038">rpc · prompt/steer/follow_up/abort 白名单</text>
          </g>
        </svg>`;

html = html.slice(0, svgStart) + newSvg + html.slice(svgEnd);
fs.writeFileSync(f, html);
console.log("rebuilt OK, svg chars:", newSvg.length);
