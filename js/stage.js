import { createH } from "./character-billboard.js";
import { SPOTS, dialogue, SHADOW_LIMIT } from "./game.js";
import { Sundial } from "./sundial.js";
import { SeasonScene } from "./season-scene.js";
import { SceneInput } from "./scene-input.js";
const T = AFRAME.THREE;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
function textLines(ctx, text, x, y, maxWidth, lineHeight) {
  let line = "";
  for (const char of text) {
    if (ctx.measureText(line + char).width > maxWidth) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = "";
    }
    line += char;
  }
  if (line) ctx.fillText(line, x, y);
  return y;
}
function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
export class Stage {
  constructor(el, onAction) {
    this.el = el;
    this.root = new T.Group();
    el.setObject3D("stage", this.root);
    this.scene = el.sceneEl;
    this.loader = new T.TextureLoader();
    this.textures = SPOTS.map((s) => {
      const t = this.loader.load(`assets/cards/${s.id}.jpg`);
      t.colorSpace = T.SRGBColorSpace;
      return t;
    });
    this.card = new T.Mesh(
      new T.CircleGeometry(0.48, 64),
      new T.MeshBasicMaterial({ map: this.textures[0] }),
    );
    this.card.position.set(-0.18, 0.04, -0.05);
    this.root.add(this.card);
    this.h = createH(T);
    this.h.root.position.set(0.44, 0.02, 0.12);
    this.h.root.scale.setScalar(0.36);
    this.root.add(this.h.root);
    this.effects = new T.Group();
    this.effects.position.set(-0.18, 0.04, 0.02);
    this.root.add(this.effects);
    this.sundial = new Sundial(T);
    this.effects.add(this.sundial.root);
    this.season = new SeasonScene(T);
    this.effects.add(this.season.root);
    this.available = () => !document.hidden && this.el.object3D.visible && !this.notice;
    this.xrTargets = [];
    this.lastXRInteraction = -Infinity;
    this.sundialEnabled = false;
    // Three bursts, 96 points and one draw call; no firework textures.
    this.fireworkPositions = new Float32Array(96 * 3);
    const fireworkColors = new Float32Array(96 * 3);
    for (let i = 0; i < 96; i++) {
      const color = new T.Color(SPOTS[1 + Math.floor(i / 24)].color);
      color.toArray(fireworkColors, i * 3);
    }
    const fireworkGeometry = new T.BufferGeometry();
    fireworkGeometry.setAttribute(
      "position",
      new T.BufferAttribute(this.fireworkPositions, 3),
    );
    fireworkGeometry.setAttribute(
      "color",
      new T.BufferAttribute(fireworkColors, 3),
    );
    this.fireworks = new T.Points(
      fireworkGeometry,
      new T.PointsMaterial({
        size: 0.018,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: T.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.fireworks.frustumCulled = false;
    this.fireworks.visible = false;
    this.root.add(this.fireworks);
    const accent = new T.MeshBasicMaterial({
      color: 0x74e4cd,
      transparent: true,
      opacity: 0.7,
    });
    this.ripple = new T.Mesh(new T.RingGeometry(0.34, 0.354, 64), accent);
    this.effects.add(this.ripple);
    this.shadow = new T.Mesh(
      new T.PlaneGeometry(0.2, 0.009),
      new T.MeshBasicMaterial({
        color: 0x203b4f,
        transparent: true,
        opacity: 0.7,
      }),
    );
    this.shadow.position.set(0.12, -0.05, 0.01);
    this.effects.add(this.shadow);
    this.fragments = [];
    const gemGeo = new T.OctahedronGeometry(0.065);
    for (let i = 0; i < 4; i++) {
      const gem = new T.Mesh(
        gemGeo,
        new T.MeshStandardMaterial({
          color: SPOTS[i + 1].color,
          emissive: SPOTS[i + 1].color,
          emissiveIntensity: 0.35,
          roughness: 0.3,
        }),
      );
      this.effects.add(gem);
      this.fragments.push(gem);
    }
    this.particles = [];
    const particleGeo = new T.SphereGeometry(0.012, 8, 6);
    for (let i = 0; i < 32; i++) {
      const mat = new T.MeshBasicMaterial({ color: 0xf7a9c3 });
      const p = new T.Mesh(particleGeo, mat);
      this.effects.add(p);
      p.userData.seed = i * 2.39996;
      this.particles.push(p);
    }
    // Two subtle virtual silhouettes. They never purport to animate the camera pixels.
    this.people = new T.Group();
    this.effects.add(this.people);
    for (let i = 0; i < 2; i++) {
      const person = new T.Group();
      person.position.set(-0.3 + i * 0.09, -0.08, 0.012);
      const mat = new T.MeshBasicMaterial({
        color: i ? 0xa26254 : 0x627b81,
        transparent: true,
        opacity: 0.85,
      });
      const head = new T.Mesh(new T.CircleGeometry(0.018, 12), mat);
      head.position.y = 0.095;
      person.add(head);
      const torso = new T.Mesh(new T.PlaneGeometry(0.027, 0.075), mat);
      torso.position.y = 0.036;
      person.add(torso);
      this.people.add(person);
    }
    // Japanese text is painted to a canvas texture, making the same dialogue usable in XR.
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1024;
    this.canvas.height = 480;
    this.ctx = this.canvas.getContext("2d");
    this.panelTexture = new T.CanvasTexture(this.canvas);
    this.panelTexture.colorSpace = T.SRGBColorSpace;
    this.panel = new T.Mesh(
      new T.PlaneGeometry(1.28, 0.6),
      new T.MeshBasicMaterial({
        map: this.panelTexture,
        transparent: true,
        depthTest: false,
      }),
    );
    this.panel.position.set(0, -0.57, 0.16);
    this.panel.renderOrder = 20;
    this.root.add(this.panel);
    this.panel.visible = false;
    this.hit = document.createElement("a-plane");
    this.hit.classList.add("clickable");
    this.hit.setAttribute("width", "1.12");
    this.hit.setAttribute("height", ".1");
    this.hit.setAttribute("position", "0 -0.76 0.18");
    this.hit.setAttribute(
      "material",
      "opacity: 0; transparent: true; depthWrite: false",
    );
    el.append(this.hit);
    this.hit.addEventListener("click", () => {
      if (
        this.game &&
        (this.notice || this.game.replaying || this.game.phase !== "scan")
      )
        onAction();
    });
    this.hit.setAttribute("visible", false);
    this.backHit = document.createElement("a-plane");
    this.backHit.setAttribute("width", ".325");
    this.backHit.setAttribute("height", ".1");
    this.backHit.setAttribute("position", "-0.425 -0.76 0.18");
    this.backHit.setAttribute(
      "material",
      "opacity: 0; transparent: true; depthWrite: false",
    );
    this.backHit.setAttribute("visible", false);
    this.backHit.addEventListener("click", () => {
      if (!this.notice && this.game?.canGoBack)
        window.dispatchEvent(new Event("game-back"));
    });
    el.append(this.backHit);
    this.phaseTime = 0;
    this.lastTime = 0;
    this.manualForm = null;
    for (let i = 0; i < 16; i++) {
      const target = document.createElement("a-entity");
      target.setObject3D("mesh", new T.Mesh(new T.SphereGeometry(0.065, 10, 8),
        new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })));
      target.object3D.visible = false;
      target.addEventListener("click", () => {
        if (!this.xrEnabled || !this.available() || this.game?.replaying || this.lastTime - this.lastXRInteraction < 220) return;
        const action = target.sceneAction;
        if (!action) return;
        this.lastXRInteraction = this.lastTime;
        if (action.type === "shadow") this.game.moveShadow(0.4);
        else this.season.selectTarget(action);
      });
      el.append(target); this.xrTargets.push(target);
    }
    document.fonts.load("30px UtsuboJP").then(() => this.drawPanel());
  }
  setGame(g) {
    const changed = this.gamePhase !== g.phase || this.spotId !== g.spot.id;
    if (changed) {
      this.phaseTime = this.lastTime;
      this.phaseAge = 0;
      this.manualForm = null;
      this.manualMotion = null;
    }
    this.game = g;
    this.gamePhase = g.phase;
    this.spotId = g.spot.id;
    this.sundial.setPhase(g.phase, g.shadowProgress, g.finalShadow);
    this.season.setGame(g);
    this.card.material.map = this.textures[g.index];
    this.card.material.needsUpdate = true;
    this.card.material.transparent = true;
    this.card.material.opacity = g.phase === "tutorial" ? 0.8 : 0.16;
    this.h.setForm(this.manualForm || g.form);
    this.h.setMotion(
      this.manualMotion || (
      ["reward", "ended"].includes(g.phase)
        ? "celebrate"
        : g.phase === "tutorial"
          ? "wave"
          : g.phase === "transformed" || (g.phase === "scan" && g.form === "suit")
            ? "fly"
            : ["opening-frozen", "opening-drag", "opening-jammed", "event", "fragment", "finale", "finale-drag"].includes(g.phase)
              ? "point"
              : "idle"),
    );
    this.drawPanel();
    this.updateXRTargets();
  }
  attachInput(canvas, camera, game) {
    this.sundial.attachInput(canvas, camera, game, this.available);
    this.input = new SceneInput(T, this.season, camera, game, this.available);
    this.input.attach(canvas);
  }
  cancelInput() { this.sundial.cancelDrag(); this.input?.cancel(); }
  detachInput() { this.sundial.detachInput?.(); this.input?.detach?.(); }
  updateXRTargets() {
    const g = this.game;
    let actions = this.xrEnabled && this.available() && !g?.replaying ? this.season.getTargets() : [];
    if (this.xrEnabled && this.available() && g && !g.replaying && ["opening-drag", "finale-drag"].includes(g.phase)) {
      actions = [{ type: "shadow", x: Math.cos(this.sundial.angle) * 0.275,
        y: Math.sin(this.sundial.angle) * 0.275, z: 0.085 }];
    }
    this.xrTargets.forEach((entity, i) => {
      const action = actions[i]; entity.sceneAction = action;
      entity.object3D.visible = !!action;
      entity.classList.toggle("clickable", !!action);
      if (action) entity.object3D.position.set(-0.18 + action.x, 0.04 + action.y, 0.02 + action.z);
    });
  }
  drawPanel() {
    if (!this.game) return;
    const c = this.ctx,
      g = this.game,
      d = this.notice
        ? {
            title: "カメラを確認してください",
            text: this.notice,
            button: "ARを終了して確認",
          }
        : dialogue(g);
    c.clearRect(0, 0, 1024, 480);
    c.fillStyle = "#102c3cf5";
    rounded(c, 0, 0, 1024, 480, 36);
    c.fillStyle = "#74e4cd";
    c.font = "26px UtsuboJP, sans-serif";
    c.fillText(
      `小H  ·  ${g.spot.season}                    時間のかけら ${g.fragments.size} / 4`,
      42,
      52,
    );
    c.fillStyle = "#fff";
    c.font = "bold 38px UtsuboJP, sans-serif";
    c.fillText(d.title, 42, 112);
    c.fillStyle = "#d3e6e8";
    c.font = "30px UtsuboJP, sans-serif";
    textLines(c, d.text, 42, 169, 938, 45);
    const back = !this.notice && g.canGoBack;
    const characterBusy = !this.notice && this.h.transforming && ["transformed", "ended"].includes(g.phase);
    const button = characterBusy ? null : (!this.notice && g.replaying ? "続きへ" : d.button);
    if (back) {
      c.fillStyle = "#284958";
      rounded(c, 42, 358, 260, 84, 18);
      c.fillStyle = "#eff8f7";
      c.font = "bold 29px UtsuboJP, sans-serif";
      c.textAlign = "center";
      c.fillText("ひとつ前へ", 172, 411);
    }
    c.fillStyle = button ? "#74e4cd" : "#254954";
    rounded(c, back ? 322 : 42, 358, back ? 660 : 940, 84, 18);
    c.fillStyle = button ? "#142d3c" : "#c4dedf";
    c.font = "bold 29px UtsuboJP, sans-serif";
    c.textAlign = "center";
    c.fillText(
      button || (characterBusy ? "変身（へんしん）中…" : this.scanStatus) || "カードを映してください",
      back ? 652 : 512,
      411,
    );
    c.textAlign = "left";
    this.panelTexture.needsUpdate = true;
    this.hit.setAttribute("width", back ? ".825" : "1.12");
    this.hit.setAttribute("position", `${back ? 0.175 : 0} -0.76 0.18`);
    const forwardEnabled = !!this.xrEnabled && !!button;
    this.hit.setAttribute("visible", forwardEnabled);
    this.hit.classList.toggle("clickable", forwardEnabled);
    const backEnabled = !!this.xrEnabled && back;
    this.backHit.setAttribute("visible", backEnabled);
    this.backHit.classList.toggle("clickable", backEnabled);
  }
  setStatus(s) {
    this.scanStatus = s;
    this.drawPanel();
    this.updateXRTargets();
  }
  setXR(enabled) {
    this.xrEnabled = enabled;
    this.panel.visible = enabled;
    this.hit.setAttribute("visible", enabled);
    this.needsXRPlacement = enabled;
    this.drawPanel();
  }
  update(time) {
    // Place from an actual XR animation frame; window RAF can pause in immersive sessions.
    if (this.needsXRPlacement && this.scene.renderer.xr.isPresenting) {
      const camera = this.scene.renderer.xr.getCamera(this.scene.camera);
      const eye = new T.Vector3(),
        direction = new T.Vector3();
      camera.getWorldPosition(eye);
      camera.getWorldDirection(direction);
      direction.y = 0;
      direction.normalize();
      this.el.object3D.position.copy(eye).addScaledVector(direction, 1.8);
      this.el.object3D.position.y = eye.y + 0.12;
      this.el.object3D.rotation.y = Math.atan2(-direction.x, -direction.z);
      this.needsXRPlacement = false;
    }
    const deltaSeconds = Math.max(0, (time - this.lastTime) / 1000);
    this.lastTime = time;
    if (!this.game) return;
    const g = this.game,
      p = g.phase,
      s = g.spot,
      dt = (time - this.phaseTime) / 1000,
      t = reduced ? 0 : time / 1000;
    if (this.available()) this.phaseAge = (this.phaseAge || 0) + Math.min(deltaSeconds, 0.1);
    this.updateFireworks(p, dt);
    const characterFinished = this.h.update(time, reduced);
    const characterCamera = this.scene.renderer.xr.isPresenting
      ? this.scene.renderer.xr.getCamera(this.scene.camera)
      : this.scene.camera;
    this.h.faceCamera(characterCamera);
    this.h.setForm(this.manualForm || g.form);
    this.h.root.scale.setScalar(0.36);
    if (characterFinished) window.dispatchEvent(new Event("character-ready"));
    const active = ["opening-live", "restoring", "fragment", "reward", "time-restored", "ended"].includes(p),
      final = ["finale", "finale-drag", "time-restored", "ended"].includes(p);
    const pulse = reduced ? 1 : 1 + Math.sin(t * 3) * 0.06;
    const openingDial = this.sundialEnabled && g.index === 0 &&
      ["opening-live", "opening-frozen", "opening-drag", "opening-jammed", "transformed", "finale", "finale-drag", "time-restored", "ended"].includes(p);
    this.sundial.root.visible = openingDial;
    this.sundial.progress = g.shadowProgress;
    this.sundial.finalProgress = g.finalShadow;
    this.sundial.update(deltaSeconds, reduced, SHADOW_LIMIT);
    this.season.update(deltaSeconds, time, reduced, this.available());
    this.updateXRTargets();
    this.h.setTarget(new T.Vector3(-0.18, 0.14, p === "fragment" ? 0.36 : 0.18));
    this.ripple.visible = !openingDial;
    this.ripple.scale.setScalar(
      p === "transformed" ? 1 + Math.min(dt, 1) * 0.8 : pulse,
    );
    this.ripple.material.color.set(s.color);
    this.ripple.material.opacity = p === "scan" ? 0.3 : 0.7;
    this.shadow.visible = g.index === 0 && !openingDial;
    this.people.visible = g.index === 0;
    if (active && g.index === 0 && !reduced) {
      this.shadow.rotation.z = t * 0.3;
      this.people.children.forEach(
        (o, i) => (o.rotation.z = Math.sin(t * 2 + i) * 0.07),
      );
    }
    this.fragments.forEach((gem, i) => {
      gem.visible = final;
      const endAngle = [Math.PI / 2, Math.PI, -Math.PI / 2, 0][i];
      const mix = p === "finale" ? Math.max(0, Math.min(1, (this.phaseAge - i * 0.28) / 1.8)) : 1;
      const ease = mix * mix * (3 - 2 * mix);
      const a = t * 0.6 + i * Math.PI / 2;
      gem.position.set(Math.cos(a) * 0.30 * (1 - ease) + Math.cos(endAngle) * 0.44 * ease,
        Math.sin(a) * 0.30 * (1 - ease) + Math.sin(endAngle) * 0.44 * ease, 0.26 * (1 - ease) + 0.05 * ease);
      gem.rotation.set(t, t * 0.6, 0);
      gem.scale.setScalar(0.72 + (1 - ease) * 0.28);
    });
    if (!g.replaying && this.available()) {
      if (p === "opening-live" && this.phaseAge >= 4) g.advance();
      if (p === "finale" && this.phaseAge >= 3.2) g.finishAssembly();
      if (p === "time-restored" && this.phaseAge >= 3.0) g.finishEnding();
    }
    this.particles.forEach((o, i) => {
      o.visible = false;
      const seed = o.userData.seed;
      const v = active && !reduced ? t : 0;
      o.material.color.set(s.color);
      if (g.index === 1) {
        o.scale.set(1.5, 0.65, 1);
        o.position.set(
          Math.cos(seed + v * 0.3) * (0.12 + i * 0.008),
          Math.sin(seed + v * 0.3) * 0.35,
          0.07 + Math.sin(seed) * 0.03,
        );
        o.rotation.z = seed + v;
      }
      if (g.index === 2) {
        o.scale.set(0.7, 2, 1);
        o.position.set(
          ((i % 5) - 2) * 0.075,
          ((i / 32 + v * 0.5) % 1) * 0.55 - 0.24,
          0.08,
        );
      }
      if (g.index === 3) {
        o.scale.set(1.5, 0.6, 1);
        o.position.set(
          ((seed * 0.16 + v * 0.14) % 1) - 0.5,
          Math.sin(seed + v) * 0.25,
          0.06,
        );
        o.rotation.z = seed + v;
      }
      if (g.index === 4) {
        o.scale.setScalar(0.65);
        o.position.set(
          Math.sin(seed) * 0.38,
          0.4 - ((i / 32 + v * 0.15) % 1) * 0.8,
          0.08,
        );
      }
    });
  }
  updateFireworks(phase, dt) {
    this.fireworks.visible = phase === "ended" && (reduced || dt < 9);
    if (!this.fireworks.visible) return;
    for (let i = 0; i < 96; i++) {
      const group = Math.floor(i / 32);
      const age = reduced ? 0.7 : (dt - group * 0.6) % 3;
      const offset = i * 3;
      if (age < 0 || age > 1.8) {
        this.fireworkPositions[offset] = 10000;
        this.fireworkPositions[offset + 1] = 10000;
        this.fireworkPositions[offset + 2] = 0;
        continue;
      }
      const angle = ((i % 32) * Math.PI * 2) / 32;
      const radius = (1 - Math.exp(-age * 3)) * (0.19 + (i % 3) * 0.025);
      this.fireworkPositions[offset] =
        (group - 1) * 0.34 + Math.cos(angle) * radius;
      this.fireworkPositions[offset + 1] =
        0.36 +
        (group % 2) * 0.12 +
        Math.sin(angle) * radius -
        (reduced ? 0 : age * age * 0.035);
      this.fireworkPositions[offset + 2] = 0.12;
    }
    this.fireworks.geometry.attributes.position.needsUpdate = true;
  }
}
AFRAME.registerComponent("time-stage", {
  init() {
    this.stage = new Stage(this.el, () =>
      window.dispatchEvent(new Event("game-action")),
    );
  },
  tick(time) {
    this.stage?.update(time);
  },
});
