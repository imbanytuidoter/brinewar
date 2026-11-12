const MUTE_KEY = "brinewar.muted";
const MASTER = 0.55;

type Listener = (muted: boolean) => void;

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    return;
  }
}

class SoundBoard {
  #ctx: AudioContext | null = null;
  #master: GainNode | null = null;
  #noise: AudioBuffer | null = null;
  #muted = typeof window === "undefined" ? true : readMuted();
  readonly #listeners = new Set<Listener>();

  get muted(): boolean {
    return this.#muted;
  }

  subscribe(fn: Listener): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  setMuted(muted: boolean): void {
    this.#muted = muted;
    persistMuted(muted);
    if (!muted) this.unlock();
    this.#listeners.forEach((fn) => fn(muted));
  }

  unlock(): void {
    if (this.#muted || typeof window === "undefined" || typeof window.AudioContext !== "function") return;
    if (!this.#ctx) {
      this.#ctx = new AudioContext();
      this.#master = this.#ctx.createGain();
      this.#master.gain.value = MASTER;
      this.#master.connect(this.#ctx.destination);
      const len = this.#ctx.sampleRate;
      this.#noise = this.#ctx.createBuffer(1, len, this.#ctx.sampleRate);
      const data = this.#noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.#ctx.state === "suspended") void this.#ctx.resume().catch(() => undefined);
  }

  #ready(): { ctx: AudioContext; out: GainNode; noise: AudioBuffer } | null {
    if (this.#muted) return null;
    this.unlock();
    if (!this.#ctx || !this.#master || !this.#noise || this.#ctx.state !== "running") return null;
    return { ctx: this.#ctx, out: this.#master, noise: this.#noise };
  }

  #burst(at: number, seconds: number, gain: number, filter: BiquadFilterType, from: number, to: number): void {
    const r = this.#ready();
    if (!r) return;
    const src = r.ctx.createBufferSource();
    src.buffer = r.noise;
    src.loop = true;
    const f = r.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(from, at);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + seconds);
    const g = r.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    src.connect(f).connect(g).connect(r.out);
    src.start(at, Math.random() * 0.5);
    src.stop(at + seconds + 0.05);
  }

  #tone(at: number, seconds: number, gain: number, type: OscillatorType, from: number, to: number): void {
    const r = this.#ready();
    if (!r) return;
    const o = r.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + seconds);
    const g = r.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    o.connect(g).connect(r.out);
    o.start(at);
    o.stop(at + seconds + 0.05);
  }

  #now(): number | null {
    const r = this.#ready();
    return r ? r.ctx.currentTime : null;
  }

  cannon(): void {
    const t = this.#now();
    if (t === null) return;
    this.#tone(t, 0.35, 0.9, "sine", 110, 38);
    this.#burst(t, 0.28, 0.7, "lowpass", 2200, 300);
  }

  incoming(): void {
    const t = this.#now();
    if (t === null) return;
    this.#tone(t, 0.9, 0.08, "sine", 1500, 420);
  }

  splash(): void {
    const t = this.#now();
    if (t === null) return;
    this.#burst(t, 0.7, 0.45, "bandpass", 1400, 260);
  }

  hit(): void {
    const t = this.#now();
    if (t === null) return;
    this.#tone(t, 0.6, 0.8, "sine", 75, 32);
    this.#burst(t, 0.9, 0.9, "lowpass", 1800, 120);
  }

  sunk(): void {
    const t = this.#now();
    if (t === null) return;
    this.hit();
    this.#burst(t + 0.25, 1.6, 0.6, "lowpass", 500, 60);
    this.#tone(t + 0.3, 1.4, 0.12, "sawtooth", 72, 38);
  }

  #notes(notes: readonly number[], step: number, type: OscillatorType, gain: number): void {
    const t = this.#now();
    if (t === null) return;
    notes.forEach((hz, i) => this.#tone(t + i * step, step * 2.2, gain, type, hz, hz * 0.995));
  }

  victory(): void {
    this.#notes([523.25, 659.25, 783.99, 1046.5], 0.14, "triangle", 0.35);
  }

  defeat(): void {
    this.#notes([392, 349.23, 311.13, 261.63], 0.22, "triangle", 0.28);
  }
}

export const sound = new SoundBoard();
