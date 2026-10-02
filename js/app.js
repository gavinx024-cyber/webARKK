import { Game, SPOTS, dialogue } from "./game.js";
import "./stage.js";
import { CardTracker } from "./tracking.js";
import { eventProgress, TAU } from "./spot-events.js";
const $ = (id) => document.getElementById(id);
const DEBUG_MODE = new URLSearchParams(location.search).get("debug") === "1";
let experienceMode = "seated";
let scene,
  stageEl,
  stage,
  tracker,
  mode = "welcome",
  busy = false,
  xrSupported = false,
  trackerReady = false;
const game = new Game();
function status(text) {
  $("tracker-status").hidden = false;
  $("tracker-status").textContent = text;
  stage?.setStatus(text);
}
function render() {
  const d = dialogue(game);
  $("count").textContent = `時間のかけら ${game.fragments.size} / 4`;
  $("spot-label").textContent =
    `${game.replaying ? "もう一度 · " : ""}${game.spot.season} · ${game.spot.name}`;
  $("dialogue-title").textContent = d.title;
  $("message").textContent = d.text;
  $("back").hidden = !game.canGoBack;
  const interacting = !game.replaying && ["opening-drag", "event", "fragment", "finale-drag"].includes(game.phase);
  document.body.classList.toggle("sundial-interaction", interacting);
  $("action").hidden = !game.replaying && !d.button && !(mode === "demo" && game.phase === "scan");
  $("action").textContent =
    (game.replaying ? "続きへ" : d.button) ||
    (mode === "demo" && game.phase === "scan" ? `${game.spot.name}の認識をシミュレート` : "");
  const progress = game.phase === "event" ? eventProgress(game.spot.id, game.events[game.spot.id]) :
    game.phase === "opening-drag" ? game.shadowProgress / (Math.PI * 0.72) : game.finalShadow / TAU;
  $("interaction-progress").hidden = !interacting || game.phase === "fragment";
  $("progress-bar").value = progress;
  $("progress-label").textContent = `${Math.round(progress * 100)}%`;
  stage?.setGame(game);
  const characterBusy = stage?.h.transforming && ["transformed", "ended"].includes(game.phase);
  $("action").disabled = !!characterBusy;
  if (characterBusy) $("action").textContent = "変身（へんしん）中…";
  if (!game.replaying) tracker?.setTarget(game.index);
  if (game.replaying) {
    status("前の場面をもう一度楽しめます。集めたかけらはそのままです");
  } else if (game.phase === "ended") {
    status("おめでとうございます！時間旅行はおしまいです");
  } else if (game.phase === "opening-drag") {
    status("光る点を押さえて、時計回りに影を動かしてください");
  } else if (game.phase === "opening-jammed") {
    status("4つのかけらが足りません · 時間のかけら 0 / 4");
  } else if (game.phase === "scan") {
    if (mode === "phone" && stageEl) stageEl.object3D.visible = false;
    if (mode === "demo")
      status("プレビュー：カード認識をシミュレートしています");
    else if (trackerReady) status(`${game.spot.name}のカードを映してください`);
  }
  syncPhonePresentation();
  $("debug-info").textContent = JSON.stringify({
    mode,
    experienceMode,
    replaying: game.replaying,
    phase: game.phase,
    spot: game.spot.id,
    fragments: [...game.fragments],
    shadowProgress: game.shadowProgress,
    character: stage?.h.getAppearanceInfo(),
    camera: !!tracker?.stream,
    expectedTarget: tracker?.expected,
    activeTracks: tracker?.controller?.trackingStates
      .map((state, index) => (state.isTracking ? index : null))
      .filter((index) => index !== null),
    xr: scene?.is("ar-mode") || false,
  });
}
game.onChange = render;
function selectExperience() {
  experienceMode = "seated";
  $("mode-select").hidden = true;
  $("device-select").hidden = false;
}
$("seated").onclick = selectExperience;
$("choose-mode").onclick = () => {
  $("device-select").hidden = true;
  $("mode-select").hidden = false;
};
function syncPhonePresentation() {
  if (mode !== "phone" || !stageEl || !scene?.camera) return;
  const fixed = game.replaying || ["tutorial", "ended"].includes(game.phase);
  if (!fixed) {
    stageEl.object3D.matrixAutoUpdate = false;
    return;
  }
  // Replay is displayed in front of the screen; no old card is required.
  const camera = scene.camera;
  const available =
    2 * Math.tan((camera.fov * Math.PI) / 360) * 1200 * camera.aspect;
  const root = stageEl.object3D;
  root.matrixAutoUpdate = true;
  root.position.set(0, 0.13 * 600, -1200);
  root.rotation.set(0, 0, 0);
  root.scale.setScalar(Math.min(650, (available * 0.9) / 1.5));
  root.updateMatrix();
  root.matrixWorldNeedsUpdate = true;
  root.visible = true;
}
async function createScene(kind) {
  mode = kind;
  $("welcome").hidden = true;
  $("dialogue").hidden = false;
  $("debug").hidden = !DEBUG_MODE;
  const host = $("scene-host");
  const old = host.querySelector("a-scene");
  if (old && !old.renderer)
    await new Promise((r) =>
      old.addEventListener("renderstart", r, { once: true }),
    );
  old?.pause();
  stage?.detachInput();
  host.innerHTML = `<a-scene embedded renderer="antialias: true; alpha: true; colorManagement: true" vr-mode-ui="enabled: false" webxr="optionalFeatures: local-floor, bounded-floor, hand-tracking" loading-screen="enabled: false">
    <a-entity light="type: ambient; intensity: 0.7"></a-entity><a-entity light="type: directional; intensity: 0.9" position="1 2 2"></a-entity>
    <a-camera id="view-camera" position="0 0 0" look-controls="enabled: ${kind === "quest"}" wasd-controls="enabled: false"></a-camera>
    <a-entity id="stage" time-stage position="0 0 -2" scale="1.3 1.3 1.3"></a-entity>
    <a-entity laser-controls="hand: right" raycaster="objects: .clickable; far: 6" line="color: #74e4cd"></a-entity>
    <a-entity laser-controls="hand: left" raycaster="objects: .clickable; far: 6" line="color: #74e4cd"></a-entity>
  </a-scene>`;
  scene = host.querySelector("a-scene");
  if (!scene.hasLoaded)
    await new Promise((r) =>
      scene.addEventListener("loaded", r, { once: true }),
    );
  stageEl = $("stage");
  stage = stageEl.components["time-stage"].stage;
  game.questMode = kind === "quest";
  stage.sundialEnabled = true;
  if (kind !== "quest") {
    scene.canvas.style.touchAction = "none";
    stage.attachInput(scene.canvas, scene.camera, game);
  }
  scene.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  scene.addEventListener("enter-vr", () => {
    if (scene.is("ar-mode")) {
      document.body.classList.add("xr");
      stage.setXR(true);
    }
  });
  scene.addEventListener("exit-vr", () => {
    document.body.classList.remove("xr");
    stage.setXR(false);
    const enter = $("enter-xr");
    if (enter) enter.hidden = false;
  });
  if (kind !== "phone") {
    scene.renderer.setClearColor("#102d40", 1);
  }
  if (kind === "demo") fitPreview();
  render();
  return scene;
}
function fitPreview() {
  if (!stageEl || mode !== "demo") return;
  const c = scene.camera;
  if (!c) return;
  const available =
    (2 * Math.tan((c.fov * Math.PI) / 360) * 2 * innerWidth) / innerHeight;
  stageEl.object3D.scale.setScalar(Math.min(1.3, (available * 0.9) / 1.5));
  stageEl.object3D.position.set(0, 0.13, -2);
  stageEl.object3D.rotation.x = -0.24;
}
window.addEventListener("resize", fitPreview);
window.addEventListener("resize", syncPhonePresentation);
async function startCamera() {
  trackerReady = false;
  stage.notice = null;
  tracker?.stop();
  tracker = new CardTracker({
    video: $("camera-feed"),
    scene,
    root: stageEl.object3D,
    mode,
    onFound: (index) => {
      const id = SPOTS[index]?.id;
      if (game.recognize(id)) status(`${game.spot.name}を認識しました`);
      syncPhonePresentation();
    },
    onLost: (index) => {
      if (mode === "phone" && index === game.index) stage.cancelInput();
      if (
        !game.replaying &&
        index === game.index &&
        game.phase !== "scan" &&
        !["tutorial", "ended"].includes(game.phase)
      )
        status("カードをもう一度映すと、AR表示が戻ります");
      syncPhonePresentation();
    },
    onStatus: status,
  });
  try {
    await tracker.start();
    trackerReady = true;
    tracker.setTarget(game.index);
    if (mode === "phone" && game.phase === "tutorial") {
      // MindAR uses image-pixel camera units. Keep the guide in front of the camera until first detection.
      stageEl.object3D.matrixAutoUpdate = true;
      stageEl.object3D.position.set(0, 0, -1200);
      stageEl.object3D.scale.setScalar(650);
    }
    render();
  } catch (e) {
    tracker.stop();
    const reason =
      e.name === "NotAllowedError"
        ? "カメラの使用が許可されていません。ブラウザーのサイト設定を確認してください。"
        : e.name === "NotFoundError"
          ? "利用できるカメラが見つかりません。カメラなしのプレビューで確認できます。"
          : e.name === "OverconstrainedError"
            ? "Questブラウザーから実景カメラを取得できませんでした。OSとブラウザーを更新し、権限を確認してください。"
            : e.message;
    showError(reason);
  }
}
function showError(text) {
  $("error").hidden = false;
  $("error-text").textContent = text;
  if (stage) {
    stage.notice = text;
    stage.drawPanel();
  }
  status(text);
}
function activate() {
  if (mode === "welcome") return;
  if (stage?.notice && scene?.is("ar-mode")) {
    scene.exitVR();
    return;
  }
  if (stage?.h.transforming && ["transformed", "ended"].includes(game.phase)) return;
  if (!game.replaying && game.phase === "ended") {
    tracker?.stop();
    const home = () => {
      location.href = DEBUG_MODE ? "./?debug=1" : "./";
    };
    if (scene?.is("ar-mode")) {
      Promise.resolve(scene.exitVR()).then(home, home);
    } else home();
    return;
  }
  if (game.replaying) {
    game.advance();
  } else if (game.phase === "scan") {
    if (mode === "demo") game.recognize(game.spot.id);
  } else game.advance();
}
window.addEventListener("game-action", activate);
window.addEventListener("character-ready", render);
window.addEventListener("game-back", () => game.back());
$("back").addEventListener("click", () => game.back());
$("action").addEventListener("click", activate);
$("phone").onclick = async () => {
  if (busy) return;
  busy = true;
  try {
    await createScene("phone");
    await startCamera();
  } catch (e) {
    showError(e.message);
  } finally {
    busy = false;
  }
};
$("preview").onclick = async () => {
  if (busy) return;
  busy = true;
  try {
    await createScene("demo");
  } finally {
    busy = false;
  }
};
$("quest").onclick = async () => {
  if (busy) return;
  busy = true;
  try {
    await createScene("quest");
    status("まず「透視ARに入る」を選択してください");
    const enter = document.createElement("button");
    enter.id = "enter-xr";
    enter.textContent = "透視ARに入る";
    enter.style.cssText = "position:fixed;top:90px;right:20px;z-index:8";
    document.body.append(enter);
    enter.onclick = () => {
      if (!xrSupported) {
        showError(
          "このブラウザーは透視WebXRに対応していません。Quest BrowserでHTTPSのURLを開いてください。",
        );
        return;
      }
      // Request immersive AR directly in a fresh user gesture, not after camera/compiler awaits.
      scene.renderer.setClearColor(0, 0);
      scene
        .enterAR()
        .then(() => {
          enter.hidden = true;
          startCamera();
        })
        .catch((e) => {
          scene.renderer.setClearColor("#102d40", 1);
          showError(`透視ARを開始できませんでした：${e.message}`);
        });
    };
  } catch (e) {
    showError(e.message);
  } finally {
    busy = false;
  }
};
if (navigator.xr)
  navigator.xr
    .isSessionSupported("immersive-ar")
    .then((v) => {
      xrSupported = v;
    })
    .catch(() => {});
