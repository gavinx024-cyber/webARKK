// All geometry is procedural. No GLB, skeleton, image textures or external model.
export function createH(T) {
  const root = new T.Group(),
    body = new T.Group();
  root.add(body);
  const white = new T.MeshStandardMaterial({
    color: 0xf5f8f8,
    roughness: 0.32,
    metalness: 0.04,
  });
  const dark = new T.MeshStandardMaterial({ color: 0x192f40, roughness: 0.4 });
  const blue = new T.MeshStandardMaterial({ color: 0x65c2eb, roughness: 0.3 });
  const sphere = new T.SphereGeometry(1, 24, 16);
  const original = new T.Group(),
    suit = new T.Group();
  body.add(original, suit);
  function ball(parent, xyz, scale, mat = white) {
    const m = new T.Mesh(sphere, mat);
    m.position.set(...xyz);
    m.scale.set(...scale);
    parent.add(m);
    return m;
  }
  function face(parent, y, z) {
    ball(parent, [-0.13, y, z], [0.038, 0.042, 0.025], dark);
    ball(parent, [0.13, y, z], [0.038, 0.042, 0.025], dark);
    const curve = new T.QuadraticBezierCurve3(
      new T.Vector3(-0.095, y - 0.09, z + 0.003),
      new T.Vector3(0, y - 0.145, z + 0.02),
      new T.Vector3(0.095, y - 0.09, z + 0.003),
    );
    parent.add(
      new T.Mesh(new T.TubeGeometry(curve, 12, 0.012, 6, false), dark),
    );
  }
  function head(parent, y) {
    ball(parent, [0, y, 0], [0.43, 0.42, 0.36]);
    ball(parent, [-0.27, y + 0.31, -0.02], [0.13, 0.14, 0.12]);
    ball(parent, [0.27, y + 0.31, -0.02], [0.13, 0.14, 0.12]);
    face(parent, y + 0.015, 0.347);
  }
  head(original, 0.74);
  ball(original, [0, 0.22, 0], [0.43, 0.49, 0.3]);
  const hands = [];
  for (const sign of [-1, 1]) {
    const arm = new T.Group();
    arm.position.set(sign * 0.33, 0.3, 0);
    original.add(arm);
    ball(arm, [sign * 0.24, 0, 0], [0.3, 0.11, 0.14]);
    hands.push(arm);
    ball(original, [sign * 0.19, -0.32, 0], [0.15, 0.3, 0.16]);
  }
  head(suit, 0.81);
  ball(suit, [0, 0.22, 0], [0.45, 0.45, 0.33]);
  const helmetMaterial = new T.MeshStandardMaterial({
    color: 0xaed3e6,
    transparent: true,
    opacity: 0.16,
    roughness: 0.18,
    metalness: 0.2,
    depthWrite: false,
  });
  ball(suit, [0, 0.85, 0], [0.55, 0.56, 0.48], helmetMaterial);
  const ring = new T.Mesh(new T.TorusGeometry(0.415, 0.035, 8, 40), white);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.46;
  suit.add(ring);
  const box = (scale, xyz, mat) => {
    const m = new T.Mesh(new T.BoxGeometry(...scale), mat);
    m.position.set(...xyz);
    suit.add(m);
    return m;
  };
  box([0.25, 0.18, 0.035], [0, 0.25, 0.324], white);
  ball(suit, [-0.035, 0.282, 0.35], [0.065, 0.02, 0.014], blue);
  ball(suit, [0.078, 0.28, 0.35], [0.023, 0.023, 0.016], blue);
  ball(suit, [-0.035, 0.222, 0.35], [0.065, 0.02, 0.014], dark);
  for (const sign of [-1, 1]) {
    const arm = new T.Group();
    arm.position.set(sign * 0.35, 0.32, 0);
    suit.add(arm);
    ball(arm, [sign * 0.17, 0, 0], [0.22, 0.145, 0.15]);
    ball(arm, [sign * 0.36, 0, 0], [0.11, 0.12, 0.12]);
    hands.push(arm);
    ball(suit, [sign * 0.2, -0.25, 0], [0.17, 0.22, 0.18]);
    ball(suit, [sign * 0.2, -0.48, 0.035], [0.18, 0.2, 0.21]);
  }
  let form = "original",
    motion = "idle";
  return {
    root,
    setForm(value) {
      form = value;
      original.visible = form === "original";
      suit.visible = form === "suit";
    },
    setMotion(value) {
      motion = value;
    },
    update(time, reduced = false) {
      const t = time / 1000;
      body.position.y = reduced ? 0 : Math.sin(t * 2) * 0.025;
      body.rotation.z = reduced ? 0 : Math.sin(t * 1.4) * 0.035;
      hands.forEach(
        (arm, i) =>
          (arm.rotation.z = reduced
            ? 0
            : (i % 2 === 0 ? -1 : 1) *
              (motion === "celebrate"
                ? 0.5 + Math.sin(t * 7) * 0.2
                : motion === "wave" && i % 2 === 1
                  ? 0.5 + Math.sin(t * 5) * 0.22
                  : Math.sin(t * 2) * 0.045)),
      );
      if (motion === "fly") body.rotation.z = -0.18;
    },
    getStats() {
      let triangles = 0,
        drawCalls = 0;
      root.traverse((o) => {
        if (o.isMesh) {
          triangles +=
            (o.geometry.index?.count || o.geometry.attributes.position.count) /
            3;
          drawCalls++;
        }
      });
      return { triangles, drawCalls };
    },
  };
}
