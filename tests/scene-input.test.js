import test from "node:test";
import assert from "node:assert/strict";
import { THREE as T } from "./fixtures/three-from-aframe.js";
import { SceneInput } from "../js/scene-input.js";
import { Sundial } from "../js/sundial.js";
import { Game, SHADOW_LIMIT } from "../js/game.js";
import { SPRING_PETALS, FROST_CELLS, MEMORY_NODES, GEM_POSITION, TAU } from "../js/spot-events.js";
class Canvas {
  constructor() { this.listeners = new Map(); this.captured = new Set(); }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  removeEventListener(name) { this.listeners.delete(name); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 844 }; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  send(name, point, pointerId = 1) {
    this.listeners.get(name)?.({ clientX: point.x, clientY: point.y, pointerId,
      pointerType: "touch", button: 0, preventDefault() {} });
  }
}
function setup(id) {
  const game = new Game(); game.debugJump(id); game.recognize(id);
  const root = new T.Group(); root.position.set(-0.12, 0.08, -2);
  root.rotation.set(0.1, -0.25, 0.15); root.scale.setScalar(0.55);
  const camera = new T.PerspectiveCamera(45, 390 / 844, 0.01, 5000);
  camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  let available = true;
  const scene = { root, drag: null, cancelDrag() { this.drag = null; } };
  const input = new SceneInput(T, scene, camera, game, () => available);
  const canvas = new Canvas(); input.attach(canvas);
  function screen(point) {
    root.updateWorldMatrix(true, true);
    const vector = new T.Vector3(point.x, point.y, point.z ?? 0.2);
    root.localToWorld(vector); vector.project(camera);
    return { x: (vector.x + 1) * 195, y: (1 - vector.y) * 422 };
  }
  function drag(from, to, pointer = 1) {
    canvas.send("pointerdown", screen(from), pointer);
    canvas.send("pointermove", screen(to), pointer);
    canvas.send("pointerup", screen(to), pointer);
  }
  return { game, root, camera, canvas, scene, input, screen, drag,
    available(value) { available = value; } };
}
test("实际THREE射线：旋转、缩放的Marker坐标能从屏幕正确还原", () => {
  const h = setup("spring");
  for (const target of SPRING_PETALS) {
    const screen = h.screen(target);
    const point = h.input.project({ clientX: screen.x, clientY: screen.y });
    assert.ok(point.distanceTo(new T.Vector3(target.x, target.y, target.z)) < 1e-6);
  }
  h.root.position.set(70, 15, -1200); h.root.scale.setScalar(768);
  const target = SPRING_PETALS[3], screen = h.screen(target);
  const point = h.input.project({ clientX: screen.x, clientY: screen.y });
  assert.ok(point.distanceTo(new T.Vector3(target.x, target.y, target.z)) < 1e-6,
    "MindAR图像像素单位仍能正确投射");
});
test("触摸春季：必须抓住未收集的花瓣并送到花心，误触或多指不领取", () => {
  const h = setup("spring");
  h.drag({ x: 0.6, y: 0, z: 0.2 }, { x: 0, y: 0, z: 0.2 });
  assert.equal(h.game.events.spring.petals, 0);
  h.canvas.send("pointerdown", h.screen(SPRING_PETALS[0]), 1);
  h.canvas.send("pointerup", h.screen({ x: 0, y: 0, z: 0.2 }), 2);
  assert.equal(h.game.events.spring.petals, 0);
  h.canvas.send("pointerup", h.screen({ x: 0, y: 0, z: 0.2 }), 1);
  for (const target of SPRING_PETALS.slice(1)) h.drag(target, { x: 0, y: 0, z: 0.2 });
  assert.equal(h.game.phase, "restoring");
  assert.equal(h.canvas.captured.size, 0);
});
test("触摸夏季：点击、向下或太短无效，三次向上释放完成", () => {
  const h = setup("summer"), start = { x: 0, y: -0.1, z: 0.16 };
  for (const y of [-0.1, -0.25, -0.05]) h.drag(start, { ...start, y });
  assert.equal(h.game.events.summer.water, 0);
  for (let i = 0; i < 3; i++) h.drag(start, { ...start, y: 0.18 });
  assert.equal(h.game.phase, "restoring");
});
test("触摸秋季：来回不累计，正确顺时针圆周触发恢复", () => {
  const h = setup("autumn"), point = (a) => ({ x: Math.cos(a) * 0.25, y: Math.sin(a) * 0.25, z: 0.25 });
  h.canvas.send("pointerdown", h.screen(point(0)));
  for (let i = 0; i < 20; i++) {
    h.canvas.send("pointermove", h.screen(point(-0.2)));
    h.canvas.send("pointermove", h.screen(point(0)));
  }
  assert.ok(h.game.events.autumn.wind < 1e-6);
  for (let i = 1; i <= 40; i++) h.canvas.send("pointermove", h.screen(point(-i * TAU / 40 - 0.00001)));
  h.canvas.send("pointerup", h.screen(point(-TAU)));
  assert.equal(h.game.phase, "restoring");
});
test("触摸冬季：擦霜，然后按顺序滑过记忆点", () => {
  const h = setup("winter");
  for (const point of FROST_CELLS) h.drag(point, point);
  assert.equal(h.game.events.winter.frost, 4095);
  h.canvas.send("pointerdown", h.screen(MEMORY_NODES[0]));
  for (const point of MEMORY_NODES.slice(1)) h.canvas.send("pointermove", h.screen(point));
  h.canvas.send("pointerup", h.screen(MEMORY_NODES[3]));
  assert.equal(h.game.phase, "restoring");
});
test("碎片必须向上拔出；丢卡取消输入、恢复后可继续，不重复领奖", () => {
  const h = setup("summer");
  for (let i = 0; i < 3; i++) h.game.interact({ type: "water" });
  h.game.finishRestoration();
  h.drag(GEM_POSITION, GEM_POSITION);
  assert.equal(h.game.phase, "fragment");
  h.canvas.send("pointerdown", h.screen(GEM_POSITION));
  h.available(false);
  h.canvas.send("pointermove", h.screen({ ...GEM_POSITION, y: 0.28 }));
  h.canvas.send("pointerup", h.screen({ ...GEM_POSITION, y: 0.28 }));
  assert.equal(h.input.active, null); assert.equal(h.game.fragments.size, 0);
  h.available(true); h.drag(GEM_POSITION, { ...GEM_POSITION, y: 0.28 });
  assert.equal(h.game.phase, "reward"); assert.equal(h.game.fragments.size, 1);
  h.drag(GEM_POSITION, { ...GEM_POSITION, y: 0.28 });
  assert.equal(h.game.fragments.size, 1);
  h.input.detach(); assert.equal(h.canvas.listeners.size, 0);
});
test("实际日晷触摸：开场阻力和终章整周，松开后保持进度", () => {
  const h = setup("sundial"), dial = new Sundial(T); h.root.add(dial.root);
  dial.root.visible = true; h.game.advance(); h.game.advance();
  dial.setPhase(h.game.phase, h.game.shadowProgress);
  h.game.onChange = () => dial.setPhase(h.game.phase, h.game.shadowProgress, h.game.finalShadow);
  dial.attachInput(h.canvas, h.camera, h.game, () => true);
  const point = (a) => ({ x: Math.cos(a) * 0.275, y: Math.sin(a) * 0.275, z: 0.066 });
  function arc(amount) {
    const start = dial.angle;
    h.canvas.send("pointerdown", h.screen(point(start)));
    for (let i = 1; i <= 32; i++) h.canvas.send("pointermove", h.screen(point(start - amount * i / 32)));
    h.canvas.send("pointerup", h.screen(point(start - amount)));
  }
  arc(0.6); assert.ok(h.game.shadowProgress > 0.59);
  arc(SHADOW_LIMIT - 0.6 + 0.01); assert.equal(h.game.phase, "opening-jammed");
  h.game.debugFinal(); h.game.recognize("sundial"); h.game.finishAssembly();
  arc(TAU + 0.01); assert.equal(h.game.phase, "time-restored");
  assert.equal(h.canvas.captured.size, 0);
});
