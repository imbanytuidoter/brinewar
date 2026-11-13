import { describe, expect, it } from "vitest";
import type { KeyValue } from "./storage";
import { createMusicBox, type AudioLike } from "./music";

class FakeAudio implements AudioLike {
  volume = 0;
  loop = false;
  paused = true;
  currentTime = 0;
  plays = 0;
  onended: (() => void) | null = null;
  constructor(
    readonly src: string,
    readonly allowed: () => boolean,
  ) {}
  failWith: string | null = null;
  play(): Promise<void> {
    this.plays += 1;
    if (this.failWith) {
      const err = new Error(this.failWith);
      err.name = this.failWith;
      return Promise.reject(err);
    }
    if (!this.allowed()) return Promise.reject(new Error("NotAllowedError"));
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
}

function memory(seed: Record<string, string> = {}): KeyValue {
  const data = new Map(Object.entries(seed));
  return { get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k) };
}

function box(opts: { allowed?: boolean; store?: KeyValue | null; fadeMs?: number; broken?: string } = {}) {
  const made: FakeAudio[] = [];
  let volume = 0.8;
  let allowed = opts.allowed ?? true;
  const m = createMusicBox({
    make: (src) => {
      const a = new FakeAudio(src, () => allowed);
      if (opts.broken && src.includes(opts.broken)) a.failWith = "NotSupportedError";
      made.push(a);
      return a;
    },
    level: () => volume,
    store: opts.store ?? null,
    fadeMs: opts.fadeMs ?? 0,
  });
  const el = (name: string) => made.find((a) => a.src.includes(name));
  return { m, made, el, allow: () => (allowed = true), setVolume: (v: number) => { volume = v; m.refresh(); } };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("music", () => {
  it("starts the harbour theme on any page without a call from the page", () => {
    const { m, el } = box();
    m.start();
    expect(el("harbour")?.paused).toBe(false);
    expect(el("harbour")?.loop).toBe(true);
  });

  it("retries on the first tap when the browser blocked autoplay", async () => {
    const { m, el, allow } = box({ allowed: false });
    m.start();
    await settle();
    expect(el("harbour")?.paused).toBe(true);
    expect(m.blocked).toBe(true);
    allow();
    m.unlock();
    await settle();
    expect(el("harbour")?.paused).toBe(false);
    expect(m.blocked).toBe(false);
  });

  it("crosses from the harbour theme to the battle theme and back", () => {
    const { m, el } = box();
    m.start();
    m.play("battle");
    expect(el("battle")?.paused).toBe(false);
    expect(el("battle")?.volume).toBeGreaterThan(0);
    expect(el("harbour")?.volume).toBe(0);
    m.play("harbour");
    expect(el("harbour")?.volume).toBeGreaterThan(0);
    expect(el("battle")?.volume).toBe(0);
  });

  it("has its own volume on top of the sound volume and remembers it", () => {
    const store = memory();
    const { m, el, setVolume } = box({ store });
    m.start();
    const full = el("harbour")?.volume ?? 0;
    m.setVolume(m.volume / 2);
    expect(el("harbour")?.volume).toBeCloseTo(full / 2);
    setVolume(0.4);
    expect(el("harbour")?.volume).toBeCloseTo(full / 4);
    m.setVolume(0);
    expect(el("harbour")?.volume).toBe(0);
    expect(el("harbour")?.paused).toBe(true);
    expect(box({ store }).m.volume).toBe(0);
  });

  it("keeps music silent for a captain who switched it off before", () => {
    expect(box({ store: memory({ "brinewar.music": "0" }) }).m.volume).toBe(0);
  });

  it("plays the victory sting over a ducked theme, then brings the theme back", () => {
    const { m, el } = box();
    m.start();
    m.sting("victory");
    const sting = el("victory");
    expect(sting?.paused).toBe(false);
    expect(el("harbour")?.volume).toBe(0);
    sting?.onended?.();
    expect(el("harbour")?.volume).toBeGreaterThan(0);
  });

  it("brings the theme back when a sting cannot play", async () => {
    const { m, el } = box({ broken: "victory" });
    m.start();
    m.sting("victory");
    await settle();
    expect(el("harbour")?.volume).toBeGreaterThan(0);
    expect(m.blocked).toBe(false);
  });

  it("goes quiet at once when the tab is hidden, without waiting for a fade", () => {
    const { m, el } = box({ fadeMs: 1200 });
    m.start();
    m.pauseAll(true);
    expect(el("harbour")?.paused).toBe(true);
  });
});
