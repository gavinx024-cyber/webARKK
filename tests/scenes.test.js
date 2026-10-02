import test from "node:test";
import assert from "node:assert/strict";
import { THREE as T } from "./fixtures/three-from-aframe.js";
import { SeasonScene } from "../js/season-scene.js";
import { createH } from "../js/character-billboard.js";
import { Game } from "../js/game.js";

// Canvas text is stubbed; geometry, transforms, rays and animation code are real.
const context = { fillText() {}, measureText(text) { return { width: text.length * 28 }; } };
globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return context; } }; } };
function validGeometry(root) {
  root.traverse((object) => {
    for (const attr of Object.values(object.geometry?.attributes || {}))
      for (const value of attr.array) assert.ok(Number.isFinite(value), "场景顶点必须有效");
    for (const value of [...object.position.toArray(), ...object.scale.toArray(), ...object.quaternion.toArray()])
      assert.ok(Number.isFinite(value), "动画变换必须有效");
  });
}
function interact(game, id) {
  if (id === "spring") for (let index = 0; index < 5; index++) game.interact({ type: "petal", index });
  if (id === "summer") for (let i = 0; i < 3; i++) game.interact({ type: "water" });
  if (id === "autumn") for (let i = 0; i < 13; i++) game.interact({ type: "wind", delta: 0.5 });
  if (id === "winter") {
    for (let index = 0; index < 12; index++) game.interact({ type: "wipe", index });
    for (let index = 0; index < 4; index++) game.interact({ type: "memory", index });
  }
}
for (const id of ["spring", "summer", "autumn", "winter"]) {
  test(`${id}真实几何和恢复演出：丢卡暂停计时、恢复后碎片自动出现`, () => {
    const game = new Game(), scene = new SeasonScene(T);
    game.onChange = () => scene.setGame(game);
    game.debugJump(id); game.recognize(id);
    scene.update(0.1, 100, false, true); validGeometry(scene.root);
    interact(game, id); assert.equal(game.phase, "restoring");
    for (let i = 0; i < 30; i++) scene.update(0.1, 1000 + i * 100, false, false);
    assert.equal(game.phase, "restoring"); assert.equal(scene.age, 0);
    for (let i = 0; i < 23; i++) scene.update(0.1, 4000 + i * 100, false, true);
    assert.equal(game.phase, "fragment");
    scene.update(0.1, 6400, false, true);
    assert.equal(scene.gem.visible, true); validGeometry(scene.root);
    scene.selectTarget(scene.getTargets()[0]); assert.equal(game.phase, "reward");
    assert.equal(game.fragments.size, 1);
    assert.equal(scene.selectTarget({ type: "fragment" }), false);
    game.back(); assert.equal(game.phase, "fragment");
    assert.deepEqual(scene.getTargets(), [], "回看不提供可领奖目标");
    validGeometry(scene.root);
  });
}
test("Quest选择交互使用相同规则，清除已完成目标且每季仅领取一次", () => {
  const game = new Game(), scene = new SeasonScene(T); game.questMode = true;
  game.onChange = () => scene.setGame(game);
  for (const id of ["spring", "summer", "autumn", "winter"]) {
    game.debugJump(id); game.recognize(id);
    for (let i = 0; i < 30 && game.phase === "event"; i++) {
      const targets = scene.getTargets(); assert.ok(targets.length > 0);
      scene.selectTarget(targets[0]);
    }
    assert.equal(game.phase, "restoring");
    game.finishRestoration(); scene.selectTarget(scene.getTargets()[0]);
    assert.equal(game.phase, "reward"); assert.deepEqual(scene.getTargets(), []);
  }
  assert.equal(game.fragments.size, 4);
});
test("小H两形态过渡和五种动作几何有效，过渡结束释放继续锁", () => {
  class Loader { load(_url, loaded) { const texture = new T.Texture(); loaded(); return texture; } }
  const h = createH({ ...T, TextureLoader: Loader }), parent = new T.Group(); parent.add(h.root);
  const camera = new T.PerspectiveCamera(); camera.position.z = 2;
  h.update(10000); h.setForm("suit");
  assert.equal(h.transforming, true); assert.equal(h.update(10900), false);
  assert.equal(h.update(11800), true); assert.equal(h.transforming, false);
  assert.equal(h.getAppearanceInfo().form, "suit");
  for (const motion of ["idle", "fly", "wave", "point", "celebrate"]) {
    h.setMotion(motion);
    for (let i = 0; i < 10; i++) { h.update(12000 + i * 200); h.faceCamera(camera); validGeometry(h.root); }
    assert.equal(h.getAppearanceInfo().motion, motion);
  }
  h.setForm("original"); assert.equal(h.transforming, true);
  assert.equal(h.update(16000), true); assert.equal(h.getAppearanceInfo().form, "original");
  h.update(16100, true); h.setForm("suit"); assert.equal(h.transforming, false);
});
