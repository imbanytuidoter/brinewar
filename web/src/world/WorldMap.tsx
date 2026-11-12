import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CaptainEntry } from "@/lib/api";
import { sound } from "@/lib/sound";
import type { RankedCaptain } from "./useMapCaptains";
import { CAPTAIN_SLOTS, DECOR, ENCOUNTER, ISLANDS, nearest, PATROLS, PLACES, patrolAt, START, steer, WORLD_H, WORLD_W, type Helm, type Place, type Vec } from "./world";

const SPRITES = ["hull", "hull-wreck", "flag-2", "sail-2", "sail-1", "sail-3", "sail-4", "sail-5", "sail-6", "sail-wreck", "flag-1", "flag-3", "flag-4", "flag-5", "flag-6"] as const;
const MAP_SPRITES = ["water", "isle-green", "isle-sand", "palm-a", "palm-b", "palm-c", "rock-a", "rock-b", "rock-d", "rock-e", "tower", "tower-b", "wall-h", "dock-h"] as const;
const WATER_TILE = 110;
const SHIP_LEN = 62;
const SHIP_W = 29;
const WAKE_LIFE = 1.6;
const MAX_WAKE = 90;
const POS_KEY = "brinewar.chart.pos";

export type Encounter =
  | { readonly kind: "patrol"; readonly id: number }
  | { readonly kind: "captain"; readonly captain: CaptainEntry; readonly rank: number | null }
  | { readonly kind: "place"; readonly place: Place };

interface WorldMapProps {
  readonly captains: readonly RankedCaptain[];
  readonly mySail: number;
  readonly myFlag: number;
  readonly reducedMotion: boolean;
  readonly paused: boolean;
  readonly onEncounter: (e: Encounter | null) => void;
}

interface Wake {
  x: number;
  y: number;
  age: number;
}

type Images = Record<string, HTMLImageElement>;

function loadImages(): Images {
  const out: Images = {};
  for (const s of SPRITES) {
    const im = new Image();
    im.src = `/sprites/${s}.png`;
    out[s] = im;
  }
  for (const s of MAP_SPRITES) {
    const im = new Image();
    im.src = `/sprites/map/${s}.png`;
    out[s] = im;
  }
  return out;
}

function savedStart(): Vec {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(POS_KEY) ?? "null") as Vec | null;
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : START;
  } catch {
    return START;
  }
}

function savePos(v: Vec): void {
  try {
    window.sessionStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(v.x), y: Math.round(v.y) }));
  } catch {
    return;
  }
}

function sailOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const choices = [1, 3, 4, 5, 6];
  return choices[h % choices.length] as number;
}

function drawSprite(c: CanvasRenderingContext2D, im: HTMLImageElement | undefined, x: number, y: number, w: number, h: number): void {
  if (!im || !im.complete || im.naturalWidth === 0) return;
  c.drawImage(im, x - w / 2, y - h / 2, w, h);
}

function drawShip(c: CanvasRenderingContext2D, img: Images, at: Vec, heading: number, sail: number, flag: number, wreck = false): void {
  c.save();
  c.translate(at.x, at.y);
  c.rotate(heading - Math.PI / 2);
  c.shadowColor = "rgba(10,40,60,0.35)";
  c.shadowBlur = 8;
  c.shadowOffsetY = 4;
  drawSprite(c, wreck ? img["hull-wreck"] : img.hull, 0, 0, SHIP_W, SHIP_LEN);
  c.shadowColor = "transparent";
  const sailImg = wreck ? img["sail-wreck"] : img[`sail-${sail}`];
  drawSprite(c, sailImg, 0, -9, 40, 28);
  drawSprite(c, sailImg, 0, 12, 34, 24);
  if (!wreck) drawSprite(c, img[`flag-${flag}`], 0, -26, 4, 13);
  c.restore();
}

function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, tone: "place" | "enemy" | "captain" | "bot"): void {
  c.font = tone === "place" ? "700 15px Boska, Georgia, serif" : "600 12px Satoshi, system-ui, sans-serif";
  const w = c.measureText(text).width + 14;
  c.fillStyle = tone === "enemy" ? "rgba(122,31,61,0.9)" : "rgba(9,24,33,0.78)";
  c.beginPath();
  c.roundRect(x - w / 2, y - 11, w, 22, 11);
  c.fill();
  c.fillStyle = tone === "place" ? "#ffcf5a" : tone === "bot" ? "#a9bcc6" : "#f4f7f8";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, x, y + 1);
}

