/**
 * hub.test.ts — Hub 环形缓冲 / replay / 订阅 的纯逻辑断言（不起服务器、不起 pi）。
 * 注意：RING_SIZE 是 hub.ts 内的模块级常量(2000)，无法从外部注入，
 * 因此"旧事件被丢弃"通过灌满缓冲(2001 条)后观测 ring 长度来验证。
 */
import test from "node:test";
import assert from "node:assert";
import { Hub } from "../../hub.ts";

test("订阅后收到后续事件；取消订阅后不再收到", () => {
  const hub = new Hub();
  const received: string[] = [];
  const off = hub.subscribe((e) => received.push(e.piType));

  hub.ingest({ type: "alpha" });
  assert.strictEqual(received.length, 1);
  assert.strictEqual(received[0], "alpha");

  off(); // 退订
  hub.ingest({ type: "beta" });
  assert.strictEqual(received.length, 1, "退订后不应再收到事件");
});

test("replay 回放缓冲内历史事件（after 之后的 id）", () => {
  const hub = new Hub();
  hub.ingest({ type: "a" }); // id 1
  hub.ingest({ type: "b" }); // id 2
  hub.ingest({ type: "c" }); // id 3

  const all = hub.replay(0);
  assert.ok(all, "缓冲内应可回放(返回数组而非 null)");
  assert.strictEqual(all!.length, 3);
  assert.deepStrictEqual(all!.map((e) => e.id), [1, 2, 3]);

  const partial = hub.replay(1);
  assert.deepStrictEqual(partial!.map((e) => e.id), [2, 3]);
});

test("并发/多次订阅：每个订阅者都独立收到事件", () => {
  const hub = new Hub();
  const a: number[] = [];
  const b: number[] = [];
  const offA = hub.subscribe((e) => a.push(e.id));
  const offB = hub.subscribe((e) => b.push(e.id));

  hub.ingest({ type: "x" });
  hub.ingest({ type: "y" });

  assert.deepStrictEqual(a, [1, 2]);
  assert.deepStrictEqual(b, [1, 2]);

  offA();
  hub.ingest({ type: "z" }); // id 3：a 应停在 [1,2]，b 收到 3
  assert.deepStrictEqual(a, [1, 2]);
  assert.deepStrictEqual(b, [1, 2, 3]);
  offB();
});

test("缓冲超限后旧事件被丢弃（ring 上限为模块级 RING_SIZE=2000）", () => {
  const hub = new Hub();
  const N = 2001; // 灌满 + 1，触发 splice 淘汰
  for (let i = 0; i < N; i++) hub.ingest({ type: "fill" });

  // replay 窗口阈值 = seq - RING_SIZE = 2001 - 2000 = 1；after 必须 >= 1 才能回放
  const events = hub.replay(1)!;
  assert.strictEqual(events.length, 2000, "ring 长度应被裁剪回 RING_SIZE");
  assert.strictEqual(hub.lastId(), 2001);
  // id 1 是最早被淘汰的，不应再出现在回放里
  assert.ok(!events.some((e) => e.id === 1), "最旧事件(id=1)应已被丢弃");
  // 最新事件(id=2001)必须保留
  assert.ok(events.some((e) => e.id === 2001), "最新事件应保留");
});

test("replay 落在缓冲窗口外返回 null（需全量重同步）", () => {
  const hub = new Hub();
  for (let i = 0; i < 10; i++) hub.ingest({ type: "e" }); // id 1..10
  // after 远小于 seq - RING_SIZE(=10-2000=-1990) → 返回 null
  const out = hub.replay(-1991);
  assert.strictEqual(out, null, "超出缓冲窗口应返回 null");
});
