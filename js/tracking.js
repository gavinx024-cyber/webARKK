// Phone: marker pose. Quest: card identity only; XR supplies the stage's spatial pose.
// The Quest camera stream is not assumed to be the compositor's passthrough image.
export class CardTracker {
  constructor({ video, scene, root, mode, onFound, onLost, onStatus }) {
    Object.assign(this, {
      video,
      scene,
      root,
      mode,
      onFound,
      onLost,
      onStatus,
    });
    this.epoch = 0;
    this.found = new Set();
    this.post = [];
    this.configuredFilters = new WeakSet();
    this.onResize = () => this.resize();
  }
  async start() {
    if (!isSecureContext)
      throw new Error("カメラを使うにはHTTPSのURLで開いてください。");
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("このブラウザーではカメラを利用できません。");
    const epoch = ++this.epoch;
    this.onStatus("カメラの許可を確認しています…");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode:
          this.mode === "quest" ? { exact: "environment" } : "environment",
        width: { ideal: 960 },
        height: { ideal: 720 },
        frameRate: { ideal: 24, max: 30 },
      },
    });
    if (epoch !== this.epoch) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    this.video.srcObject = stream;
    await new Promise((resolve, reject) => {
      if (this.video.readyState >= 1) return resolve();
      this.video.onloadedmetadata = resolve;
      this.video.onerror = () =>
        reject(new Error("カメラ映像を読み込めませんでした。"));
    });
    // MindAR's InputLoader reads the element's width/height attributes,
    // not just videoWidth/videoHeight. Without these the frame is drawn at 0×0.
    this.video.width = this.video.videoWidth;
    this.video.height = this.video.videoHeight;
    await this.video.play();
    this.onStatus("5枚のカードを読み込んでいます…");
    const { Controller } = await import("../vendor/mindar-image.prod.js");
    if (epoch !== this.epoch) return;
    this.controller = new Controller({
      inputWidth: this.video.videoWidth,
      inputHeight: this.video.videoHeight,
      maxTrack: 1,
      warmupTolerance: 7,
      missTolerance: 8,
      onUpdate: (data) => this.update(data),
    });
    const response = await fetch("assets/cards/targets.mind");
    if (!response.ok) throw new Error("カードの識別データが見つかりません。");
    const { dimensions, trackingDataList } =
      this.controller.addImageTargetsFromBuffer(await response.arrayBuffer());
    this.repairTrackingFrames(dimensions, trackingDataList);
    const T = AFRAME.THREE;
    this.post = dimensions.map(([w, h]) =>
      new T.Matrix4().compose(
        new T.Vector3(w / 2, h / 2, 0),
        new T.Quaternion(),
        new T.Vector3(w, w, w),
      ),
    );
    if (this.mode === "phone") {
      document.body.classList.add("camera-on");
      this.resize();
      window.addEventListener("resize", this.onResize);
    }
    this.controller.dummyRun(this.video);
    this.controller.processVideo(this.video);
    this.onStatus("カードの全体をカメラに映してください");
  }
  repairTrackingFrames(dimensions, trackingDataList) {
    // MindAR 1.2.5 always tracks with keyframe 1 (128px). Our autumn
    // keyframe has only 3 points, but pose estimation requires at least 4.
    // Keep matching data and printed art; use the compiled 256px frame
    // only for targets whose default frame cannot possibly track.
    let changed = false;
    const frames = trackingDataList.map((list, index) => {
      if (list[1]?.points.length >= 4) return list;
      const fallback = list.find((frame) => frame.points.length >= 4);
      if (!fallback)
        throw new Error(
          `カード${index + 1}の追跡点が不足しています。識別データを再作成してください。`,
        );
      changed = true;
      const copy = [...list];
      copy[1] = fallback;
      return copy;
    });
    if (!changed) return;
    const previous = this.controller.tracker;
    // Rebuild every tensor together: MindAR shares a padded point count
    // across targets, so replacing just autumn's tensors would be unsafe.
    this.controller.tracker = new previous.constructor(
      dimensions,
      frames,
      this.controller.projectionTransform,
      this.controller.inputWidth,
      this.controller.inputHeight,
      this.controller.debugMode,
    );
    for (const key of [
      "featurePointsListT",
      "imagePixelsListT",
      "imagePropertiesListT",
    ])
      previous[key].forEach((tensor) => tensor.dispose());
  }
  setTarget(index) {
    if (index === this.expected) return;
    this.expected = index;
    if (this.controller) {
      this.controller.interestedTargetIndex = index;
      // Changing interestedTargetIndex alone does not release MindAR's existing
      // track. With maxTrack=1, a still-visible previous card blocks the next one.
      // Wait for processDone: the controller may currently be awaiting a worker.
      this.pendingTarget = index;
    }
    this.found.clear();
  }
  flushTargetChange() {
    if (this.pendingTarget === undefined || !this.controller) return;
    const index = this.pendingTarget;
    this.pendingTarget = undefined;
    for (const [i, state] of this.controller.trackingStates.entries()) {
      if (i === index) continue;
      state.isTracking = false;
      state.showing = false;
      state.trackCount = 0;
      state.trackMiss = 0;
      state.currentModelViewTransform = null;
      state.trackingMatrix = null;
      state.filter.reset();
    }
  }
  stabilizeAutumnTracking() {
    if (this.mode !== "phone") return;
    const filter = this.controller?.trackingStates?.[3]?.filter;
    if (!filter || this.configuredFilters.has(filter)) return;
    // MindAR 1.2.5 uses milliseconds. Keep the 1Hz baseline, but reduce
    // beta for autumn: the default 1000 passes almost every noisy pose change.
    filter.minCutOff = 0.001;
    filter.beta = 0.002;
    filter.reset();
    this.configuredFilters.add(filter);
  }
  update({ type, targetIndex, worldMatrix }) {
    if (type === "processDone") {
      this.stabilizeAutumnTracking();
      this.flushTargetChange();
      return;
    }
    if (type !== "updateMatrix") return;
    // An old target can still produce a worker result during the handover.
    if (targetIndex !== this.expected) return;
    if (worldMatrix) {
      if (this.mode === "phone" && targetIndex === this.expected) {
        const T = AFRAME.THREE;
        this.root.matrixAutoUpdate = false;
        this.root.matrix
          .fromArray(worldMatrix)
          .multiply(this.post[targetIndex]);
        this.root.matrixWorldNeedsUpdate = true;
        this.root.visible = true;
      }
      // Repeated frames are harmless: Game.recognize guards both phase and expected ID.
      this.found.add(targetIndex);
      this.onFound(targetIndex);
    } else {
      this.found.delete(targetIndex);
      if (this.mode === "phone" && targetIndex === this.expected)
        this.root.visible = false;
      this.onLost(targetIndex);
    }
  }
  resize() {
    if (!this.controller || this.mode !== "phone") return;
    const camera = this.scene.camera;
    if (!camera) return;
    const w = innerWidth,
      h = innerHeight,
      ratio = this.video.videoWidth / this.video.videoHeight;
    const vh = ratio > w / h ? h : w / ratio;
    const proj = this.controller.getProjectionMatrix();
    camera.fov = (2 * Math.atan((1 / proj[5] / vh) * h) * 180) / Math.PI;
    camera.near = proj[14] / (proj[10] - 1);
    camera.far = proj[14] / (proj[10] + 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  stop() {
    this.epoch++;
    window.removeEventListener("resize", this.onResize);
    this.controller?.stopProcessVideo();
    this.controller?.dispose();
    this.controller?.worker?.terminate();
    this.controller = null;
    this.pendingTarget = undefined;
    this.expected = undefined;
    this.configuredFilters = new WeakSet();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    document.body.classList.remove("camera-on");
    this.found.clear();
  }
}