export function WorldMap({ captains, mySail, myFlag, reducedMotion, paused, onEncounter }: WorldMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const img = useMemo(loadImages, []);
  const helm = useRef<Helm>({ pos: savedStart(), heading: -Math.PI / 2, target: null });
  const wake = useRef<Wake[]>([]);
  const view = useRef({ scale: 1, cx: 0, cy: 0, w: 0, h: 0 });
  const met = useRef<string | null>(null);
  const pausedRef = useRef(paused);
  const encounterRef = useRef(onEncounter);
  const [hint, setHint] = useState(true);
  const fleet = useMemo(() => captains.slice(0, CAPTAIN_SLOTS.length).map((c, i) => ({ ...c, slot: i + 1, ...(CAPTAIN_SLOTS[i] as Vec) })), [captains]);
  const fleetRef = useRef(fleet);

  useEffect(() => {
    pausedRef.current = paused;
    encounterRef.current = onEncounter;
    fleetRef.current = fleet;
  });

  const toWorld = useCallback((sx: number, sy: number): Vec => {
    const v = view.current;
    return { x: v.cx + (sx - v.w / 2) / v.scale, y: v.cy + (sy - v.h / 2) / v.scale };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    let t = 0;
    const resize = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      view.current = { ...view.current, w, h, scale: Math.max(w / WORLD_W, h / WORLD_H, Math.min(1.35, Math.max(0.5, Math.min(w / 1150, h / 760)))) };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const check = (pos: Vec): void => {
      const patrol = PATROLS.map((p) => ({ id: p.id, ...patrolAt(p, t).pos })).find((p) => Math.hypot(p.x - pos.x, p.y - pos.y) < ENCOUNTER);
      const captain = nearest(fleetRef.current, pos, () => 70);
      const place = nearest(PLACES, pos, (p) => p.reach);
      const key = patrol ? `patrol:${patrol.id}` : captain ? `captain:${captain.captain.account}` : place ? `place:${place.kind}` : null;
      if (key === met.current) return;
      met.current = key;
      if (patrol) encounterRef.current({ kind: "patrol", id: patrol.id });
      else if (captain) encounterRef.current({ kind: "captain", captain: captain.captain, rank: captain.rank });
      else if (place) encounterRef.current({ kind: "place", place });
      else encounterRef.current(null);
    };

    const frame = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!pausedRef.current) {
        t += dt;
        const before = helm.current.pos;
        helm.current = steer(helm.current, dt);
        const moved = Math.hypot(helm.current.pos.x - before.x, helm.current.pos.y - before.y);
        if (moved > 0.5) {
          const back = { x: helm.current.pos.x - Math.cos(helm.current.heading) * 26, y: helm.current.pos.y - Math.sin(helm.current.heading) * 26 };
          wake.current.push({ ...back, age: 0 });
          if (wake.current.length > MAX_WAKE) wake.current.shift();
          savePos(helm.current.pos);
        }
        check(helm.current.pos);
      }
      for (const wv of wake.current) wv.age += dt;
      wake.current = wake.current.filter((wv) => wv.age < WAKE_LIFE);

      const v = view.current;
      const halfW = v.w / 2 / v.scale;
      const halfH = v.h / 2 / v.scale;
      const cx = Math.min(WORLD_W - halfW, Math.max(halfW, helm.current.pos.x));
      const cy = Math.min(WORLD_H - halfH, Math.max(halfH, helm.current.pos.y));
      view.current = { ...v, cx: halfW * 2 >= WORLD_W ? WORLD_W / 2 : cx, cy: halfH * 2 >= WORLD_H ? WORLD_H / 2 : cy };

      ctx.save();
      ctx.fillStyle = "#5ec4ec";
      ctx.fillRect(0, 0, v.w, v.h);
      ctx.translate(v.w / 2, v.h / 2);
      ctx.scale(v.scale, v.scale);
      ctx.translate(-view.current.cx, -view.current.cy);
      const water = img.water;
      if (water && water.complete && water.naturalWidth > 0) {
        const drift = reducedMotion ? 0 : (t * 6) % WATER_TILE;
        for (let x = -WATER_TILE; x < WORLD_W + WATER_TILE; x += WATER_TILE)
          for (let y = -WATER_TILE; y < WORLD_H + WATER_TILE; y += WATER_TILE) ctx.drawImage(water, x + drift, y + drift * 0.5, WATER_TILE + 1, WATER_TILE + 1);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, WORLD_W, WORLD_H);
      for (const i of ISLANDS) drawSprite(ctx, img[i.sprite], i.x, i.y, i.size, i.size);
      for (const d of DECOR) drawSprite(ctx, img[d.sprite], d.x, d.y, d.size, d.size * ((img[d.sprite]?.naturalHeight || 1) / (img[d.sprite]?.naturalWidth || 1)));
      for (const wv of wake.current) {
        const k = 1 - wv.age / WAKE_LIFE;
        ctx.fillStyle = `rgba(255,255,255,${0.55 * k})`;
        ctx.beginPath();
        ctx.arc(wv.x, wv.y, 3 + (1 - k) * 9, 0, Math.PI * 2);
        ctx.fill();
      }
      const wreck = PLACES.find((p) => p.kind === "wreck");
      if (wreck) drawShip(ctx, img, { x: wreck.x + 20, y: wreck.y + 30 }, 0.7, 2, 2, true);
      for (const f of fleetRef.current) drawShip(ctx, img, f, -0.4 + f.slot * 0.9, sailOf(f.captain.name), 5);
      const patrols = PATROLS.map((p) => patrolAt(p, t));
      for (const p of patrols) drawShip(ctx, img, p.pos, p.heading, 2, 2);
      if (helm.current.target) {
        ctx.strokeStyle = "rgba(255,207,90,0.9)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(helm.current.target.x, helm.current.target.y, 10 + Math.sin(t * 6) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      drawShip(ctx, img, helm.current.pos, helm.current.heading, mySail, myFlag);
      ctx.restore();

      const screen = (p: Vec): Vec => ({ x: (p.x - view.current.cx) * v.scale + v.w / 2, y: (p.y - view.current.cy) * v.scale + v.h / 2 });
      for (const p of PLACES) {
        const s = screen(p);
        label(ctx, p.name, s.x, s.y - 40 * v.scale, "place");
      }
      for (const p of patrols) {
        const s = screen(p.pos);
        label(ctx, "Nauarch's patrol", s.x, s.y - 46 * v.scale, "enemy");
      }
      for (const f of fleetRef.current) {
        const s = screen(f);
        label(ctx, f.rank === null ? `${f.captain.name} · bot` : `#${f.rank} ${f.captain.name}`, s.x, s.y - 44 * v.scale, f.rank === null ? "bot" : "captain");
      }
      const me = screen(helm.current.pos);
      label(ctx, "You", me.x, me.y - 44 * v.scale, "place");
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [img, mySail, myFlag, reducedMotion]);

  const sail = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (pausedRef.current) return;
      const r = e.currentTarget.getBoundingClientRect();
      const target = toWorld(e.clientX - r.left, e.clientY - r.top);
      helm.current = { ...helm.current, target };
      met.current = null;
      setHint(false);
      sound.unlock();
    },
    [toWorld],
  );

  return (
    <div className="fixed inset-0 z-[4]">
      <canvas ref={canvasRef} onPointerDown={sail} className="block size-full cursor-crosshair touch-none" aria-label="Sea chart. Tap the water to set a course; sail to a place, a captain or a Nauarch patrol." role="img" />
      {hint && (
        <p className="pointer-events-none absolute top-[calc(84px+env(safe-area-inset-top))] left-1/2 m-0 -translate-x-1/2 rounded-full border border-line bg-glass px-3.5 py-1.5 text-xs whitespace-nowrap backdrop-blur-md max-sm:top-[calc(118px+env(safe-area-inset-top))]">
          Tap the water to set a course
        </p>
      )}
    </div>
  );
}
