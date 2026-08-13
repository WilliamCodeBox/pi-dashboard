import fs from "node:fs";
import { saveConfigProject } from "./config.ts";
import type { Bridge } from "../bridge.ts";
import type { Hub } from "../hub.ts";

export interface DashState {
  cwd: string;
}

export function rehandshake(bridge: Bridge, hub: Hub) {
  bridge.handshake().then((st) => { hub.sys("state", st ?? {}); }).catch(() => {});
}

export function handleSetProject(bridge: Bridge, hub: Hub, state: DashState, dir: string): Promise<{ success: boolean; error?: string }> {
  if (!dir) return Promise.resolve({ success: false, error: "empty path" });
  let st: any;
  try { st = fs.statSync(dir); } catch { return Promise.resolve({ success: false, error: `路径不存在: ${dir}` }); }
  if (!st || !st.isDirectory()) return Promise.resolve({ success: false, error: `不是目录: ${dir}` });
  state.cwd = dir;
  saveConfigProject(dir);
  bridge.restart(dir);
  rehandshake(bridge, hub);
  hub.sys("cwd", { cwd: dir });
  return Promise.resolve({ success: true });
}

export function dispatchCommand(
  cmd: any,
  ctx: {
    bridge: Bridge;
    hub: Hub;
    state: DashState;
    pickDirectory: () => Promise<{ success: boolean; error?: string; path?: string }>;
  },
): Promise<{ success: boolean; error?: string; path?: string }> {
  switch (cmd.type) {
    case "set_project":
      return handleSetProject(ctx.bridge, ctx.hub, ctx.state, String(cmd.cwd ?? ""));
    case "pick_directory":
      return ctx.pickDirectory();
    case "prompt":
      return ctx.bridge.prompt(cmd.message, cmd.streamingBehavior);
    case "steer":
      return ctx.bridge.steer(cmd.message);
    case "follow_up":
      return ctx.bridge.followUp(cmd.message);
    case "abort":
      return ctx.bridge.abort();
    default:
      return Promise.resolve({ success: false, error: "unknown command" });
  }
}
