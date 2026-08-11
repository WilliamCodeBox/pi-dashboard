/**
 * hub.ts — 事件总线（阶段1）
 * 单调 id + 环形摘要缓冲（2000 条）+ 多客户端广播。
 * 归一化：pi 原始事件 → dashboard 事件 {id, ts, piType, data}。
 */
export interface Subscriber {
  (e: DashboardEvent): void;
}
export interface DashboardEvent {
  id: number;
  ts: number;
  piType: string;
  data: any;
  detail?: string;
}

const RING_SIZE = 2000;

export class Hub {
  private seq = 0;
  private ring: DashboardEvent[] = [];
  private subs = new Set<Subscriber>();

  /** 原始 pi 事件进总线（附摘要） */
  ingest(piEvent: any) {
    const ev: DashboardEvent = {
      id: ++this.seq,
      ts: Date.now(),
      piType: piEvent.type,
      data: piEvent,
      detail: summarize(piEvent),
    };
    this.ring.push(ev);
    if (this.ring.length > RING_SIZE) this.ring.splice(0, this.ring.length - RING_SIZE);
    for (const s of this.subs) s(ev);
  }

  /** 系统级事件（连接/状态/错误），带 SYS 前缀 */
  sys(detail: string, data: any = {}) {
    const ev: DashboardEvent = { id: ++this.seq, ts: Date.now(), piType: "sys." + detail, data, detail };
    for (const s of this.subs) s(ev);
  }

  subscribe(fn: Subscriber): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  /** 补发：返回 after 之后的摘要（缓冲内）；缓冲外返回 null 需全量重同步 */
  replay(after: number): DashboardEvent[] | null {
    if (after < this.seq - RING_SIZE) return null;
    return this.ring.filter((e) => e.id > after);
  }
  lastId() { return this.seq; }
}

/** 摘要：一行时间线条目文本 */
function summarize(e: any): string {
  switch (e.type) {
    case "message_update": {
      const s = e.assistantMessageEvent;
      if (!s) return "message_update";
      const d = typeof s.delta === "string" ? s.delta : "";
      if (s.type === "text_delta") return `text_delta +${d.length}`;
      if (s.type === "thinking_delta") return `thinking_delta +${d.length}`;
      if (s.type === "toolcall_delta") return "toolcall_delta (partial)";
      return s.type;
    }
    case "message_start":
      return `message_start · ${e.message?.role ?? "?"}`;
    case "message_end": {
      const m = e.message;
      if (m?.role === "toolResult") return `toolResult · ${m.toolName ?? ""} ${m.isError ? "ERR" : "ok"}`;
      if (m?.role === "assistant") return `assistant end · ${m.stopReason ?? "?"} · ${m.usage?.output ?? 0} tok`;
      return `message_end · ${m?.role ?? "?"}`;
    }
    case "tool_execution_start":
      return `tool start · ${e.toolName}`;
    case "tool_execution_update":
      return `tool update · ${e.toolName}`;
    case "tool_execution_end":
      return `tool end · ${e.toolName} ${e.isError ? "ERR" : "ok"}`;
    case "agent_start": return "agent start";
    case "agent_end": return `agent end · willRetry=${e.willRetry}`;
    case "agent_settled": return "agent settled · idle";
    case "turn_start": return "turn start";
    case "turn_end": return "turn end";
    case "auto_retry_start": return `auto retry ${e.attempt}/${e.maxAttempts} · +${e.delayMs}ms`;
    case "auto_retry_end": return `auto retry end · ${e.success ? "ok" : "failed"}`;
    case "extension_ui_request": return `ext UI · ${e.method}`;
    case "queue_update": return `queue · ${e.steering + e.followUp} pending`;
    default: return e.type;
  }
}
