import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { CardTracker } from "../js/tracking.js";
import { Game, SPOTS } from "../js/game.js";
import { OneEuroFilter } from "./fixtures/mindar-one-euro-filter-1.2.5.js";

// Exercise the installed MindAR 1.2.5 controller's real video-loop scheduling.
// Only ML and worker results are substituted; maxTrack/target filtering/handover
// behavior comes from the vendor source, rather than a copy of our implementation.
const vendorSource = fs.readFileSync(
  new URL("./fixtures/mindar-controller-1.2.5.js", import.meta.url),
  "utf8",
);
function harness() {
  const ticks = [];
  const frameWaiters = [];
  let frameCount = 0;
  const Empty = class {};
  class Filter {
    reset() {}
    filter(_t, matrix) {
      return matrix;
    }
  }
  class Worker {
    postMessage() {}
  }
  const start = vendorSource.indexOf("const DEFAULT_FILTER_CUTOFF");
  const end = vendorSource.lastIndexOf("export");
  const Controller = vm.runInNewContext(
    vendorSource.slice(start, end) + "\nController",
    {
      CropDetector: Empty,
      InputLoader: Empty,
      ControllerWorker: Worker,
      OneEuroFilter: Filter,
      Date,
      Tracker: Empty,
      Compiler: Empty,
      tf: { nextFrame: () => new Promise((resolve) => ticks.push(resolve)) },
    },
  );
  const controller = new Controller({
    inputWidth: 960,
    inputHeight: 720,
    maxTrack: 1,
    warmupTolerance: 0,
  });
  controller.markerDimensions = Array.from({ length: 5 }, () => [768, 768]);
  controller.inputLoader.loadInput = () => ({ dispose() {} });
  const visible = new Set([2]);
  controller._detectAndMatch = async (_input, indexes) => ({
    targetIndex: indexes.find((i) => visible.has(i)) ?? -1,
    modelViewTransform: {},
  });
  controller._trackAndUpdate = async (_input, _pose, index) =>
    visible.has(index) ? {} : null;
  controller._glModelViewMatrix = () => Array(16).fill(0);
  const game = new Game();
  game.debugJump("summer");
  const seen = [];
  const tracker = new CardTracker({
    mode: "quest",
    root: {},
    onLost() {},
    onFound(index) {
      seen.push(index);
      game.recognize(SPOTS[index].id);
    },
    onStatus() {},
  });
  tracker.controller = controller;
  game.onChange = () => {
    if (game.phase === "scan") tracker.setTarget(game.index);
  };
  tracker.setTarget(2);
  controller.onUpdate = (data) => {
    tracker.update(data);
    if (data.type === "processDone") {
      frameCount++;
      frameWaiters.splice(0).forEach((resolve) => resolve());
    }
  };
  async function next() {
    const before = frameCount;
    if (ticks.length) ticks.shift()();
    while (frameCount === before)
      await new Promise((resolve) => frameWaiters.push(resolve));
  }
  function close() {
    controller.stopProcessVideo();
    ticks.splice(0).forEach((resolve) => resolve());
  }
  return { controller, tracker, game, seen, visible, next, close };
}

test("秋卡平滑降低合成位置和旋转噪声，其他卡参数不变；重建追踪状态后重新应用", () => {
  const tracker = new CardTracker({ mode: "phone" });
  const makeFilter = () => new OneEuroFilter({ minCutOff: 0.001, beta: 1000 });
  const original = Array.from({ length: 5 }, makeFilter);
  tracker.controller = {
    trackingStates: original.map((filter) => ({ filter })),
  };
  tracker.update({ type: "processDone" });
  assert.equal(original[3].beta, 0.002);
  for (const i of [0, 1, 2, 4]) assert.equal(original[i].beta, 1000);
  const baseline = makeFilter();
  let normalNoise = 0,
    smoothedNoise = 0;
  let normalRotation = 0,
    smoothedRotation = 0;
  for (let i = 0; i < 120; i++) {
    const noise = i % 2 ? 8 : -8;
    const input = [noise, noise / 500];
    const raw = baseline.filter(i * 33, input);
    const stable = original[3].filter(i * 33, input);
    if (i > 30) {
      normalNoise += raw[0] ** 2;
      smoothedNoise += stable[0] ** 2;
      normalRotation += raw[1] ** 2;
      smoothedRotation += stable[1] ** 2;
    }
  }
  assert.ok(smoothedNoise < normalNoise * 0.25);
  assert.ok(smoothedRotation < normalRotation * 0.25);
  tracker.update({ type: "processDone" });
  assert.equal(original[3].initialized, true); // No reset on every frame.
  const replacement = makeFilter();
  tracker.controller.trackingStates[3].filter = replacement;
  tracker.update({ type: "processDone" });
  assert.equal(replacement.beta, 0.002);
  assert.equal(replacement.initialized, false);
  const quest = new CardTracker({ mode: "quest" });
  quest.controller = {
    trackingStates: Array.from({ length: 5 }, () => ({ filter: makeFilter() })),
  };
  quest.update({ type: "processDone" });
  assert.equal(quest.controller.trackingStates[3].filter.beta, 1000);
});

