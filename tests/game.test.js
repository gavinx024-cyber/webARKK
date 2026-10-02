import test from "node:test";
import assert from "node:assert/strict";
import { Game, dialogue, SHADOW_LIMIT } from "../js/game.js";
import { TAU } from "../js/spot-events.js";

function turn(g, amount) {
  for (let remaining = amount; remaining > 0.000001; remaining -= 0.25)
    g.moveShadow(Math.min(0.25, remaining));
}
function opening(g) {
  g.advance();
  assert.equal(g.recognize("spring"), false);
  assert.equal(g.recognize("sundial"), true);
  g.advance(); g.advance();
  assert.equal(g.phase, "opening-drag");
  g.advance();
  assert.equal(g.phase, "opening-drag");
  turn(g, SHADOW_LIMIT + 0.000001);
  assert.equal(g.phase, "opening-jammed");
  assert.equal(g.fragments.size, 0);
  g.advance();
  assert.equal(g.form, "suit");
  g.advance();
}
function restoreSeason(g, id) {
  assert.equal(g.spot.id, id);
  assert.equal(g.recognize(id), true);
  g.advance();
  assert.equal(g.phase, "event", "普通继续按钮不能完成手势事件");
  if (id === "spring") for (let index = 0; index < 5; index++) g.interact({ type: "petal", index });
  if (id === "summer") for (let i = 0; i < 3; i++) g.interact({ type: "water" });
  if (id === "autumn") for (let i = 0; i < 26; i++) g.interact({ type: "wind", delta: 0.25 });
  if (id === "winter") {
    for (let index = 0; index < 12; index++) g.interact({ type: "wipe", index });
    for (let index = 0; index < 4; index++) g.interact({ type: "memory", index });
  }
  assert.equal(g.phase, "restoring");
  assert.equal(g.fragments.has(id), false);
  assert.equal(g.collectFragment(), false, "恢复演出前不能领取");
  g.finishRestoration();
  assert.equal(g.phase, "fragment");
  g.collectFragment();
  assert.equal(g.collectFragment(), false, "不能重复领取");
  assert.equal(g.phase, "reward");
  assert.equal(g.fragments.has(id), true);
  g.advance();
}
function ending(g) {
  assert.equal(g.recognize("sundial"), true);
  assert.equal(g.phase, "finale");
  g.advance();
  assert.equal(g.phase, "finale", "普通按钮不能跳过碎片汇聚");
  g.finishAssembly();
  assert.equal(g.phase, "finale-drag");
  assert.equal(g.finishEnding(), false);
  turn(g, TAU + 0.000001);
  assert.equal(g.phase, "time-restored");
  g.finishEnding();
  assert.equal(g.phase, "ended");
  assert.equal(g.form, "original");
}
function finish(g) {
  opening(g);
  for (const id of ["spring", "summer", "autumn", "winter"]) restoreSeason(g, id);
  ending(g);
}

