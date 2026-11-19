// The picture's play button used to call the current player's toggle, so it did
// nothing until "播放这一集" loaded this episode. playThis has to start this
// episode itself. Run: npx tsx scripts/play-this.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.window = globalThis;
window.addEventListener = window.addEventListener || (() => {});
window.removeEventListener = window.removeEventListener || (() => {});
window.setTimeout = setTimeout;
window.clearTimeout = clearTimeout;
globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  documentElement: {},
};
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
if (!globalThis.navigator) globalThis.navigator = { language: "zh-CN", languages: ["zh-CN"], userAgent: "node", platform: "MacIntel" };

const { useStore, offerPlayer, withdrawPlayer } = await import("../src/store.ts");
const { playThis } = await import("../src/components/Players.tsx");

const tick = () => new Promise((r) => setTimeout(r, 0));
const ep = (id, extra = {}) => ({ id, showId: "show", guid: id, title: id, progress: 0, duration: 60, ...extra });
const handle = (id) => {
  const calls = [];
  return {
    calls,
    episodeId: id,
    seek() { calls.push("seek"); },
    toggle() { calls.push("toggle"); },
    play() { calls.push("play"); },
    setRate() { calls.push("rate"); },
  };
};

function reset() {
  useStore.setState({ current: null, player: null, playing: false, playWhenReady: null, loadingSince: null, time: 0, length: 0 });
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("poster click before the player exists arms playback, it does not no-op", async () => {
  reset();
  const a = ep("a");
  playThis(a);
  const s = useStore.getState();
  assert.equal(s.current?.id, "a");
  assert.equal(s.player, null);
  assert.equal(s.playWhenReady, "a");
  const h = handle("a");
  offerPlayer(h);
  await tick();
  assert.deepEqual(h.calls, ["play"]);
  assert.equal(useStore.getState().playWhenReady, null);
  withdrawPlayer(h);
});

test("poster click while another episode has the player starts this one", async () => {
  reset();
  const other = handle("other");
  const mine = handle("mine");
  offerPlayer(other);
  useStore.getState().load(ep("other"));
  useStore.setState({ playing: true, player: other });
  offerPlayer(mine);
  playThis(ep("mine", { videoId: "yt" }));
  assert.equal(useStore.getState().current?.id, "mine");
  assert.equal(useStore.getState().current?.videoId, "yt");
  assert.deepEqual(other.calls, [], "must not toggle the episode that was already playing");
  assert.deepEqual(mine.calls, ["play"]);
  withdrawPlayer(other);
  withdrawPlayer(mine);
});

test("a second click on the episode that is already playing pauses it", () => {
  reset();
  const h = handle("cur");
  offerPlayer(h);
  useStore.getState().load(ep("cur"));
  useStore.setState({ playing: true });
  assert.equal(useStore.getState().player, h);
  playThis(ep("cur"));
  assert.deepEqual(h.calls, ["toggle"]);
  assert.equal(useStore.getState().current?.id, "cur");
  withdrawPlayer(h);
});

test("audio cover loads a video episode without its video", () => {
  reset();
  playThis(ep("aud", { videoId: undefined, progress: 15 }));
  const cur = useStore.getState().current;
  assert.equal(cur?.id, "aud");
  assert.equal(cur?.videoId, undefined);
  assert.equal(useStore.getState().playWhenReady, "aud");
});

test("the episode page no longer has a second play button", () => {
  const view = readFileSync(new URL("../src/components/EpisodeView.tsx", import.meta.url), "utf8");
  const players = readFileSync(new URL("../src/components/Players.tsx", import.meta.url), "utf8");
  assert.equal(view.includes("播放这一集"), false);
  assert.match(view, /const coverToggle = \(\) => playThis\(/);
  assert.match(players, /const toggle = \(\) => playThis\(ep\)/);
  assert.match(players, /onClick=\{\(\) => playThis\(ep\)\}/);
  assert.doesNotMatch(players, /PlayHint[\s\S]{0,180}player\?\.toggle\(\)/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok  ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}`);
    console.error(e);
  }
}
if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log(`${tests.length} passed`);
