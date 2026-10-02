import { SPRING_PETALS, FROST_CELLS, MEMORY_NODES, GEM_POSITION } from "./spot-events.js";
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export class SceneInput {
  constructor(T, scene, camera, game, isAvailable) {
    this.T = T; this.scene = scene; this.camera = camera; this.game = game;
    this.isAvailable = isAvailable;
    this.raycaster = new T.Raycaster(); this.ray = new T.Ray(); this.inverse = new T.Matrix4();
    this.plane = new T.Plane(new T.Vector3(0, 0, 1), -0.20);
    this.point = new T.Vector3(); this.ndc = new T.Vector2(); this.active = null;
  }
  project(event) {
    const g = this.game;
    if (!this.isAvailable() || g.replaying || !["event", "fragment"].includes(g.phase)) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.scene.root.updateWorldMatrix(true, false); this.camera.updateWorldMatrix(true, false);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    this.inverse.copy(this.scene.root.matrixWorld).invert();
    this.ray.copy(this.raycaster.ray).applyMatrix4(this.inverse);
    this.plane.constant = -(g.phase === "fragment" ? GEM_POSITION.z :
      { spring: 0.20, summer: 0.16, autumn: 0.25, winter: 0.24 }[g.spot.id]);
    return this.ray.intersectPlane(this.plane, this.point)?.clone();
  }
  attach(canvas) {
    this.detach?.(); this.canvas = canvas;
    const down = (event) => {
      if (this.active || (event.pointerType === "mouse" && event.button !== 0)) return;
      const point = this.project(event); if (!point) return;
      const g = this.game, kind = g.spot.id;
      let type = kind, index = -1;
      if (g.phase === "fragment") {
        if (distance(point, GEM_POSITION) > 0.11) return;
        type = "fragment";
      } else if (kind === "spring") {
        index = SPRING_PETALS.findIndex((p, i) => !(g.events.spring.petals & (1 << i)) && distance(point, p) < 0.09);
        if (index < 0) return;
      } else if (kind === "summer") {
        if (Math.abs(point.x) > 0.28 || point.y < -0.30 || point.y > 0.12) return;
      } else if (kind === "autumn") {
        if (Math.hypot(point.x, point.y) < 0.14 || Math.hypot(point.x, point.y) > 0.42) return;
      } else if (kind === "winter") {
        if (Math.abs(point.x) > 0.28 || point.y < -0.18 || point.y > 0.34) return;
      }
      event.preventDefault();
      this.active = { pointer: event.pointerId, type, index, start: point, previous: point, phase: g.phase };
      canvas.setPointerCapture(event.pointerId);
      this.scene.drag = { type, index, point };
      if (kind === "winter" && type !== "fragment") this.wipe(point, point);
    };
    const move = (event) => {
      const active = this.active;
      if (!active || event.pointerId !== active.pointer) return;
      const point = this.project(event);
      if (!point || active.phase !== this.game.phase) { this.cancel(); return; }
      event.preventDefault(); this.scene.drag = { type: active.type, index: active.index, point };
      if (active.type === "autumn") {
        const radius = Math.hypot(point.x, point.y);
        if (radius >= 0.14 && radius <= 0.42 && active.previous) {
          const delta = Math.atan2(point.y, point.x) - Math.atan2(active.previous.y, active.previous.x);
          this.game.interact({ type: "wind", delta: -Math.atan2(Math.sin(delta), Math.cos(delta)) });
        }
        active.previous = radius >= 0.14 && radius <= 0.42 ? point : null;
      } else if (active.type === "winter") this.wipe(active.previous, point);
      if (active.type !== "autumn") active.previous = point;
    };
    const up = (event) => {
      const active = this.active;
      if (!active || event.pointerId !== active.pointer) return;
      const point = this.project(event);
      if (point && active.phase === this.game.phase) {
        if (active.type === "spring" && Math.hypot(point.x, point.y) < 0.10)
          this.game.interact({ type: "petal", index: active.index });
        if (active.type === "summer" && point.y - active.start.y >= 0.12 && Math.abs(point.x - active.start.x) < 0.25)
          this.game.interact({ type: "water" });
        if (active.type === "fragment" && point.y - active.start.y >= 0.10) this.game.collectFragment();
      }
      this.cancel();
    };
    const cancel = () => this.cancel();
    for (const [name, handler] of [["pointerdown", down], ["pointermove", move], ["pointerup", up],
      ["pointercancel", cancel], ["lostpointercapture", cancel]]) canvas.addEventListener(name, handler);
    this.detach = () => {
      this.cancel();
      for (const [name, handler] of [["pointerdown", down], ["pointermove", move], ["pointerup", up],
        ["pointercancel", cancel], ["lostpointercapture", cancel]]) canvas.removeEventListener(name, handler);
    };
  }
  wipe(from, to) {
    if (!from) from = to;
    const state = this.game.events.winter;
    const steps = Math.max(1, Math.ceil(distance(from, to) / 0.035));
    for (let step = 0; step <= steps && this.game.phase === "event"; step++) {
      const point = { x: from.x + (to.x - from.x) * step / steps, y: from.y + (to.y - from.y) * step / steps };
      if (state.frost !== 4095) FROST_CELLS.forEach((cell, index) => {
        if (distance(point, cell) < 0.080) this.game.interact({ type: "wipe", index });
      });
      else if (state.memory < 4 && distance(point, MEMORY_NODES[state.memory]) < 0.085)
        this.game.interact({ type: "memory", index: state.memory });
    }
  }
  cancel() {
    const pointer = this.active?.pointer;
    this.active = null; this.scene.cancelDrag();
    if (pointer !== undefined && this.canvas?.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer);
  }
}