test("坐游完整流程：手势恢复四季、领取4个碎片、终章一周恢复时间", () => {
  const g = new Game();
  assert.equal(g.recognize("sundial"), false);
  finish(g);
  assert.deepEqual([...g.fragments], ["spring", "summer", "autumn", "winter"]);
  assert.match(dialogue(g).title, /おめでとうございます/);
  assert.equal(dialogue(g).button, "最初の画面へ");
});
test("错误卡、重复识别和scan继续按钮不会推进或改变互动", () => {
  const g = new Game(); g.advance(); g.advance();
  assert.equal(g.phase, "scan");
  assert.equal(g.recognize("winter"), false);
  g.recognize("sundial");
  for (let i = 0; i < 20; i++) assert.equal(g.recognize("sundial"), false);
  assert.equal(g.phase, "opening-live");
  assert.equal(g.fragments.size, 0);
});
test("开场和终章拖动过滤非法值、突跳，逆向拖动不会增加进度", () => {
  const g = new Game(); g.advance(); g.recognize("sundial"); g.advance(); g.advance();
  for (const delta of [NaN, Infinity, 0.6, -0.6]) assert.equal(g.moveShadow(delta), false);
  g.moveShadow(0.3); g.moveShadow(-0.2);
  assert.ok(Math.abs(g.shadowProgress - 0.1) < 0.000001);
  g.moveShadow(-0.5); assert.equal(g.shadowProgress, 0);
  g.debugFinal(); g.recognize("sundial"); g.finishAssembly();
  turn(g, TAU - 0.1); assert.equal(g.phase, "finale-drag");
  assert.equal(g.finishEnding(), false);
});
test("部分花瓣进度回看后恢复，历史快照和已领取碎片互不污染", () => {
  const g = new Game(); opening(g); g.recognize("spring");
  g.interact({ type: "petal", index: 0 }); g.interact({ type: "petal", index: 2 });
  const length = g.history.length;
  g.back(); assert.equal(g.phase, "transformed");
  assert.equal(g.interact({ type: "petal", index: 1 }), false);
  g.advance(); assert.equal(g.phase, "event");
  assert.equal(g.events.spring.petals, 5); assert.equal(g.replaying, false);
  assert.equal(g.history.length, length); assert.equal(g.fragments.size, 0);
});
test("冬季必须先清霜，再按1→4连接记忆；重复及乱序输入无效", () => {
  const g = new Game(); g.debugJump("winter"); g.recognize("winter");
  assert.equal(g.interact({ type: "memory", index: 0 }), false);
  for (let index = 0; index < 12; index++) g.interact({ type: "wipe", index });
  assert.equal(g.interact({ type: "memory", index: 2 }), false);
  g.interact({ type: "memory", index: 0 });
  assert.equal(g.interact({ type: "memory", index: 0 }), false);
  for (let index = 1; index < 4; index++) g.interact({ type: "memory", index });
  assert.equal(g.phase, "restoring");
  assert.equal(g.fragments.size, 0);
});
test("秋季顺逆来回不能冒充一整圈，NaN或突跳不会获奖", () => {
  const g = new Game(); g.debugJump("autumn"); g.recognize("autumn");
  for (let i = 0; i < 100; i++) {
    g.interact({ type: "wind", delta: 0.2 }); g.interact({ type: "wind", delta: -0.2 });
  }
  assert.equal(g.events.autumn.wind, 0); assert.equal(g.phase, "event");
  for (const delta of [NaN, Infinity, 1, -1]) assert.equal(g.interact({ type: "wind", delta }), false);
});
test("四季不能重复计数；外来交互类型和无效花瓣索引无效", () => {
  const g = new Game(); g.debugJump("spring"); g.recognize("spring");
  for (const index of [-1, 5, 1.2, NaN]) assert.equal(g.interact({ type: "petal", index }), false);
  assert.equal(g.interact({ type: "water" }), false);
  g.interact({ type: "petal", index: 0 });
  assert.equal(g.interact({ type: "petal", index: 0 }), false);
  assert.equal(g.events.spring.petals, 1);
});
test("结束回看保留4个碎片，不能重新交互、领奖或自动结束回看", () => {
  const g = new Game(); finish(g); const length = g.history.length;
  g.back(); assert.equal(g.phase, "time-restored");
  assert.equal(g.finishEnding(), false);
  for (let i = 0; i < length && !(g.phase === "reward" && g.spot.id === "spring"); i++) g.back();
  assert.equal(g.storyFragmentCount, 1);
  assert.match(dialogue(g).text, /これで1つ/);
  assert.equal(g.fragments.size, 4); assert.equal(g.collectFragment(), false);
  for (let i = 0; i < length && g.replaying; i++) g.advance();
  assert.equal(g.phase, "ended"); assert.equal(g.history.length, length);
  assert.equal(g.fragments.size, 4);
});
test("重开清除碎片、四季手势、历史和两段影子进度", () => {
  const g = new Game(); finish(g); g.advance();
  assert.equal(g.phase, "tutorial"); assert.equal(g.fragments.size, 0);
  assert.equal(g.shadowProgress, 0); assert.equal(g.finalShadow, 0);
  assert.equal(g.events.spring.petals, 0); assert.equal(g.events.winter.memory, 0);
  assert.equal(g.canGoBack, false); assert.equal(g.spot.id, "sundial");
});
test("回看后恢复未识别春地点，仍需正确Marker", () => {
  const g = new Game(); opening(g); g.back();
  assert.equal(g.phase, "transformed"); assert.equal(g.replaying, true);
  g.advance(); assert.equal(g.replaying, false); assert.equal(g.phase, "scan");
  g.advance(); assert.equal(g.phase, "scan");
  assert.equal(g.recognize("summer"), false); assert.equal(g.recognize("spring"), true);
});
