import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const PORT = Number(process.env.PI_DASH_PORT ?? 7777);
export const CONFIG_DIR = path.join(os.homedir(), ".pi-dashboard");
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export function loadConfigProject(): string | undefined {
  try { const raw = fs.readFileSync(CONFIG_FILE, "utf8"); const cfg = JSON.parse(raw); return typeof cfg.projectCwd === "string" && cfg.projectCwd ? cfg.projectCwd : undefined; } catch { return undefined; }
}

export function saveConfigProject(dir: string) { try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); fs.writeFileSync(CONFIG_FILE, JSON.stringify({ projectCwd: dir }, null, 2)); } catch (e) { console.error("[dash] 无法写入 config:", e); } }

// 启动解析优先级：--cwd= > config.json > PI_DASH_PROJECT > process.cwd()
export function resolveInitialCwd(): string {
  const flag = process.argv.find((a) => a.startsWith("--cwd="))?.slice(6);
  if (flag) return flag;
  const cfg = loadConfigProject();
  if (cfg) return cfg;
  const env = process.env.PI_DASH_PROJECT;
  if (env) return env;
  return process.cwd();
}
