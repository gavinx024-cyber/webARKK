// Low-poly dial, opening resistance and the full-circle ending interaction.
// The shadow is simulated geometry, not a real-time light/shadow calculation.
export class Sundial {
  constructor(T) {
    this.T = T;
    this.root = new T.Group();
    this.root.visible = false;
    this.phase = null;
    this.baseAngle = -Math.PI / 2;
    this.angle = this.baseAngle;
    this.progress = 0;
    this.finalProgress = 0;
    this.elapsed = 0;
    this.activePointer = null;
    this.raycaster = new T.Raycaster();
    this.localRay = new T.Ray();
    this.inverse = new T.Matrix4();
    this.surface = new T.Plane(new T.Vector3(0, 0, 1), -0.066);
    this.point = new T.Vector3();
    this.ndc = new T.Vector2();
    const stone = new T.MeshStandardMaterial({ color: 0xc6d5d5, roughness: 0.85 });
    const rim = new T.MeshStandardMaterial({ color: 0x557780, roughness: 0.5, metalness: 0.3 });
    for (const [radius, height, z, material] of [
      [0.35, 0.045, 0.017, rim], [0.32, 0.025, 0.052, stone],
    ]) {
      const disc = new T.Mesh(new T.CylinderGeometry(radius, radius, height, 48), material);
      disc.rotation.x = Math.PI / 2;
      disc.position.z = z;
      this.root.add(disc);
    }
    // A triangular gnomon rises out of the card plane along local +Z.
    const shape = new T.Shape();
    shape.moveTo(-0.085, 0);
    shape.lineTo(0.085, 0);
    shape.lineTo(0.035, 0.2);
    shape.closePath();
    const gnomon = new T.Mesh(
      new T.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: false }), rim,
    );
    gnomon.rotation.x = Math.PI / 2;
    gnomon.position.set(0, 0.009, 0.065);
    this.root.add(gnomon);
    this.ticks = [];
    const tickGeometry = new T.BoxGeometry(0.008, 0.022, 0.004);
    for (let i = 0; i < 32; i++) {
      const a = this.baseAngle - i * Math.PI * 2 / 32;
      const material = new T.MeshBasicMaterial({ color: 0x617c87 });
      const tick = new T.Mesh(tickGeometry, material);
      tick.position.set(Math.cos(a) * 0.298, Math.sin(a) * 0.298, 0.068);
      tick.rotation.z = a - Math.PI / 2;
      this.root.add(tick);
      this.ticks.push(tick);
    }
    this.timeRing = new T.Mesh(
      new T.RingGeometry(0.366, 0.371, 64),
      new T.MeshBasicMaterial({ color: 0x79b9f0, transparent: true, opacity: 0.6, side: T.DoubleSide }),
    );
    this.timeRing.position.z = 0.015;
    this.root.add(this.timeRing);
    this.recoveryRings = [0, 1].map(() => {
      const ring = new T.Mesh(new T.RingGeometry(0.37, 0.382, 64),
        new T.MeshBasicMaterial({ color: 0x74e4cd, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
      ring.position.z = 0.10; this.root.add(ring); return ring;
    });
    this.shadow = new T.Group();
    this.shadow.position.z = 0.066;
    const shadowShape = new T.Shape();
    shadowShape.moveTo(0, -0.018);
    shadowShape.lineTo(0.275, -0.007);
    shadowShape.lineTo(0.275, 0.007);
    shadowShape.lineTo(0, 0.018);
    shadowShape.closePath();
    const shade = new T.Mesh(
      new T.ShapeGeometry(shadowShape),
      new T.MeshBasicMaterial({ color: 0x173845, transparent: true, opacity: 0.78, side: T.DoubleSide }),
    );
    this.shadow.add(shade);
    this.handle = new T.Mesh(
      new T.SphereGeometry(0.025, 12, 8),
      new T.MeshBasicMaterial({ color: 0x74e4cd }),
    );
    this.handle.position.set(0.275, 0, 0.009);
    this.shadow.add(this.handle);
    this.root.add(this.shadow);
    this.guide = new T.Group();
    for (let i = 0; i < 3; i++) {
      const arrowShape = new T.Shape();
      arrowShape.moveTo(-0.014, 0.014);
      arrowShape.lineTo(0.014, 0);
      arrowShape.lineTo(-0.014, -0.014);
      arrowShape.closePath();
      const a = this.baseAngle - 0.4 - i * 0.36;
      const arrow = new T.Mesh(new T.ShapeGeometry(arrowShape),
        new T.MeshBasicMaterial({ color: 0x74e4cd, transparent: true, opacity: 0.7, side: T.DoubleSide }));
      arrow.position.set(Math.cos(a) * 0.405, Math.sin(a) * 0.405, 0.02);
      arrow.rotation.z = a - Math.PI / 2;
      this.guide.add(arrow);
    }
    this.root.add(this.guide);
    this.slots = [];
    const diamond = new T.Shape();
    diamond.moveTo(0, 0.065);
    diamond.lineTo(0.048, 0);
    diamond.lineTo(0, -0.065);
    diamond.lineTo(-0.048, 0);
    diamond.closePath();
    const slotGeometry = new T.EdgesGeometry(new T.ExtrudeGeometry(diamond, {
      depth: 0.014, bevelEnabled: false,
    }));
    const angles = [Math.PI / 2, Math.PI, -Math.PI / 2, 0];
    for (let i = 0; i < 4; i++) {
      const material = new T.LineBasicMaterial({ color: 0x79b9f0, transparent: true, opacity: 0 });
      const slot = new T.LineSegments(slotGeometry, material);
      slot.position.set(Math.cos(angles[i]) * 0.44, Math.sin(angles[i]) * 0.44, 0.035);
      slot.visible = false;
      this.root.add(slot);
      const crackGeometry = new T.BufferGeometry().setFromPoints([
        new T.Vector3(Math.cos(angles[i]) * 0.19, Math.sin(angles[i]) * 0.19, 0.068),
        new T.Vector3(Math.cos(angles[i] + 0.08) * 0.27, Math.sin(angles[i] + 0.08) * 0.27, 0.068),
        new T.Vector3(Math.cos(angles[i]) * 0.37, Math.sin(angles[i]) * 0.37, 0.068),
      ]);
      const crack = new T.Line(crackGeometry, material);
      crack.visible = false;
      this.root.add(crack);
      this.slots.push({ slot, crack });
    }
  }
  setPhase(phase, progress, finalProgress = 0) {
    if (phase !== this.phase) {
      this.cancelDrag();
      this.elapsed = 0;
      if (phase === "opening-live") this.angle = this.baseAngle = -Math.PI / 2;
      if (phase === "opening-frozen") this.baseAngle = this.angle;
      if (phase === "opening-drag") {
        this.baseAngle = this.phase === "opening-frozen" ? this.angle : -Math.PI / 2;
        this.angle = this.baseAngle;
      }
      if (phase === "finale") this.angle = this.baseAngle = -Math.PI / 2;
      if (phase === "finale-drag" && this.phase !== "finale") this.baseAngle = -Math.PI / 2;
      this.phase = phase;
    }
    this.progress = progress;
    this.finalProgress = finalProgress;
  }
  update(deltaSeconds, reduced, limit) {
    this.elapsed += Math.min(deltaSeconds, 0.1);
    const p = this.phase;
    if (p === "opening-live" && !reduced) this.angle -= Math.min(deltaSeconds, 0.1) * 0.28;
    if (p === "opening-drag") this.angle = this.baseAngle - this.progress;
    if (p === "finale-drag") this.angle = this.baseAngle - this.finalProgress;
    if (["time-restored", "ended"].includes(p)) this.angle = this.baseAngle - Math.PI * 2 - (reduced ? 0 : this.elapsed * 0.28);
    if (["opening-jammed", "transformed"].includes(p)) {
      const kick = p === "opening-jammed" && !reduced
        ? 0.09 * (1 - Math.exp(-this.elapsed * 8)) + Math.sin(this.elapsed * 23) * 0.025 * Math.exp(-this.elapsed * 5)
        : 0.09;
      this.angle = this.baseAngle - limit + kick;
    }
    this.shadow.rotation.z = this.angle;
    this.guide.visible = ["opening-drag", "finale-drag"].includes(p);
    this.guide.rotation.z = this.baseAngle + Math.PI / 2;
    this.handle.visible = ["opening-frozen", "opening-drag", "opening-jammed", "finale-drag"].includes(p);
    this.handle.scale.setScalar(reduced || !this.guide.visible ? 1 : 1 + Math.sin(this.elapsed * 4) * 0.15);
    this.timeRing.material.color.set(p === "opening-jammed" ? 0xffb376 : 0x79b9f0);
    this.ticks.forEach((tick, i) => {
      const tickAngle = -Math.PI / 2 - Math.PI * 2 * i / 32;
      const a = ((this.baseAngle - tickAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const lit = (["opening-drag", "opening-jammed", "transformed"].includes(p) && a <= this.progress) ||
        (p === "finale-drag" && a <= this.finalProgress) || ["time-restored", "ended"].includes(p);
      tick.material.color.set(lit ? 0x74e4cd : 0x617c87);
    });
    this.slots.forEach(({ slot, crack }, i) => {
      const ending = ["finale", "finale-drag", "time-restored", "ended"].includes(p);
      const shown = ["opening-jammed", "transformed"].includes(p) || ending;
      slot.visible = shown; crack.visible = shown && !ending;
      slot.material.color.set(ending ? [0xf29bbb, 0x55cdeb, 0xffc15a, 0xc0acf8][i] : 0x79b9f0);
      const reveal = reduced || p === "transformed" ? 1 : Math.max(0, Math.min(1, (this.elapsed - i * 0.12) * 4));
      slot.material.opacity = reveal * 0.9;
      slot.scale.setScalar(0.85 + reveal * 0.15);
    });
    this.recoveryRings.forEach((ring, i) => {
      ring.visible = ["time-restored", "ended"].includes(p);
      const wave = reduced ? 0.4 : (this.elapsed * 0.5 + i * 0.5) % 1;
      ring.scale.setScalar(1 + wave * 1.3); ring.material.opacity = (1 - wave) * 0.5;
    });
  }
  attachInput(canvas, camera, game, isAvailable) {
    this.detachInput?.();
    const project = (event) => {
      if (!isAvailable() || !this.root.visible || !["opening-drag", "finale-drag"].includes(game.phase) || game.replaying) return null;
      const rect = canvas.getBoundingClientRect();
      this.ndc.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      this.root.updateWorldMatrix(true, false);
      camera.updateWorldMatrix(true, false);
      this.raycaster.setFromCamera(this.ndc, camera);
      this.inverse.copy(this.root.matrixWorld).invert();
      this.localRay.copy(this.raycaster.ray).applyMatrix4(this.inverse);
      return this.localRay.intersectPlane(this.surface, this.point);
    };
    const down = (event) => {
      if (this.activePointer !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
      const point = project(event);
      if (!point) return;
      const hx = Math.cos(this.angle) * 0.275, hy = Math.sin(this.angle) * 0.275;
      if (Math.hypot(point.x - hx, point.y - hy) > 0.1) return;
      event.preventDefault();
      this.activePointer = event.pointerId;
      this.previousAngle = Math.atan2(point.y, point.x);
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event) => {
      if (event.pointerId !== this.activePointer) return;
      event.preventDefault();
      const point = project(event);
      if (!point) { this.cancelDrag(); return; }
      const radius = Math.hypot(point.x, point.y);
      if (radius < 0.12 || radius > 0.55) { this.previousAngle = null; return; }
      const angle = Math.atan2(point.y, point.x);
      if (this.previousAngle !== null) {
        const difference = this.previousAngle - angle;
        const delta = Math.atan2(Math.sin(difference), Math.cos(difference));
        if (Math.abs(delta) < 0.55) {
          game.moveShadow(delta);
          const ending = ["finale-drag", "time-restored"].includes(game.phase);
          this.progress = game.shadowProgress; this.finalProgress = game.finalShadow;
          this.angle = this.baseAngle - (ending ? this.finalProgress : this.progress);
        }
      }
      this.previousAngle = angle;
    };
    const up = (event) => {
      if (event.pointerId !== this.activePointer) return;
      this.cancelDrag();
    };
    this.cancelDrag = () => {
      const pointer = this.activePointer;
      this.activePointer = null;
      this.previousAngle = null;
      if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("lostpointercapture", up);
    this.detachInput = () => {
      this.cancelDrag();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("lostpointercapture", up);
    };
  }
  cancelDrag() {
    this.activePointer = null;
    this.previousAngle = null;
  }
}