test("夏卡仍在视野中时，进入秋季也会释放单个追踪名额并识别秋卡", async () => {
  const h = harness();
  try {
    h.controller.processVideo({});
    await h.next();
    assert.equal(h.game.phase, "event");
    assert.equal(h.controller.trackingStates[2].isTracking, true);
    for (let i = 0; i < 3; i++) h.game.interact({ type: "water" });
    h.game.finishRestoration();
    h.game.collectFragment();
    h.game.advance();
    assert.equal(h.game.spot.id, "autumn");
    assert.equal(h.game.phase, "scan");
    h.visible.add(3); // Both summer and autumn stay visible: old maxTrack=1 code stalls.
    await h.next();
    await h.next();
    assert.equal(h.game.phase, "event");
    assert.equal(h.game.spot.id, "autumn");
    assert.equal(h.controller.trackingStates[2].isTracking, false);
    assert.equal(h.controller.trackingStates[3].isTracking, true);
    assert.ok(h.seen.includes(3));
  } finally {
    h.close();
  }
});

test("同一目标的重复设置不会清除当前追踪；旧目标回调不能触发地点", async () => {
  const h = harness();
  try {
    h.controller.processVideo({});
    await h.next();
    h.tracker.setTarget(2);
    assert.equal(h.tracker.pendingTarget, undefined);
    const before = h.seen.length;
    h.tracker.setTarget(3);
    h.tracker.update({
      type: "updateMatrix",
      targetIndex: 2,
      worldMatrix: Array(16).fill(0),
    });
    assert.equal(h.seen.length, before);
  } finally {
    h.close();
  }
});

test("实际MindAR追踪器的秋图3点无法估计姿态；改用28点层并重建共享张量", async () => {
  const source = fs.readFileSync(
    new URL("./fixtures/mindar-tracker-1.2.5.js", import.meta.url),
    "utf8",
  );
  const tensors = [];
  // Counts read from the project's compiled targets.mind, in card order.
  const counts = [
    [27, 21],
    [27, 19],
    [31, 13],
    [28, 3],
    [20, 11],
  ];
  const data = counts.map((sizes) =>
    sizes.map((count, index) => ({
      width: index ? 128 : 256,
      height: index ? 128 : 256,
      scale: (index ? 128 : 256) / 768,
      data: Array((index ? 128 : 256) ** 2).fill(100),
      points: Array.from({ length: count }, (_, i) => ({
        x: i + 10,
        y: i + 15,
      })),
    })),
  );
  const dimensions = counts.map(() => [768, 768]);
  const h = harness();
  const controller = h.controller;
  // Keep the real Tracker.track and controller pose gate; substitute GPU
  // projection/matching only, treating every available point as a good match.
  function simulateGPU(tracker) {
    tracker._buildAdjustedModelViewTransform = () => ({ dispose() {} });
    tracker._computeProjection = () => ({ dispose() {} });
    tracker._computeMatching = (points) => ({
      matchingPointsT: { arraySync: () => points.data, dispose() {} },
      simT: { arraySync: () => points.data.map(() => 1), dispose() {} },
    });
  }
  // Imported geometry helpers are irrelevant to the minimum-point gate.
  // Run the real track method with a projected identity transform.
  const geometry = {
    buildModelViewProjectionTransform: () => [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 1],
    ],
    computeScreenCoordiate: (_m, x, y) => ({ x, y }),
  };
  const context = {
    tf: {
      tidy: (fn) => fn(),
      tensor: (data, shape) => {
        const tensor = {
          data,
          shape,
          disposed: false,
          dispose() {
            this.disposed = true;
          },
        };
        tensors.push(tensor);
        return tensor;
      },
    },
    ...geometry,
  };
  const RealTracker = vm.runInNewContext(
    source.slice(
      source.indexOf("const AR2_DEFAULT_TS"),
      source.lastIndexOf("export"),
    ) + "\nTracker",
    context,
  );
  controller.tracker = new RealTracker(dimensions, data, [], 960, 720);
  const previous = controller.tracker;
  const previousTensors = tensors.filter((t) => !t.disposed);
  simulateGPU(previous);
  const pose = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 1],
  ];
  controller._workerTrackUpdate = async () => pose;
  const update = controller.constructor.prototype._trackAndUpdate;
  assert.equal(await update.call(controller, {}, pose, 3), null);
  h.tracker.repairTrackingFrames(dimensions, data);
  const fixed = controller.tracker;
  simulateGPU(fixed);
  assert.equal(fixed.trackingKeyframeList[3].points.length, 28);
  assert.equal(fixed.trackingKeyframeList[3].width, 256);
  assert.equal(data[3][1].points.length, 3); // Original data remains intact.
  assert.equal(await update.call(controller, {}, pose, 3), pose);
  assert.ok(previousTensors.every((t) => t.disposed));
  assert.ok(fixed.featurePointsListT.every((t) => t.shape[0] === 28));
  for (const i of [0, 1, 2, 4])
    assert.equal(fixed.trackingKeyframeList[i], data[i][1]);
  h.tracker.repairTrackingFrames(
    dimensions,
    data.map((list, index) => (index === 3 ? [list[0], list[0]] : list)),
  );
  assert.equal(controller.tracker, fixed); // No rebuild for valid data.
});
