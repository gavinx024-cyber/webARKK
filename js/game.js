import { applyEventInput, eventProgress, eventInstruction, freshEvent, TAU } from "./spot-events.js";
export const SPOTS = [
  { id: "sundial", name: "日時計", season: "はじまり", color: "#79b9f0" },
  {
    id: "spring",
    name: "バラ園",
    season: "春",
    color: "#f29bbb",
    title: "春の時間を咲かせよう",
    text: "止まった花びらに、時間の力を届けよう。",
    action: "花を咲かせる",
  },
  {
    id: "summer",
    name: "噴水",
    season: "夏",
    color: "#55cdeb",
    title: "水の時間を動かそう",
    text: "空中で止まった水を、もう一度流そう。",
    action: "水を流す",
  },
  {
    id: "autumn",
    name: "ケヤキ並木",
    season: "秋",
    color: "#ffc15a",
    title: "秋の風を呼び戻そう",
    text: "止まった葉に風を送り、季節を進めよう。",
    action: "風を送る",
  },
  {
    id: "winter",
    name: "大塩平八郎終焉の地碑",
    season: "冬",
    color: "#c0acf8",
    title: "冬の記憶を目覚めさせよう",
    text: "静かな石碑に残る時間の波紋を、解き放とう。",
    action: "波紋を広げる",
  },
];
export const SHADOW_LIMIT = Math.PI * 0.72;
// Recognition sources only dispatch spot IDs; the game never depends on a tracker.
export class Game {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.reset();
  }
  reset() {
    this.phase = "tutorial";
    this.index = 0;
    this.fragments = new Set();
    this.shadowProgress = 0;
    this.finalShadow = 0;
    this.events = Object.fromEntries(SPOTS.slice(1).map((s) => [s.id, freshEvent()]));
    this.history = [];
    this.cursor = -1;
    this.record();
    this.emit();
  }
  get replaying() {
    return this.cursor < this.history.length - 1;
  }
  get canGoBack() {
    return this.cursor > 0;
  }
  get storyFragmentCount() {
    return this.history[this.cursor]?.fragmentCount ?? this.fragments.size;
  }
  record() {
    this.history.push({
      phase: this.phase,
      index: this.index,
      fragmentCount: this.fragments.size,
      shadowProgress: this.shadowProgress,
      finalShadow: this.finalShadow,
      events: structuredClone(this.events),
    });
    this.cursor = this.history.length - 1;
  }
  restore(index) {
    this.cursor = index;
    this.phase = this.history[index].phase;
    this.index = this.history[index].index;
    this.shadowProgress = this.history[index].shadowProgress;
    this.finalShadow = this.history[index].finalShadow;
    this.events = structuredClone(this.history[index].events);
    this.emit();
  }
  back() {
    if (!this.canGoBack) return false;
    let index = this.cursor - 1;
    while (index > 0 && this.history[index].phase === "scan") index--;
    this.restore(index);
    return true;
  }
  get spot() {
    return SPOTS[this.index];
  }
  get form() {
    return ["tutorial", "opening-live", "opening-frozen", "opening-drag", "opening-jammed", "ended"].includes(
      this.phase,
    ) ||
      (this.phase === "scan" &&
        this.index === 0 &&
        this.storyFragmentCount === 0)
      ? "original"
      : "suit";
  }
  emit() {
    this.onChange(this);
  }
  recognize(id) {
    if (this.replaying || this.phase !== "scan" || id !== this.spot.id)
      return false;
    this.phase =
      this.index === 0
        ? this.fragments.size === 4
          ? "finale"
          : "opening-live"
        : "event";
    this.record();
    this.emit();
    return true;
  }
  moveShadow(delta) {
    if (this.replaying || !["opening-drag", "finale-drag"].includes(this.phase) ||
        !Number.isFinite(delta) || Math.abs(delta) > 0.55) return false;
    const ending = this.phase === "finale-drag", key = ending ? "finalShadow" : "shadowProgress";
    const limit = ending ? TAU : SHADOW_LIMIT;
    this[key] = Math.max(0, Math.min(limit, this[key] + delta));
    this.history[this.cursor][key] = this[key];
    if (this[key] >= limit) {
      this.phase = ending ? "time-restored" : "opening-jammed";
      this.record();
      this.emit();
    } else this.emit();
    return true;
  }
  interact(input) {
    if (this.replaying || this.phase !== "event" || !this.events[this.spot.id]) return false;
    const state = this.events[this.spot.id];
    if (!applyEventInput(this.spot.id, state, input)) return false;
    this.history[this.cursor].events = structuredClone(this.events);
    if (eventProgress(this.spot.id, state) >= 1) {
      this.phase = "restoring";
      this.record();
    }
    this.emit();
    return true;
  }
  finishRestoration() {
    if (this.replaying || this.phase !== "restoring") return false;
    this.phase = "fragment";
    this.record(); this.emit(); return true;
  }
  collectFragment() {
    if (this.replaying || this.phase !== "fragment") return false;
    this.fragments.add(this.spot.id);
    this.phase = "reward";
    this.record(); this.emit(); return true;
  }
  finishAssembly() {
    if (this.replaying || this.phase !== "finale" || this.fragments.size !== 4) return false;
    this.phase = "finale-drag";
    this.finalShadow = 0;
    this.record(); this.emit(); return true;
  }
  finishEnding() {
    if (this.replaying || this.phase !== "time-restored" || this.finalShadow < TAU) return false;
    this.phase = "ended";
    this.record(); this.emit(); return true;
  }
  advance() {
    if (this.replaying) {
      let index = this.cursor + 1;
      while (
        index < this.history.length - 1 &&
        this.history[index].phase === "scan"
      )
        index++;
      this.restore(index);
      return;
    }
    switch (this.phase) {
      case "tutorial":
        this.phase = "scan";
        break;
      case "opening-live":
        this.phase = "opening-frozen";
        break;
      case "opening-frozen":
        this.shadowProgress = 0;
        this.phase = "opening-drag";
        break;
      case "opening-drag":
        return;
      case "opening-jammed":
        this.phase = "transformed";
        break;
      case "transformed":
        this.index = 1;
        this.phase = "scan";
        break;
      case "reward":
        this.index = this.index === 4 ? 0 : this.index + 1;
        this.phase = "scan";
        break;
      case "ended":
        this.reset();
        return;
      default:
        return;
    }
    this.record();
    this.emit();
  }
  debugJump(id) {
    this.index = SPOTS.findIndex((s) => s.id === id);
    if (this.index < 0) this.index = 0;
    this.phase = "scan";
    this.shadowProgress = 0;
    if (this.events[this.spot.id]) this.events[this.spot.id] = freshEvent();
    this.history = [];
    this.record();
    this.emit();
  }
  debugFinal() {
    this.fragments = new Set(SPOTS.slice(1).map((s) => s.id));
    this.index = 0;
    this.phase = "scan";
    this.shadowProgress = 0;
    this.finalShadow = 0;
    this.history = [];
    this.record();
    this.emit();
  }
}
export function dialogue(g) {
  const p = g.phase,
    s = g.spot;
  if (p === "tutorial")
    return {
      title: "こんにちは、ぼくは小H！",
      text: "5枚のカードで公園を巡ろう。日時計から出発して、春・夏・秋・冬の時間のかけらを集めたら、もう一度日時計へ。",
      button: "日時計へ進む",
    };
  if (p === "scan")
    return {
      title:
        g.fragments.size === 4 ? "日時計へ帰ろう" : `${s.name}のカードを探そう`,
      text: "カードの全体をカメラに映してください。認識すると物語が始まります。",
      button: null,
    };
  if (p === "opening-live")
    return {
      title: "公園の時間が動いている",
      text: "日時計の針と人影が、ゆっくり動いているよ。",
      button: "様子を見る",
    };
  if (p === "opening-frozen")
    return {
      title: "……時間が止まった！",
      text: "影（かげ）が止（と）まった……。動（うご）かしてみよう！",
      button: "影を動かす",
    };
  if (p === "opening-drag")
    return {
      title: "影（かげ）を動（うご）かしてみて！",
      text: g.questMode
        ? "コントローラーで影（かげ）の光（ひかり）を選（えら）んで、時計回（とけいまわ）りに動（うご）かそう。"
        : "光（ひか）る点（てん）を押（お）さえて、矢印（やじるし）の方向（ほうこう）へ。指（ゆび）を離（はな）しても続（つづ）けられるよ。",
      button: null,
    };
  if (p === "opening-jammed")
    return {
      title: "ガッ……時間（じかん）のかけらがない！",
      text: "4つの空（あ）いた場所（ばしょ）がある。公園（こうえん）に散（ち）らばったかけらを探（さが）そう！",
      button: "小Hと時間旅行へ",
    };
  if (p === "transformed")
    return {
      title: "時間旅行、出発！",
      text: "まずは春のバラ園へ。時間の力で、止まった季節を動かそう。",
      button: "春へ進む",
    };
  if (p === "event") return { title: s.title, text: eventInstruction(s.id, g.events[s.id], g.questMode), button: null };
  if (p === "restoring")
    return {
      title: "時間が動き始めた！",
      text: "見て！止まっていた季節が動き出した。光の中に、かけらが生まれるよ。",
      button: null,
    };
  if (p === "fragment") return {
    title: "時間のかけらを受け取ろう",
    text: g.questMode ? "光るかけらを選んで受け取ろう。" : "光るかけらを押さえて、上へ引き出そう。",
    button: null,
  };
  if (p === "reward")
    return {
      title: "時間のかけらを見つけた！",
      text: `これで${g.storyFragmentCount}つ。${g.storyFragmentCount === 4 ? "4つ揃った！日時計へ戻ろう。" : "次の季節へ進もう。"}`,
      button: g.storyFragmentCount === 4 ? "日時計へ戻る" : "次の季節へ",
    };
  if (p === "finale")
    return {
      title: "4つの時間を、ひとつに",
      text: "4つのかけらが、日時計の空いた場所に戻っていく……。",
      button: null,
    };
  if (p === "finale-drag") return {
    title: "影を一周させて、時間を取り戻そう！",
    text: g.questMode ? "影の光を選んで、時計回りに一周させよう。" : "光る点を押さえ、時計回りに一周。指を離しても続けられるよ。",
    button: null,
  };
  if (p === "time-restored") return {
    title: "公園の時間が、戻ってきた！",
    text: "影が動き、人も歩き出す。春・夏・秋・冬が、また巡り始めた！",
    button: null,
  };
  return {
    title: "おめでとうございます！",
    text: "4つのかけらを集め、公園の時間を取り戻しました。ありがとう！これで時間旅行はおしまい。前の場面も、もう一度楽しめるよ。",
    button: "最初の画面へ",
  };
}
