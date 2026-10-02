import { createH as createLegacyH } from "./character.js";
import { createPoseRig } from "./character-rig.js";

// Motion stage: deformable 2.5D character, spatial travel and reversible form effects.
// Share textures across the welcome scene and the active AR scene.
const assets = new Map();
function loadAsset(T, path) {
  if (assets.has(path)) return assets.get(path);
  const asset = { ready: false, failed: false, path, texture: null };
  assets.set(path, asset);
  asset.texture = new T.TextureLoader().load(path,
    () => { asset.ready = true; }, undefined,
    () => { asset.failed = true; });
  asset.texture.colorSpace = T.SRGBColorSpace;
  asset.texture.minFilter = T.LinearFilter;
  asset.texture.magFilter = T.LinearFilter;
  asset.texture.generateMipmaps = false;
  return asset;
}

export function createH(T) {
  const root = new T.Group();
  const legacy = createLegacyH(T);
  const carrier = new T.Group();
  root.add(carrier);
  carrier.add(legacy.root);
  const billboard = new T.Group();
  const appearance = new T.Group();
  billboard.add(appearance);
  carrier.add(billboard);
  const originals = loadAsset(T, "assets/character/h-original-v1.png");
  const travelers = loadAsset(T, "assets/character/h-traveler-v1.png");
  function sprite(asset, formName) {
    const rig = createPoseRig(T, formName);
    const material = new T.MeshBasicMaterial({
      map: asset.texture,
      transparent: true,
      // Drop extremely faint extraction residue at render time; PNG alpha is unchanged.
      alphaTest: 0.08,
      depthWrite: false,
      side: T.DoubleSide,
      toneMapped: false,
    });
    const plane = new T.Mesh(rig.geometry, material);
    plane.userData.rig = rig;
    plane.position.y = 0.34;
    plane.visible = false;
    appearance.add(plane);
    return plane;
  }
  const originalPlane = sprite(originals, "original");
  const travelerPlane = sprite(travelers, "suit");
  const worldRotation = new T.Quaternion();
  const parentRotation = new T.Quaternion();
  const target = new T.Vector3(-0.18, 0.04, 0.09);
  const targetLocal = new T.Vector3();
  const cueEnd = new T.Vector3();
  const cueStart = new T.Vector3();
  const cueGeometry = new T.BufferGeometry();
  cueGeometry.setAttribute("position", new T.BufferAttribute(new Float32Array(6), 3));
  const pointCue = new T.Line(cueGeometry, new T.LineDashedMaterial({
    color: 0x74e4cd, transparent: true, opacity: 0.4, dashSize: 0.10, gapSize: 0.07,
    depthWrite: false,
  }));
  pointCue.frustumCulled = false;
  pointCue.visible = false;
  root.add(pointCue);
  const targetGlow = new T.Mesh(new T.RingGeometry(0.08, 0.10, 24),
    new T.MeshBasicMaterial({ color: 0x74e4cd, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false }));
  root.add(targetGlow);
  targetGlow.visible = false;
  const fx = new T.Group();
  billboard.add(fx);
  const ringMaterial = new T.MeshBasicMaterial({ color: 0x79b9f0, transparent: true, opacity: 0, depthWrite: false });
  const ring = new T.Mesh(new T.TorusGeometry(0.95, 0.012, 4, 64), ringMaterial);
  ring.position.y = 0.34;
  fx.add(ring);
  const shock = new T.Mesh(new T.RingGeometry(0.95, 0.98, 64), ringMaterial.clone());
  shock.position.y = 0.34;
  fx.add(shock);
  const marks = new T.Group();
  marks.position.y = 0.34;
  for (let i = 0; i < 16; i++) {
    const mark = new T.Mesh(new T.BoxGeometry(0.015, 0.075, 0.01), ringMaterial);
    const a = Math.PI * 2 * i / 16;
    mark.position.set(Math.cos(a) * 1.02, Math.sin(a) * 1.02, 0);
    mark.rotation.z = a - Math.PI / 2;
    marks.add(mark);
  }
  fx.add(marks);
  const scan = new T.Mesh(new T.PlaneGeometry(1.9, 0.035),
    new T.MeshBasicMaterial({ color: 0xc9faff, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
  scan.position.z = 0.025;
  fx.add(scan);
  const ghosts = [-1, 1].map((sign) => {
    const ghost = new T.Mesh(originalPlane.geometry,
      new T.MeshBasicMaterial({ map: originals.texture, transparent: true, opacity: 0, alphaTest: 0.02,
        depthWrite: false, side: T.DoubleSide, toneMapped: false }));
    ghost.position.set(sign * 0.1, 0.34, -0.015);
    ghost.userData.sign = sign;
    fx.add(ghost);
    return ghost;
  });
  fx.visible = false;
  let form = "original", displayedForm = "original", motion = "idle";
  let transition = null, lastTime = null, motionStart = null, reducedMode = false;
  let pointSign = -1, pointAngle = 0;
  const duration = 1800;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const ease = (value) => value * value * (3 - 2 * value);
  function showForm() {
    const source = transition ? transition.from : form;
    const current = source === "suit" ? travelers : originals;
    const destination = form === "suit" ? travelers : originals;
    const ready = current.ready && destination.ready && !current.failed && !destination.failed;
    billboard.visible = ready || !!transition;
    legacy.root.visible = !ready;
    originalPlane.visible = ready && (form === "original" || !!transition);
    travelerPlane.visible = ready && (form === "suit" || !!transition);
    if (!transition) {
      originalPlane.material.opacity = travelerPlane.material.opacity = 1;
      displayedForm = form;
      legacy.setForm(form);
    }
  }
  legacy.setForm(form);
  showForm();
  return {
    root,
    setForm(value, { immediate = false } = {}) {
      const next = value === "suit" ? "suit" : "original";
      if (next === form && !immediate) return;
      const previous = transition ? displayedForm : form;
      form = next;
      if (immediate || reducedMode || previous === next) {
        transition = null;
        fx.visible = false;
        displayedForm = next;
        legacy.setForm(next);
      } else {
        transition = { from: previous, to: next, start: lastTime };
      }
      showForm();
    },
    setMotion(value) {
      const next = ["idle", "fly", "wave", "point", "celebrate"].includes(value) ? value : "idle";
      if (motion !== next) motionStart = lastTime;
      motion = next;
      legacy.setMotion(next === "point" ? "idle" : next);
    },
    setTarget(value) { target.copy(value); },
    get transforming() { return !!transition; },
    faceCamera(camera) {
      if (!camera || !billboard.visible) return;
      // Remove the marker/root rotation from the camera's world rotation:
      // the character faces the viewer, while its location remains on the card.
      root.updateWorldMatrix(true, false);
      camera.updateWorldMatrix(true, false);
      camera.getWorldQuaternion(worldRotation);
      carrier.getWorldQuaternion(parentRotation);
      billboard.quaternion.copy(parentRotation).invert().multiply(worldRotation);
      billboard.updateWorldMatrix(true, true);
      if (root.parent) {
        targetLocal.copy(target);
        root.parent.localToWorld(targetLocal);
        cueEnd.copy(targetLocal);
        root.worldToLocal(cueEnd);
        billboard.worldToLocal(targetLocal);
        pointSign = targetLocal.x < 0 ? -1 : 1;
        const desired = Math.atan2(targetLocal.y - 0.38, targetLocal.x - pointSign * 0.4);
        const difference = desired - (pointSign < 0 ? Math.PI : 0);
        pointAngle = clamp(Math.atan2(Math.sin(difference), Math.cos(difference)), -0.8, 0.8);
        const rig = (form === "suit" ? travelerPlane : originalPlane).userData.rig;
        cueStart.set(pointSign * (rig.shoulderX + 0.48 * Math.cos(pointAngle)),
          0.34 + rig.shoulderY + pointSign * 0.48 * Math.sin(pointAngle), 0.02);
        appearance.localToWorld(cueStart);
        root.worldToLocal(cueStart);
        cueGeometry.attributes.position.setXYZ(0, cueStart.x, cueStart.y, cueStart.z);
        cueGeometry.attributes.position.setXYZ(1, cueEnd.x, cueEnd.y, cueEnd.z);
        cueGeometry.attributes.position.needsUpdate = true;
        pointCue.computeLineDistances();
        targetGlow.position.copy(cueEnd);
        targetGlow.quaternion.copy(root.getWorldQuaternion(parentRotation)).invert().multiply(worldRotation);
      }
    },
    update(time, reduced = false) {
      lastTime = time;
      reducedMode = reduced;
      if (motionStart === null) motionStart = time;
      if (transition && transition.start === null) transition.start = time;
      let completed = false;
      if (transition && (reduced || time - transition.start >= duration)) {
        transition = null;
        fx.visible = false;
        displayedForm = form;
        motionStart = time;
        completed = true;
      }
      showForm();
      legacy.update(time, reduced);
      const t = time / 1000;
      const age = Math.max(0, (time - motionStart) / 1000);
      carrier.position.set(0, 0, 0);
      appearance.scale.set(1, 1, 1);
      appearance.position.y = reduced ? 0 : Math.sin(t * 2) * 0.025;
      appearance.rotation.z = reduced ? 0 : Math.sin(t * 1.4) * 0.035;
      const pose = { left: 0, right: 0, headTilt: 0, breath: reduced ? 0 : Math.sin(t * 2) };
      const moving = !transition && !reduced;
      if (motion === "wave") {
        pose.right = reduced ? 0.5 : (0.72 + Math.sin(age * 6) * 0.22) * Math.min(1, age * 3);
        pose.headTilt = reduced ? 0 : Math.sin(age * 2) * 0.025;
      }
      if (motion === "point") {
        pose[pointSign < 0 ? "left" : "right"] = pointAngle;
        pose.headTilt = pointSign * 0.035;
      }
      if (motion === "fly" && moving) {
        const u = (age % 4) / 4;
        const travel = Math.sin(u * Math.PI) ** 2;
        carrier.position.set(-0.40 * travel, 0.13 * Math.sin(u * Math.PI * 2), 0.20 * travel);
        appearance.rotation.z = -0.18 * Math.cos(u * Math.PI * 2);
        pose.left = -0.12;
        pose.right = 0.12;
      }
      if (motion === "celebrate") {
        pose.left = -(reduced ? 0.6 : 0.68 + Math.sin(age * 7) * 0.16);
        pose.right = reduced ? 0.6 : 0.68 + Math.sin(age * 7) * 0.16;
        if (moving) {
          appearance.position.y += Math.abs(Math.sin(age * 4)) * 0.12;
          appearance.rotation.z = Math.sin(age * 4) * 0.10;
          const bounce = Math.sin(age * 8) * 0.025;
          appearance.scale.set(1 + bounce, 1 - bounce, 1);
        }
      }
      originalPlane.userData.rig.apply(pose);
      travelerPlane.userData.rig.apply(pose);
      pointCue.visible = targetGlow.visible = motion === "point" && !transition && billboard.visible;
      targetGlow.material.opacity = reduced ? 0.55 : 0.45 + Math.sin(t * 3) * 0.12;
      if (transition) {
        const u = clamp((time - transition.start) / duration, 0, 1);
        const direction = transition.to === "suit" ? 1 : -1;
        const mix = ease(clamp((u - 0.18) / 0.64, 0, 1));
        const from = transition.from === "suit" ? travelerPlane : originalPlane;
        const to = transition.to === "suit" ? travelerPlane : originalPlane;
        from.material.opacity = 1 - mix;
        to.material.opacity = mix;
        displayedForm = mix < 0.5 ? transition.from : transition.to;
        legacy.setForm(displayedForm);
        fx.visible = true;
        ring.scale.setScalar(0.68 + Math.min(1, u * 3) * 0.42);
        ring.rotation.z = direction * u * Math.PI * 0.6;
        ringMaterial.opacity = Math.sin(u * Math.PI) * 0.85;
        marks.rotation.z = -direction * u * Math.PI * 0.6;
        scan.position.y = -0.62 + (direction > 0 ? u : 1 - u) * 1.9;
        scan.material.opacity = Math.sin(u * Math.PI) * 0.72;
        shock.scale.setScalar(1 + Math.max(0, u - 0.6) * 2.4);
        shock.material.opacity = u > 0.6 ? (1 - u) * 1.3 : 0;
        ghosts.forEach((ghost) => {
          ghost.material.map = from.material.map;
          ghost.geometry = from.geometry;
          ghost.position.x = ghost.userData.sign * Math.sin(u * Math.PI) * 0.17;
          ghost.material.opacity = Math.sin(u * Math.PI) * 0.13;
        });
      }
      return completed;
    },
    getAppearanceInfo() {
      const asset = form === "suit" ? travelers : originals;
      return {
        form,
        motion,
        transforming: !!transition,
        kind: asset.ready && !asset.failed ? "billboard-2.5d" : "legacy-3d-fallback",
        asset: asset.path,
        loaded: asset.ready,
        loadFailed: asset.failed,
      };
    },
    getStats() {
      if (billboard.visible) {
        let triangles = 0, drawCalls = 0;
        function count(object) {
          if (!object.visible) return;
          if (object.geometry) {
            drawCalls++;
            if (object.isMesh) triangles += (object.geometry.index?.count ||
              object.geometry.attributes.position.count) / 3;
          }
          object.children.forEach(count);
        }
        count(root);
        return { triangles, drawCalls };
      }
      return legacy.getStats();
    },
  };
}
