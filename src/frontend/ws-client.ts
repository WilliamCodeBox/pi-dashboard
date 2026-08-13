/**
 * ws-client.ts — WebSocket 连接与消息处理
 * token 从 location.search 的 ?t= 取（与后端 /ws?token= 校验一致，页面必须带 ?t=TOKEN 打开）。
 * 收到 event / replay 交给 render.ts 的 safeHandle；cmd_result 回填 wsSendCmd 的 Promise。
 * 断线指数退避重连（1s 起、30s 上限、加抖动），逐段搬自 public/index.html 内联 script。
 */
import { safeHandle, setState } from "./render.ts";
import { stageLabel } from "./i18n.ts";

export const TOKEN = new URLSearchParams(location.search).get("t") || "";

let ws: WebSocket | null = null;
let wsRetry = 0;
const cmdWaiters = new Map<string, (r: any) => void>();
let cmdSeq = 0;

function wsUrl(): string {
  const p = location.port
    ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:${location.port}/ws?token=${TOKEN}`
    : `ws://127.0.0.1:7777/ws?token=${TOKEN}`;
  return p;
}

export function wsSend(obj: any): void {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

/** 发命令并等 cmd_result（15s 超时返回 {success:false,error:"timeout"}） */
export function wsSendCmd(obj: any): Promise<any> {
  return new Promise((resolve) => {
    const id = "c" + ++cmdSeq;
    cmdWaiters.set(id, resolve);
    wsSend(Object.assign({ id }, obj));
    setTimeout(() => {
      if (cmdWaiters.has(id)) {
        cmdWaiters.delete(id);
        resolve({ success: false, error: "timeout" });
      }
    }, 15000);
  });
}

export function connect(): void {
  ws = new WebSocket(wsUrl());
  ws.onopen = () => {
    wsRetry = 0;
    setState("idle");
    const hint = document.querySelector("#modehint");
    if (hint) hint.textContent = "live";
    stageLabel("LIVE · --mode rpc 已连接");
  };
  ws.onmessage = (m: MessageEvent) => {
    let msg: any;
    try {
      msg = JSON.parse(m.data);
    } catch (err) {
      console.warn("[dash] bad ws frame, skipped:", err);
      return;
    }
    if (msg.type === "event") {
      safeHandle(msg.ev);
    } else if (msg.type === "replay") {
      for (const ev of msg.events) safeHandle(ev);
    } else if (msg.type === "denied") {
      stageLabel("DENIED · 命令被拒");
    } else if (msg.type === "cmd_result") {
      const cb = cmdWaiters.get(msg.id);
      if (cb) {
        cmdWaiters.delete(msg.id);
        cb(msg);
      }
    }
  };
  ws.onclose = () => {
    stageLabel("LINK DOWN · 重连中…");
    setState("err");
    const base = 1000, cap = 30000;
    const delay = Math.min(cap, base * Math.pow(2, wsRetry)) + Math.random() * base;
    wsRetry++;
    setTimeout(connect, delay);
  };
}
