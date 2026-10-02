// Serializable game rules shared by touch, controller selection and tests.
export const TAU = Math.PI * 2;
export const SPRING_PETALS = Array.from({ length: 5 }, (_, i) => {
  const angle = Math.PI / 2 + i * TAU / 5;
  return { x: Math.cos(angle) * 0.25, y: Math.sin(angle) * 0.25, z: 0.20 };
});
export const FROST_CELLS = Array.from({ length: 12 }, (_, i) => ({
  x: -0.18 + (i % 4) * 0.12, y: -0.07 + Math.floor(i / 4) * 0.12, z: 0.24,
}));
export const MEMORY_NODES = [
  { x: -0.16, y: -0.09, z: 0.25 }, { x: 0.16, y: -0.09, z: 0.25 },
  { x: 0.16, y: 0.24, z: 0.25 }, { x: -0.16, y: 0.24, z: 0.25 },
];
export const GEM_POSITION = { x: 0, y: 0.10, z: 0.34 };
export const freshEvent = () => ({ petals: 0, water: 0, wind: 0, frost: 0, memory: 0 });
export function bitCount(value) {
  let count = 0;
  for (let n = value >>> 0; n; n >>>= 1) count += n & 1;
  return count;
}
export function eventProgress(id, state) {
  if (id === "spring") return bitCount(state.petals) / 5;
  if (id === "summer") return state.water / 3;
  if (id === "autumn") return state.wind / TAU;
  if (id === "winter") return (bitCount(state.frost) + state.memory) / 16;
  return 0;
}
export function applyEventInput(id, state, input) {
  const n = input?.index;
  if (id === "spring" && input?.type === "petal" && Number.isInteger(n) && n >= 0 && n < 5) {
    if (state.petals & (1 << n)) return false;
    state.petals |= 1 << n;
    return true;
  }
  if (id === "summer" && input?.type === "water" && state.water < 3) {
    state.water++;
    return true;
  }
  if (id === "autumn" && input?.type === "wind" && Number.isFinite(input.delta) &&
      input.delta !== 0 && Math.abs(input.delta) <= 0.55 && state.wind < TAU) {
    state.wind = Math.max(0, Math.min(TAU, state.wind + input.delta));
    return true;
  }
  if (id === "winter" && input?.type === "wipe" && Number.isInteger(n) && n >= 0 && n < 12) {
    if (state.frost & (1 << n)) return false;
    state.frost |= 1 << n;
    return true;
  }
  if (id === "winter" && input?.type === "memory" && state.frost === 4095 && n === state.memory && n < 4) {
    state.memory++;
    return true;
  }
  return false;
}
export function eventInstruction(id, state, quest = false) {
  if (id === "spring") return quest
    ? `光る花びらを選んで、花へ届けよう · ${bitCount(state.petals)} / 5`
    : `花びらを押さえて、中央の花へドラッグ · ${bitCount(state.petals)} / 5`;
  if (id === "summer") return quest
    ? `噴水の光を3回選んで、水を上げよう · ${state.water} / 3`
    : `噴水の下から上へ、3回なぞろう · ${state.water} / 3`;
  if (id === "autumn") return quest
    ? `風の輪を選んで、風を強くしよう · ${Math.round(eventProgress(id, state) * 100)}%`
    : `葉の周りを時計回りになぞり、風を起こそう · ${Math.round(eventProgress(id, state) * 100)}%`;
  if (id === "winter") {
    if (state.frost !== 4095) return quest
      ? `白い霜を選んで、石碑を見つけよう · ${bitCount(state.frost)} / 12`
      : `白い霜を指でこすって、石碑を見つけよう · ${bitCount(state.frost)} / 12`;
    return quest ? `光る点を1→4の順に選ぼう · ${state.memory} / 4`
      : `光る点を1→4の順になぞって、記憶をつなごう · ${state.memory} / 4`;
  }
  return "";
}
