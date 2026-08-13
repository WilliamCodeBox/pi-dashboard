/**
 * bridge.test.ts — resolveCliPath 三级回退断言。
 * bridge.ts 的 spawn 在 spawnChild() 内硬编码（无注入钩子），
 * 因此 NDJSON 分帧 / 命令 id 关联的 mock 子进程用例按规格 skip，待 P1 拆 spawn 后可测。
 */
import test from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import { resolveCliPath } from "../../bridge.ts";

// 本机是否安装 @earendil-works/pi-coding-agent（决定 b 分支是否可达）
const PI_PKG = "@earendil-works/pi-coding-agent/dist/cli.js";
let piPackageInstalled = false;
try {
  createRequire(import.meta.url).resolve(PI_PKG);
  piPackageInstalled = true;
} catch {
  piPackageInstalled = false;
}

test("a. 设了 PI_CLI_PATH → 返回该路径(node 启动)", () => {
  const saved = process.env.PI_CLI_PATH;
  try {
    process.env.PI_CLI_PATH = "/opt/pi/cli.js";
    const r = resolveCliPath();
    assert.strictEqual(r.command, process.execPath, "应交给 node 启动");
    assert.deepStrictEqual(r.cliArgs, ["/opt/pi/cli.js"]);
  } finally {
    if (saved === undefined) delete process.env.PI_CLI_PATH;
    else process.env.PI_CLI_PATH = saved;
  }
});

if (piPackageInstalled) {
  test("b. 包可 resolve → 返回 resolved 路径(node 启动)", () => {
    const saved = process.env.PI_CLI_PATH;
    try {
      delete process.env.PI_CLI_PATH;
      const expected = createRequire(import.meta.url).resolve(PI_PKG);
      const r = resolveCliPath();
      assert.strictEqual(r.command, process.execPath);
      assert.deepStrictEqual(r.cliArgs, [expected]);
    } finally {
      if (saved !== undefined) process.env.PI_CLI_PATH = saved;
    }
  });
} else {
  test.skip("b. 包可 resolve → 返回 resolved 路径（跳过：本机未安装 " + PI_PKG + "，resolveCliPath 直接落入兜底，无法验证 resolved 路径）", () => {});
}

if (!piPackageInstalled) {
  test("c. 兜底：包不可 resolve 且无 PI_CLI_PATH → 返回 'pi' 命令名", () => {
    const saved = process.env.PI_CLI_PATH;
    try {
      delete process.env.PI_CLI_PATH;
      const r = resolveCliPath();
      assert.strictEqual(r.command, "pi");
      assert.deepStrictEqual(r.cliArgs, []);
    } finally {
      if (saved !== undefined) process.env.PI_CLI_PATH = saved;
    }
  });
} else {
  test.skip("c. 兜底 'pi' 命令名（跳过：本机已安装 pi 包，resolveCliPath 走 b 分支，兜底不可达）", () => {});
}

test.skip("NDJSON 分帧 + 命令 id 关联（mock 子进程）— 待 P1 拆 spawn 后可测：当前 spawn 在 spawnChild() 内硬编码，无 spawnFn 注入钩子，无法在不改运行代码的前提下替换子进程", () => {});