$("retry").onclick = () => {
  $("error").hidden = true;
  startCamera();
};
$("error-preview").onclick = () => {
  tracker?.stop();
  location.href = "./?preview=1" + (DEBUG_MODE ? "&debug=1" : "");
};
$("debug-trigger").onclick = () => game.recognize($("debug-spot").value);
$("debug-form").onclick = () => {
  stage.manualForm =
    (stage.manualForm || game.form) === "original" ? "suit" : "original";
  stage.h.setForm(stage.manualForm);
  render();
};
$("debug-motion").onchange = () => {
  stage.manualMotion = $("debug-motion").value;
  stage.h.setMotion(stage.manualMotion);
  render();
};
$("debug-collect").onclick = () => {
  if (game.phase === "restoring") game.finishRestoration();
  if (game.phase === "fragment") game.collectFragment();
};
$("debug-final").onclick = () => game.debugFinal();
$("debug-reset").onclick = () => game.reset();
$("debug-spot").onchange = () => {
  game.debugJump($("debug-spot").value);
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stage?.cancelInput();
  if (!tracker?.controller) return;
  if (document.hidden) tracker.controller.stopProcessVideo();
  else if (tracker.stream) tracker.controller.processVideo(tracker.video);
});
window.addEventListener("pagehide", () => tracker?.stop());
// Developer API: no global route mutations are enabled unless explicitly requested.
if (DEBUG_MODE)
  window.webARDebug = {
    game,
    get stage() {
      return stage;
    },
    get tracker() {
      return tracker;
    },
  };
// A procedural character is already visible behind the start sheet.
const host = $("scene-host");
host.innerHTML =
  '<a-scene embedded renderer="antialias: true; alpha: true" vr-mode-ui="enabled: false" loading-screen="enabled: false"><a-entity light="type: ambient; intensity: 0.7"></a-entity><a-entity light="type: directional; intensity: 0.9" position="2 3 2"></a-entity><a-camera position="0 0 0" look-controls="enabled: false" wasd-controls="enabled: false"></a-camera><a-entity time-stage position="0.65 0 -2.4" scale="1.4 1.4 1.4"></a-entity></a-scene>';
const initial = host.querySelector("a-scene");
initial.addEventListener("loaded", () => {
  initial.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  initial.renderer.setClearColor("#102d40", 1);
  host
    .querySelector("[time-stage]")
    .components["time-stage"].stage.setGame(game);
});
if (new URLSearchParams(location.search).get("preview") === "1") {
  selectExperience();
  $("preview").click();
}
