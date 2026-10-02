// Load the exact THREE r158 bundled in vendor/aframe.min.js without booting a browser.
// Pinned module byte ranges are guarded by the vendor checksum. No runtime dependencies.
import fs from "node:fs";
import crypto from "node:crypto";
import vm from "node:vm";
const vendor = fs.readFileSync(new URL("../../vendor/aframe.min.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("./aframe-three-ranges.json", import.meta.url), "utf8"));
if (crypto.createHash("sha256").update(vendor).digest("hex") !== manifest.hash)
  throw new Error("A-Frame vendor changed: refresh the pinned THREE test module ranges.");
const context = vm.createContext({ console, Float32Array, Uint16Array, Uint32Array,
  Int8Array, Int16Array, Uint8Array, ArrayBuffer, TextDecoder, TextEncoder });
context.window = context; context.self = context;
const cache = new Map();
function requireModule(id) {
  if (cache.has(id)) return cache.get(id).exports;
  const module = { exports: {} }, range = manifest.modules[id];
  if (!range) throw new Error(`Unexpected THREE vendor dependency ${id}`);
  cache.set(id, module);
  const factory = vm.runInContext(`(${vendor.slice(range.start, range.end)})`, context);
  factory(module, module.exports, requireModule);
  return module.exports;
}
requireModule.r = (object) => Object.defineProperty(object, "__esModule", { value: true });
requireModule.d = (object, getters) => Object.entries(getters).forEach(([name, get]) =>
  Object.defineProperty(object, name, { get, enumerable: true }));
requireModule.n = (object) => {
  const getter = object?.__esModule ? () => object.default : () => object;
  requireModule.d(getter, { a: getter }); return getter;
};
export const THREE = requireModule(2666);
