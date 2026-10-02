import test from "node:test";
import assert from "node:assert/strict";
import { THREE as T } from "./fixtures/three-from-aframe.js";
import { Game, SHADOW_LIMIT } from "../js/game.js";
import { TAU } from "../js/spot-events.js";
class Element {
  constructor() {
    this.object3D = new T.Group(); this.listeners = new Map();
    this.classList = { add() {}, toggle() {} };
  }
  setObject3D(_name, object) { this.object3D.add(object); }
  setAttribute(name, value) { if (name === "visible") this.object3D.visible = value; }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  append() {}
  click() { this.listeners.get("click")?.(); }
}
const drawing = { clearRect() {}, beginPath() {}, roundRect() {}, fill() {}, fillText() {},
  measureText(text) { return { width: text.length * 28 }; } };
globalThis.document = { hidden: false, fonts: { load: async () => [] }, createElement(name) {
  return name === "canvas" ? { width: 0, height: 0, getContext: () => drawing } : new Element();
} };
globalThis.window = new EventTarget();
globalThis.matchMedia = () => ({ matches: false });
class Loader { load(_url, loaded) { loaded?.(); return new T.Texture(); } }
globalThis.AFRAME = { THREE: { ...T, TextureLoader: Loader }, registerComponent() {} };
const { Stage } = await import("../js/stage.js");
function setup() {
  const el = new Element();
  el.sceneEl = { camera: new T.PerspectiveCamera(), renderer: { xr: { isPresenting: false } } };
  const stage = new Stage(el, () => {}), game = new Game(); stage.sundialEnabled = true;
  game.onChange = () => stage.setGame(game); stage.setGame(game);
  let clock = 0;
  return { stage, game, el, tick(count) { for (let i = 0; i < count; i++) stage.update(clock += 100); } };
}
test("舞台计时与终章衔接：自动冻结、丢卡暂停汇聚、转满一周后变回原形并放烟花", () => {
  const h = setup(); h.game.advance(); h.game.recognize("sundial");
  h.tick(41); assert.equal(h.game.phase, "opening-frozen");
  h.game.advance(); for (let n = 0; n < 10; n++) h.game.moveShadow(0.25);
  assert.equal(h.game.phase, "opening-jammed"); assert.equal(h.game.shadowProgress, SHADOW_LIMIT);
  h.game.debugFinal(); h.game.recognize("sundial");
  h.el.object3D.visible = false; h.tick(40); assert.equal(h.game.phase, "finale");
  h.el.object3D.visible = true; h.tick(33); assert.equal(h.game.phase, "finale-drag");
  assert.equal(h.stage.fragments.filter((gem) => gem.visible).length, 4);
  for (let n = 0; n < 26; n++) h.game.moveShadow(0.25);
  assert.equal(h.game.phase, "time-restored"); assert.equal(h.game.finalShadow, TAU);
  h.tick(31); assert.equal(h.game.phase, "ended");
  h.tick(20); assert.equal(h.stage.h.transforming, false);
  assert.equal(h.stage.h.getAppearanceInfo().form, "original");
  assert.equal(h.stage.fireworks.visible, true);
  h.game.back(); h.tick(40); assert.equal(h.game.phase, "time-restored", "回看不自动推进");
});
test("Quest场景点击入口的冷却过滤重复点击，影子目标随进度更新", () => {
  const h = setup(); h.game.questMode = true; h.stage.setXR(true);
  h.game.debugJump("summer"); h.game.recognize("summer"); h.tick(1);
  h.stage.xrTargets[0].click(); h.stage.xrTargets[0].click();
  assert.equal(h.game.events.summer.water, 1);
  h.tick(3); h.stage.xrTargets[0].click(); assert.equal(h.game.events.summer.water, 2);
  h.tick(3); h.stage.xrTargets[0].click(); assert.equal(h.game.phase, "restoring");
  h.tick(23); assert.equal(h.game.phase, "fragment");
  h.stage.xrTargets[0].click(); assert.equal(h.game.fragments.size, 1);
  h.stage.xrTargets[0].click(); assert.equal(h.game.fragments.size, 1);
  h.game.reset(); h.game.advance(); h.game.recognize("sundial"); h.game.advance(); h.game.advance();
  h.tick(3); const target = h.stage.xrTargets[0]; const position = target.object3D.position.clone();
  target.click(); h.tick(3);
  assert.ok(h.game.shadowProgress > 0); assert.ok(position.distanceTo(target.object3D.position) > 0.01);
});
