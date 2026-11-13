import { describe, expect, it } from "vitest";
import { createMusicBox, type AudioLike } from "./music";

class FakeAudio implements AudioLike {
  volume = 0;
  loop = false;
  paused = true;
  currentTime = 0;
  plays = 0;
  onended: (() => void) | null = null;
  constructor(readonly src: string) {}
  play(): Promise<void> {
    this.plays += 1;
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
}

function box() {
  const made: FakeAudio[] = [];
  let volume = 0.8;
  let muted = false;
  const m = createMusicBox({ make: (src) => { const a = new FakeAudio(src); made.push(a); return a; }, level: () => (muted ? 0 : volume), store: null, fadeMs: 0 });
  const el = (name: string) => made.find((a) => a.src.includes(name));
  return { m, made, el, setVolume: (v: number) => { volume = v; m.refresh(); }, mute: (v: boolean) => { muted = v; m.refresh(); } };
}

describe("music", () => {
  it("waits for the first tap before it plays anything", () => {
    const { m, made } = box();
    m.play("harbour");
    expect(made.every((a) => a.paused)).toBe(true);
    m.unlock();
    expect(made.find((a) => a.src.includes("harbour"))?.paused).toBe(false);
  });

  it("crosses from the harbour theme to the battle theme and back", () => {
    const { m, el } = box();
    m.unlock();
    m.play("harbour");
    m.play("battle");
    expect(el("battle")?.paused).toBe(false);
    expect(el("battle")?.loop).toBe(true);
    expect(el("battle")?.volume).toBeGreaterThan(0);
    expect(el("harbour")?.volume).toBe(0);
    m.play("harbour");
    expect(el("harbour")?.volume).toBeGreaterThan(0);
    expect(el("battle")?.volume).toBe(0);
  });

  it("follows the sound volume and goes silent when music is switched off", () => {
    const { m, el, setVolume } = box();
    m.unlock();
    m.play("harbour");
    const loud = el("harbour")?.volume ?? 0;
    setVolume(0.4);
    expect(el("harbour")?.volume).toBeCloseTo(loud / 2);
    m.setOn(false);
    expect(el("harbour")?.volume).toBe(0);
    expect(m.on).toBe(false);
  });

  it("plays the victory sting over a ducked theme, then brings the theme back", () => {
    const { m, el } = box();
    m.unlock();
    m.play("harbour");
    m.sting("victory");
    const sting = el("victory");
    expect(sting?.paused).toBe(false);
    expect(el("harbour")?.volume).toBe(0);
    sting?.onended?.();
    expect(el("harbour")?.volume).toBeGreaterThan(0);
  });
});
