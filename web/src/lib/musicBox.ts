import { createMusicBox, type AudioLike } from "./music";
import { sound } from "./sound";
import { browserStorage } from "./storage";

const FADE_MS = 1200;

function makeAudio(src: string): AudioLike {
  const a = new Audio();
  a.preload = "none";
  a.src = src;
  let ended: (() => void) | null = null;
  a.addEventListener("ended", () => ended?.());
  return {
    get volume() {
      return a.volume;
    },
    set volume(v: number) {
      a.volume = v;
    },
    get loop() {
      return a.loop;
    },
    set loop(v: boolean) {
      a.loop = v;
    },
    get paused() {
      return a.paused;
    },
    get currentTime() {
      return a.currentTime;
    },
    set currentTime(v: number) {
      a.currentTime = v;
    },
    get onended() {
      return ended;
    },
    set onended(fn: (() => void) | null) {
      ended = fn;
    },
    play: () => a.play(),
    pause: () => a.pause(),
  };
}

export const music = createMusicBox({
  make: makeAudio,
  level: () => (sound.muted ? 0 : sound.volume),
  store: typeof window === "undefined" ? null : browserStorage(),
  fadeMs: FADE_MS,
});

const GESTURES = ["pointerdown", "pointerup", "keydown", "touchend", "click"] as const;

if (typeof window !== "undefined") {
  sound.subscribe(() => music.refresh());
  const retry = (): void => music.unlock();
  for (const name of GESTURES) window.addEventListener(name, retry, { passive: true, capture: true });
  document.addEventListener("visibilitychange", () => music.pauseAll(document.hidden));
  music.start();
}
