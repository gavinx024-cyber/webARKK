import { SPRING_PETALS, FROST_CELLS, MEMORY_NODES, GEM_POSITION, eventProgress } from "./spot-events.js";
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export class SeasonScene {
  constructor(T) {
    this.T = T;
    this.root = new T.Group();
    this.kind = null;
    this.drag = null;
    this.age = 0;
  }
  mesh(geometry, color, parent = this.root, extra = {}) {
    const T = this.T;
    const mesh = new T.Mesh(geometry, new T.MeshStandardMaterial({ color, roughness: 0.6, ...extra }));
    parent.add(mesh);
    return mesh;
  }
  ring(radius, color, parent = this.root) {
    const T = this.T;
    const ring = new T.Mesh(new T.TorusGeometry(radius, 0.005, 4, 64),
      new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    parent.add(ring);
    return ring;
  }
  label(text, width, height, parent, color = "#d9eeff") {
    const T = this.T, canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 128;
    const context = canvas.getContext("2d");
    context.fillStyle = color; context.font = "bold 36px UtsuboJP, sans-serif";
    context.textAlign = "center"; context.textBaseline = "middle";
    context.fillText(text, 256, 64, 490);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
    const plane = new T.Mesh(new T.PlaneGeometry(width, height),
      new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: T.DoubleSide }));
    parent.add(plane);
    return plane;
  }
  setGame(game) {
    if (this.kind !== game.spot.id) this.build(game.spot.id);
    if (this.phase !== game.phase) { this.age = 0; this.cancelDrag(); }
    this.phase = game.phase;
    this.game = game;
    this.root.visible = game.index > 0 && game.phase !== "scan";
  }
  build(id) {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    this.root.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
      if (object.material?.map) textures.add(object.material.map);
    });
    this.root.clear(); geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose());
    this.kind = id;
    if (id === "sundial") return;
    const T = this.T, colors = { spring: 0xf29bbb, summer: 0x55cdeb, autumn: 0xffc15a, winter: 0xc0acf8 };
    this.aura = this.ring(0.31, colors[id]); this.aura.position.z = 0.04;
    this.gem = this.mesh(new T.OctahedronGeometry(0.065), colors[id], this.root,
      { emissive: colors[id], emissiveIntensity: 0.55, metalness: 0.2 });
    this.gem.position.set(GEM_POSITION.x, GEM_POSITION.y, GEM_POSITION.z);
    this.gem.visible = false;
    this.gemHalo = this.ring(0.105, colors[id]); this.gemHalo.position.copy(this.gem.position);
    this.gemHalo.visible = false;
    const count = 48, positions = new Float32Array(count * 3);
    this.sparks = new T.Points(new T.BufferGeometry(), new T.PointsMaterial({
      color: colors[id], size: 0.017, transparent: true, opacity: 0.7, depthWrite: false, blending: T.AdditiveBlending,
    }));
    this.sparks.geometry.setAttribute("position", new T.BufferAttribute(positions, 3));
    this.sparks.frustumCulled = false; this.root.add(this.sparks);
    if (id === "spring") this.buildSpring();
    if (id === "summer") this.buildSummer();
    if (id === "autumn") this.buildAutumn();
    if (id === "winter") this.buildWinter();
  }
  buildSpring() {
    const T = this.T;
    this.flowers = [];
    const stemGeo = new T.CylinderGeometry(0.006, 0.009, 0.22, 6);
    const petalGeo = new T.SphereGeometry(0.044, 10, 6);
    for (let i = 0; i < 6; i++) {
      const flower = new T.Group(), angle = i * Math.PI * 2 / 6;
      flower.position.set(Math.cos(angle) * 0.15, Math.sin(angle) * 0.15, 0.05);
      const stem = this.mesh(stemGeo, 0x54896a, flower);
      stem.rotation.x = Math.PI / 2; stem.position.z = 0.11;
      const bloom = new T.Group(); bloom.position.z = 0.24; flower.add(bloom);
      for (let p = 0; p < 6; p++) {
        const a = p * Math.PI / 3;
        const petal = this.mesh(petalGeo, p % 2 ? 0xffbdd5 : 0xec76a5, bloom);
        petal.position.set(Math.cos(a) * 0.037, Math.sin(a) * 0.037, 0);
        petal.scale.set(1, 0.65, 0.35); petal.rotation.z = a;
      }
      this.mesh(new T.SphereGeometry(0.017, 8, 6), 0xffd984, bloom);
      flower.userData.bloom = bloom;
      this.root.add(flower); this.flowers.push(flower);
    }
    this.petalTargets = SPRING_PETALS.map((point, i) => {
      const petal = this.mesh(new T.SphereGeometry(0.048, 12, 8), 0xffa4cb, this.root,
        { emissive: 0xa13869, emissiveIntensity: 0.3 });
      petal.position.set(point.x, point.y, point.z); petal.scale.set(1, 0.6, 0.25);
      petal.rotation.z = Math.atan2(point.y, point.x); return petal;
    });
    this.flowerCenter = this.ring(0.08, 0xffe4a5); this.flowerCenter.position.z = 0.20;
  }
  buildSummer() {
    const T = this.T;
    const basin = this.mesh(new T.CylinderGeometry(0.26, 0.29, 0.07, 32), 0x718d9b);
    basin.rotation.x = Math.PI / 2; basin.position.z = 0.035;
    this.waterSurface = this.mesh(new T.CircleGeometry(0.235, 40), 0x69d9ed, this.root,
      { transparent: true, opacity: 0.65, roughness: 0.15, metalness: 0.25 });
    this.waterSurface.position.z = 0.077;
    this.jets = [];
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.12;
      const curve = new T.CatmullRomCurve3([
        new T.Vector3(x, -0.05, 0.08), new T.Vector3(x, 0.02, 0.36 - Math.abs(i - 1) * 0.07),
        new T.Vector3(x, 0.12, 0.31), new T.Vector3(x, 0.19, 0.09),
      ]);
      const jet = this.mesh(new T.TubeGeometry(curve, 20, 0.011, 6, false), 0x83e7fa, this.root,
        { transparent: true, opacity: 0.70, emissive: 0x176ca0, emissiveIntensity: 0.3 });
      this.jets.push(jet);
    }
    this.drops = [];
    const geometry = new T.SphereGeometry(0.016, 8, 6);
    for (let i = 0; i < 18; i++) {
      const drop = this.mesh(geometry, 0xc0f9ff, this.root, { transparent: true, opacity: 0.8 });
      this.drops.push(drop);
    }
    this.waterCue = this.ring(0.065, 0x9cf3ff); this.waterCue.position.set(0, -0.10, 0.16);
    this.waterArrow = new T.Line(new T.BufferGeometry().setFromPoints([
      new T.Vector3(0, -0.07, 0.16), new T.Vector3(0, 0.16, 0.16),
      new T.Vector3(-0.04, 0.11, 0.16), new T.Vector3(0, 0.16, 0.16), new T.Vector3(0.04, 0.11, 0.16),
    ]), new T.LineBasicMaterial({ color: 0xb5f7ff }));
    this.root.add(this.waterArrow);
  }
  buildAutumn() {
    const T = this.T;
    this.trees = [];
    for (let i = 0; i < 3; i++) {
      const tree = new T.Group(); tree.position.set((i - 1) * 0.17, 0.04 + (i % 2) * 0.04, 0.035);
      const trunk = this.mesh(new T.CylinderGeometry(0.014, 0.025, 0.26, 7), 0x8a6c54, tree);
      trunk.rotation.x = Math.PI / 2; trunk.position.z = 0.13;
      for (const sign of [-1, 1]) {
        const branch = this.mesh(new T.CylinderGeometry(0.006, 0.01, 0.16, 6), 0x8a6c54, tree);
        branch.position.set(sign * 0.038, 0, 0.20);
        branch.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(sign * 0.4, 0, 0.9).normalize());
      }
      const crown = this.mesh(new T.IcosahedronGeometry(0.11, 0), 0xd6b58b, tree,
        { transparent: true, opacity: 0.72 });
      crown.position.z = 0.30; crown.scale.set(1.1, 0.8, 1);
      tree.userData.crown = crown; this.root.add(tree); this.trees.push(tree);
    }
    const shape = new T.Shape();
    shape.moveTo(0, -0.030); shape.quadraticCurveTo(0.040, -0.010, 0, 0.030);
    shape.quadraticCurveTo(-0.035, 0.005, 0, -0.030);
    const geometry = new T.ShapeGeometry(shape);
    this.leaves = Array.from({ length: 18 }, (_, i) => {
      const leaf = this.mesh(geometry, i % 2 ? 0xef9e45 : 0xf4ce72, this.root, { side: T.DoubleSide });
      return leaf;
    });
    this.windCue = this.ring(0.25, 0xffd49a); this.windCue.position.z = 0.25;
    this.windFill = new T.Mesh(new T.RingGeometry(0.244, 0.257, 64, 1, 0, -Math.PI * 2),
      new T.MeshBasicMaterial({ color: 0xffc15a, side: T.DoubleSide, transparent: true, opacity: 0.8 }));
    this.windFill.position.z = 0.255; this.root.add(this.windFill);
    const arrow = new T.Shape();
    arrow.moveTo(-0.013, 0.018); arrow.lineTo(0.013, 0.018); arrow.lineTo(0, -0.018); arrow.closePath();
    this.windArrow = this.mesh(new T.ShapeGeometry(arrow), 0xffe7ba, this.root, { side: T.DoubleSide });
    this.windArrow.position.set(0.25, -0.027, 0.26);
  }
  buildWinter() {
    const T = this.T;
    const base = this.mesh(new T.BoxGeometry(0.54, 0.45, 0.055), 0x6c7183);
    base.position.set(0, 0.08, 0.035);
    const stone = this.mesh(new T.BoxGeometry(0.46, 0.36, 0.16), 0x8a90a3,
      this.root, { roughness: 0.94 });
    stone.position.set(0, 0.10, 0.14);
    this.label("大塩平八郎", 0.37, 0.08, this.root).position.set(0, 0.15, 0.224);
    this.label("時の記憶", 0.27, 0.065, this.root).position.set(0, 0.05, 0.224);
    this.frost = FROST_CELLS.map((point) => {
      const tile = this.mesh(new T.PlaneGeometry(0.116, 0.116), 0xe4edff, this.root,
        { transparent: true, opacity: 0.90, roughness: 1, emissive: 0x4c678a, emissiveIntensity: 0.2 });
      tile.position.set(point.x, point.y, point.z); return tile;
    });
    this.memory = MEMORY_NODES.map((point, index) => {
      const node = new T.Group(); node.position.set(point.x, point.y, point.z);
      const sphere = this.mesh(new T.SphereGeometry(0.028, 12, 8), 0xc0acf8, node,
        { emissive: 0x8361e5, emissiveIntensity: 0.7 });
      this.label(String(index + 1), 0.07, 0.07, node, "#192539").position.z = 0.03;
      this.root.add(node); node.userData.sphere = sphere; return node;
    });
    this.memoryLine = new T.Line(new T.BufferGeometry().setFromPoints(MEMORY_NODES.map((p) => new T.Vector3(p.x, p.y, p.z))),
      new T.LineBasicMaterial({ color: 0xbcefff }));
    this.root.add(this.memoryLine);
    this.memoryCue = this.ring(0.048, 0xeff9ff);
    this.winterWave = this.ring(0.28, 0xbfd5ff); this.winterWave.position.z = 0.26;
    this.snow = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({
      color: 0xe2efff, transparent: true, opacity: 0.72, depthWrite: false,
    }));
    this.snow.geometry.setAttribute("position", new T.BufferAttribute(new Float32Array(18 * 6 * 3), 3));
    this.snow.frustumCulled = false; this.root.add(this.snow);
  }
  update(delta, time, reduced, available) {
    if (!this.root.visible || !this.game) return;
    if (available) this.age += Math.min(delta, 0.1);
    const g = this.game, state = g.events[this.kind], phase = g.phase;
    const restored = ["fragment", "reward"].includes(phase) || phase === "restoring";
    const reveal = restored ? (phase === "restoring" ? clamp(this.age / 2) : 1) : 0;
    const t = reduced ? 0 : time / 1000;
    this.aura.material.opacity = 0.3 + eventProgress(this.kind, state) * 0.4;
    this.aura.rotation.z = restored && !reduced ? t * 0.35 : 0;
    if (this.kind === "spring") {
      this.flowers.forEach((flower, i) => {
        flower.scale.z = 0.20 + reveal * 0.8;
        flower.userData.bloom.scale.setScalar(0.25 + reveal * 0.75);
        flower.rotation.z = restored && !reduced ? Math.sin(t * 1.8 + i) * 0.05 : 0;
      });
      this.petalTargets.forEach((petal, i) => {
        petal.visible = !(state.petals & (1 << i)) && phase === "event";
        const point = this.drag?.index === i ? this.drag.point : SPRING_PETALS[i];
        petal.position.set(point.x, point.y, 0.20);
      });
      this.flowerCenter.visible = phase === "event";
      this.flowerCenter.material.opacity = reduced ? 0.9 : 0.6 + Math.sin(t * 3) * 0.2;
    }
    this.updateSeason(state, reveal, t, restored, reduced);
    this.gem.visible = this.gemHalo.visible = phase === "fragment";
    this.gem.rotation.set(t * 0.5, t * 0.7, 0);
    this.gem.position.y = this.drag?.type === "fragment" ? this.drag.point.y : GEM_POSITION.y;
    this.gemHalo.position.copy(this.gem.position);
    this.gemHalo.rotation.z = t;
    this.sparks.visible = restored;
    const positions = this.sparks.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const a = i * 2.39996 + t * 0.18, r = 0.14 + (i % 7) * 0.045;
      positions.setXYZ(i, Math.cos(a) * r, Math.sin(a) * r,
        0.05 + ((i / positions.count + t * 0.16) % 1) * 0.5 * reveal);
    }
    positions.needsUpdate = true;
    if (phase === "restoring" && this.age >= 2.2 && available) g.finishRestoration();
  }
  updateSeason(state, reveal, t, restored, reduced) {
    if (this.kind === "summer") {
      this.jets.forEach((jet, i) => {
        jet.visible = state.water > i || restored;
        jet.scale.z = 0.5 + (restored ? 0.5 * reveal : state.water / 6);
      });
      this.drops.forEach((drop, i) => {
        const age = restored ? (t * 0.65 + i / 18) % 1 : i / 18;
        drop.position.set(((i % 3) - 1) * 0.12 + Math.sin(age * Math.PI) * 0.035,
          -0.04 + age * 0.24, 0.085 + Math.sin(age * Math.PI) * (0.21 + reveal * 0.12));
        drop.scale.set(1, 1, restored ? 1.7 : 1);
      });
      this.waterCue.visible = this.waterArrow.visible = this.phase === "event";
      this.waterSurface.material.opacity = 0.35 + reveal * 0.35;
    }
    if (this.kind === "autumn") {
      const progress = eventProgress("autumn", state);
      this.trees.forEach((tree, i) => {
        tree.rotation.y = restored && !reduced ? Math.sin(t * 1.4 + i) * 0.07 : 0;
        tree.userData.crown.material.color.setHex(restored ? 0xd99a4a : 0xd6b58b);
      });
      this.leaves.forEach((leaf, i) => {
        const a = i * Math.PI * 2 / 18 + (restored ? t * (0.8 + i % 3 * 0.15) : progress * 0.35);
        const radius = restored ? 0.20 + (i % 5) * 0.06 : 0.27;
        leaf.position.set(Math.cos(a) * radius, Math.sin(a) * radius,
          0.28 + (restored ? Math.sin(t * 0.9 + i) * 0.12 : 0.025 * (i % 3)));
        leaf.rotation.set(restored ? Math.sin(t + i) * 0.65 : 0, 0, a + Math.PI / 3);
      });
      this.windCue.visible = this.windFill.visible = this.windArrow.visible = this.phase === "event";
      this.windFill.geometry.setDrawRange(0, Math.floor(progress * 64) * 6);
    }
    if (this.kind === "winter") {
      this.frost.forEach((tile, i) => { tile.visible = !(state.frost & (1 << i)); });
      const clear = state.frost === 4095;
      this.memory.forEach((node, i) => {
        node.visible = clear;
        node.userData.sphere.material.color.setHex(i < state.memory ? 0x74e4cd : 0xc0acf8);
        node.scale.setScalar(i === state.memory && !reduced ? 1 + Math.sin(t * 4) * 0.12 : 1);
      });
      this.memoryLine.visible = clear;
      this.memoryLine.geometry.setDrawRange(0, state.memory);
      this.memoryCue.visible = clear && this.phase === "event" && state.memory < 4;
      if (state.memory < 4) {
        const point = MEMORY_NODES[state.memory]; this.memoryCue.position.set(point.x, point.y, point.z + 0.02);
      }
      const wave = reduced ? 0.5 : (t * 0.45) % 1;
      this.winterWave.visible = restored;
      this.winterWave.scale.setScalar(0.7 + wave);
      this.winterWave.material.opacity = (1 - wave) * 0.65;
      this.snow.visible = restored;
      const vertices = this.snow.geometry.attributes.position;
      for (let i = 0; i < 18; i++) {
        const x = Math.sin(i * 2.39996) * 0.46 + Math.sin(t + i) * 0.025;
        const y = 0.53 - ((i / 18 + t * 0.12) % 1) * 1.06;
        const z = 0.28 + Math.cos(i) * 0.08;
        for (let axis = 0; axis < 3; axis++) {
          const a = axis * Math.PI / 3, dx = Math.cos(a) * 0.015, dy = Math.sin(a) * 0.015;
          vertices.setXYZ(i * 6 + axis * 2, x - dx, y - dy, z);
          vertices.setXYZ(i * 6 + axis * 2 + 1, x + dx, y + dy, z);
        }
      }
      vertices.needsUpdate = true;
    }
  }
  cancelDrag() { this.drag = null; }
  getTargets() {
    const g = this.game;
    if (!g || g.replaying || !this.root.visible) return [];
    if (g.phase === "fragment") return [{ ...GEM_POSITION, type: "fragment", index: 0 }];
    if (g.phase !== "event") return [];
    const state = g.events[this.kind];
    if (this.kind === "spring") return SPRING_PETALS.map((p, index) => ({ ...p, type: "petal", index }))
      .filter((p) => !(state.petals & (1 << p.index)));
    if (this.kind === "summer") return [{ x: 0, y: -0.10, z: 0.16, type: "water", index: 0 }];
    if (this.kind === "autumn") return [{ x: 0.25, y: 0, z: 0.25, type: "wind", index: 0 }];
    if (this.kind === "winter") return state.frost !== 4095
      ? FROST_CELLS.map((p, index) => ({ ...p, type: "wipe", index })).filter((p) => !(state.frost & (1 << p.index)))
      : MEMORY_NODES.map((p, index) => ({ ...p, type: "memory", index })).filter((p) => p.index === state.memory);
    return [];
  }
  selectTarget(target) {
    if (target.type === "fragment") return this.game.collectFragment();
    return this.game.interact({ ...target, delta: 0.5 });
  }
}
