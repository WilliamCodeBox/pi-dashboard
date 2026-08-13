/**
 * config.test.ts — cwd 解析优先级 + config 读写（阶段3 升级）。
 *
 * 现在 src/config.ts 是 import 安全的（无副作用、不起服务、不 spawn pi），
 * 因此直接 import 真实的 resolveInitialCwd / loadConfigProject / saveConfigProject 来测，
 * 不再用复刻版。每个 case 用隔离助手清理 argv / env / 真实 ~/.pi-dashboard/config.json，
 * 避免本机既有配置干扰优先级断言。
 */
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  resolveInitialCwd,
  loadConfigProject,
  saveConfigProject,
  CONFIG_DIR,
  CONFIG_FILE,
} from "../../src/config.ts";

/**
 * 在隔离环境中运行 body：备份并临时移除真实 config.json，
 * 备份并还原 process.argv / process.env.PI_DASH_PROJECT，确保优先级断言只受 body 内构造因素影响。
 */
function runIsolated(body: () => void) {
  const savedArgv = [...process.argv];
  const savedEnv = process.env.PI_DASH_PROJECT;
  let backup: string | undefined;
  try { backup = fs.readFileSync(CONFIG_FILE, "utf8"); } catch { backup = undefined; }
  try { fs.unlinkSync(CONFIG_FILE); } catch { /* 不存在则忽略 */ }
  try {
    body();
  } finally {
    if (backup !== undefined) fs.writeFileSync(CONFIG_FILE, backup);
    else { try { fs.unlinkSync(CONFIG_FILE); } catch { /* 原本就不存在 */ } }
    process.argv = savedArgv;
    if (savedEnv === undefined) delete process.env.PI_DASH_PROJECT;
    else process.env.PI_DASH_PROJECT = savedEnv;
  }
}

test("cwd 解析优先级：--cwd= 最高（高于 config 与 env）", () => {
  runIsolated(() => {
    process.argv.push("--cwd=/from/flag");
    process.env.PI_DASH_PROJECT = "/from/env";
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ projectCwd: "/from/config" }));
    assert.strictEqual(resolveInitialCwd(), "/from/flag");
  });
});

test("cwd 解析优先级：config.json 高于 env 与 default", () => {
  runIsolated(() => {
    process.env.PI_DASH_PROJECT = "/from/env";
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ projectCwd: "/from/config" }));
    assert.strictEqual(resolveInitialCwd(), "/from/config");
  });
});

test("cwd 解析优先级：env(PI_DASH_PROJECT) 高于 default", () => {
  runIsolated(() => {
    process.env.PI_DASH_PROJECT = "/from/env";
    assert.strictEqual(resolveInitialCwd(), "/from/env");
  });
});

test("cwd 解析优先级：全无则回退 default(process.cwd())", () => {
  runIsolated(() => {
    assert.strictEqual(resolveInitialCwd(), process.cwd());
  });
});

test("config 路径常量 = ~/.pi-dashboard/config.json", () => {
  assert.ok(CONFIG_FILE.endsWith(path.join(".pi-dashboard", "config.json")));
});

test("config 读写回合（真实 loadConfigProject/saveConfigProject，备份还原真实 home）", () => {
  let backup: string | undefined;
  try { backup = fs.readFileSync(CONFIG_FILE, "utf8"); } catch { backup = undefined; }
  try {
    try { fs.unlinkSync(CONFIG_FILE); } catch {}
    assert.strictEqual(loadConfigProject(), undefined, "文件不存在时应返回 undefined");
    saveConfigProject("/my/project");
    assert.strictEqual(loadConfigProject(), "/my/project", "应回读写入的 projectCwd");
    saveConfigProject("");
    assert.strictEqual(loadConfigProject(), undefined, "空串应视为未设置");
  } finally {
    if (backup !== undefined) fs.writeFileSync(CONFIG_FILE, backup);
    else { try { fs.unlinkSync(CONFIG_FILE); } catch {} }
  }
});
