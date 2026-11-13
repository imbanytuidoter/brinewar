import type { KeyValue } from "./storage";

export type Theme = "harbour" | "battle";
export type Sting = "victory" | "defeat";

export interface AudioLike {
  volume: number;
  loop: boolean;
  readonly paused: boolean;
  currentTime: number;
  onended: (() => void) | null;
  play(): Promise<void> | void;
  pause(): void;
}

interface MusicDeps {
  readonly make: (src: string) => AudioLike;
  readonly level: () => number;
  readonly store: KeyValue | null;
  readonly fadeMs: number;
}

const MUSIC_KEY = "brinewar.music";
const THEME_LEVEL = 0.3;
const STING_LEVEL = 0.75;
const FADE_STEP_MS = 50;

export interface MusicBox {
  readonly on: boolean;
  setOn(on: boolean): void;
  play(theme: Theme | null): void;
  sting(kind: Sting): void;
  unlock(): void;
  refresh(): void;
  pauseAll(hidden: boolean): void;
  subscribe(fn: () => void): () => void;
}

export function createMusicBox(d: MusicDeps): MusicBox {
  const tracks = new Map<string, AudioLike>();
  const targets = new Map<AudioLike, number>();
  const listeners = new Set<() => void>();
  let on = d.store?.get(MUSIC_KEY) !== "0";
  let want: Theme | null = null;
  let unlocked = false;
  let ducked = false;
  let hidden = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const track = (name: string, loop: boolean): AudioLike => {
    const known = tracks.get(name);
    if (known) return known;
    const a = d.make(`/music/${name}.mp3`);
    a.loop = loop;
    a.volume = 0;
    tracks.set(name, a);
    return a;
  };

  const settle = (a: AudioLike): void => {
    const t = targets.get(a) ?? 0;
    a.volume = t;
    if (t === 0 && !a.paused) a.pause();
  };

  const tick = (): void => {
    const step = d.fadeMs <= 0 ? 1 : FADE_STEP_MS / d.fadeMs;
    let moving = false;
    for (const [a, t] of targets) {
      const v = a.volume + Math.sign(t - a.volume) * Math.min(Math.abs(t - a.volume), step);
      a.volume = Math.max(0, Math.min(1, v));
      if (Math.abs(a.volume - t) > 0.001) moving = true;
      else settle(a);
    }
    if (!moving && timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const start = (a: AudioLike): void => {
    if (!a.paused) return;
    try {
      void Promise.resolve(a.play()).catch(() => undefined);
    } catch {
      return;
    }
  };

  const apply = (): void => {
    const level = d.level();
    const audible = on && unlocked && !hidden && !ducked && level > 0;
    for (const name of ["harbour", "battle"] as const) {
      const active = audible && want === name;
      if (!active && !tracks.has(name)) continue;
      const a = track(name, true);
      targets.set(a, active ? THEME_LEVEL * level : 0);
      if (active) start(a);
    }
    if (d.fadeMs <= 0) for (const a of targets.keys()) settle(a);
    else if (!timer) timer = setInterval(tick, FADE_STEP_MS);
  };

  const notify = (): void => {
    for (const fn of listeners) fn();
  };

  return {
    get on() {
      return on;
    },
    setOn(next: boolean) {
      on = next;
      try {
        d.store?.set(MUSIC_KEY, next ? "1" : "0");
      } catch {
        void 0;
      }
      apply();
      notify();
    },
    play(theme: Theme | null) {
      want = theme;
      apply();
    },
    sting(kind: Sting) {
      const level = d.level();
      if (!unlocked || level <= 0) return;
      const s = track(kind, false);
      for (const other of ["victory", "defeat"] as const) {
        const o = tracks.get(other);
        if (o && o !== s) o.pause();
      }
      ducked = true;
      apply();
      s.currentTime = 0;
      s.volume = STING_LEVEL * level;
      targets.delete(s);
      s.onended = () => {
        ducked = false;
        apply();
      };
      start(s);
    },
    unlock() {
      if (unlocked) return;
      unlocked = true;
      apply();
    },
    refresh() {
      apply();
    },
    pauseAll(next: boolean) {
      hidden = next;
      apply();
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
