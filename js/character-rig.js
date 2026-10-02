// Deform the existing textured mesh; the PNG files remain unchanged.
// This is a light 2.5D pose rig, not a skeleton or a set of photographed poses.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export function createPoseRig(T, form) {
  const geometry = new T.PlaneGeometry(2.05, 2.05, 32, 32);
  const positions = geometry.attributes.position;
  const base = new Float32Array(positions.array);
  const shoulderX = form === "suit" ? 0.40 : 0.37;
  const shoulderY = form === "suit" ? -0.025 : 0.035;
  const halfBand = form === "suit" ? 0.18 : 0.15;
  // A conservative bound covers arm raises, so no per-frame bound allocation is needed.
  geometry.boundingSphere = new T.Sphere(new T.Vector3(), 2.1);
  return {
    geometry,
    shoulderX,
    shoulderY,
    apply({ left = 0, right = 0, headTilt = 0, breath = 0 }) {
      for (let i = 0; i < positions.count; i++) {
        const offset = i * 3;
        const x = base[offset], y = base[offset + 1];
        const sign = x < 0 ? -1 : 1;
        const armWeight = smooth(shoulderX - 0.04, shoulderX + 0.14, Math.abs(x)) *
          (1 - smooth(halfBand * 0.65, halfBand, Math.abs(y - shoulderY)));
        const a = (sign < 0 ? left : right) * armWeight;
        const pivotX = sign * shoulderX;
        let px = pivotX + (x - pivotX) * Math.cos(a) - (y - shoulderY) * Math.sin(a);
        let py = shoulderY + (x - pivotX) * Math.sin(a) + (y - shoulderY) * Math.cos(a);
        const headWeight = smooth(0.12, 0.38, y) * (1 - smooth(0.43, 0.66, Math.abs(x)));
        const h = headTilt * headWeight;
        const hy = py - 0.43;
        const hx = px;
        px = hx * Math.cos(h) - hy * Math.sin(h);
        py = 0.43 + hx * Math.sin(h) + hy * Math.cos(h);
        positions.array[offset] = px * (1 + breath * (1 - armWeight) * 0.018);
        positions.array[offset + 1] = py;
        positions.array[offset + 2] = base[offset + 2];
      }
      positions.needsUpdate = true;
    },
  };
}
