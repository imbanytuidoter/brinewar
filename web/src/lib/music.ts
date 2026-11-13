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

const LEGACY_KEY = "brinewar.music";
const VOLUME_KEY = "brinewar.music.volume";
const DEFAULT_VOLUME = 0.5;
const THEME_PEAK = 0.5;
const STING_PEAK = 1.4;
const FADE_STEP_MS = 50;
const THEMES = ["harbour", "battle"] as const;

export interface MusicBox {
  readonly volume: number;
  readonly blocked: boolean;
  setVolume(volume: number): void;
  start(): void;
  play(theme: Theme): void;
  sting(kind: Sting): void;
  unlock(): void;
  refresh(): void;
  pauseAll(hidden: boolean): void;
  subscribe(fn: () => void): () => void;
}

function readVolume(store: KeyValue | null): number {
  try {
    const raw = store?.get(VOLUME_KEY) ?? null;
    const v = raw === null ? Number.NaN : Number(raw);
    if (Number.isFinite(v) && v >= 0 && v <= 1) return v;
    return store?.get(LEGACY_KEY) === "0" ? 0 : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function createMusicBox(d: MusicDeps): MusicBox {
  const tracks = new Map<string, AudioLike>();
  const targets = new Map<AudioLike, number>();
  const listeners = new Set<() => void>();
  let volume = readVolume(d.store);
  let want: Theme = "harbour";
  let started = false;
  let blocked = false;
  let ducked = false;
  let hidden = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const notify = (): void => {
    for (const fn of listeners) fn();
  };

  const setBlocked = (next: boolean): void => {
    if (blocked === next) return;
    blocked = next;
    notify();
  };

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

  const begin = (a: AudioLike, onFail: (() => void) | null = null): void => {
    if (!a.paused) return;
    const failed = (err: unknown): void => {
      if (err instanceof Error && err.name === "AbortError") return;
      if (onFail) onFail();
      else setBlocked(true);
    };
    try {
      void Promise.resolve(a.play()).then(() => setBlocked(false), failed);
    } catch (err) {
      failed(err);
    }
  };

  const apply = (): void => {
    const level = d.level() * volume;
    const audible = started && !hidden && !ducked && level > 0;
    for (const name of THEMES) {
      const active = audible && want === name;
      if (!active && !tracks.has(name)) continue;
      const a = track(name, true);
      targets.set(a, active ? THEME_PEAK * level : 0);
      if (active) begin(a);
    }
    if (d.fadeMs <= 0) for (const a of targets.keys()) settle(a);
    else if (!timer) timer = setInterval(tick, FADE_STEP_MS);
  };

  return {
    get volume() {
      return volume;
    },
    get blocked() {
      return blocked;
    },
    setVolume(next: number) {
      volume = Math.min(1, Math.max(0, next));
      try {
        d.store?.set(VOLUME_KEY, String(volume));
      } catch {
        void 0;
      }
      apply();
      notify();
    },
    start() {
      started = true;
      apply();
    },
    play(theme: Theme) {
      want = theme;
      apply();
    },
    sting(kind: Sting) {
      const level = d.level() * volume;
      if (!started || blocked || level <= 0) return;
      const s = track(kind, false);
      for (const other of ["victory", "defeat"] as const) {
        const o = tracks.get(other);
        if (o && o !== s) o.pause();
      }
      ducked = true;
      apply();
      s.currentTime = 0;
      s.volume = Math.min(1, STING_PEAK * level);
      targets.delete(s);
      const lift = (): void => {
        ducked = false;
        apply();
      };
      s.onended = lift;
      begin(s, lift);
    },
    unlock() {
      if (started && blocked) apply();
    },
    refresh() {
      apply();
    },
    pauseAll(next: boolean) {
      hidden = next;
      apply();
      if (hidden) for (const a of targets.keys()) settle(a);
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
