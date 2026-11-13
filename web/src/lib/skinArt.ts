import { useEffect, useState } from "react";
import type { SkinLook } from "./skins";
import { markColor, parseHex, tintFlag, tintHull, tintSail, type Pixels, type Rgb } from "./spriteTint";

export interface SkinArt {
  readonly sail: string;
  readonly sailDamaged: string;
  readonly flag: string;
  readonly hull: string;
  readonly hullDamaged: string;
}

const PLAIN_SAIL = 1;
const cache = new Map<string, Promise<SkinArt | null>>();

function load(name: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`sprite ${name} did not load`));
    im.src = `/sprites/${name}.png`;
  });
}

function pixels(im: HTMLImageElement): Pixels {
  const c = document.createElement("canvas");
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas");
  ctx.drawImage(im, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

function toUrl(base: Pixels, data: Uint8ClampedArray): string {
  const c = document.createElement("canvas");
  c.width = base.width;
  c.height = base.height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(data), base.width, base.height), 0, 0);
  return c.toDataURL("image/png");
}

async function paint(look: SkinLook, sail: Rgb, flag: Rgb, hull: Rgb | null): Promise<SkinArt> {
  const emblem = look.sprite === PLAIN_SAIL ? null : look.sprite;
  const names = ["sail-1", "sail-1-dmg", "flag-1", "hull", "hull-dmg", ...(emblem ? [`sail-${emblem}`, `sail-${emblem}-dmg`] : [])];
  const imgs = await Promise.all(names.map(load));
  const [cloth, torn, pennant, planks, broken, mark, markTorn] = imgs.map(pixels) as [Pixels, Pixels, Pixels, Pixels, Pixels, Pixels?, Pixels?];
  const ink = markColor(sail, flag);
  return {
    sail: toUrl(cloth, tintSail(cloth, mark ?? null, sail, ink)),
    sailDamaged: toUrl(torn, tintSail(torn, markTorn ?? null, sail, ink)),
    flag: toUrl(pennant, tintFlag(pennant, flag)),
    hull: hull ? toUrl(planks, tintHull(planks, hull)) : "/sprites/hull.png",
    hullDamaged: hull ? toUrl(broken, tintHull(broken, hull)) : "/sprites/hull-dmg.png",
  };
}

export function skinArt(look: SkinLook): Promise<SkinArt | null> {
  const sail = parseHex(look.sail);
  const flag = parseHex(look.flag);
  if (!sail || !flag) return Promise.resolve(null);
  const hull = look.hull ? parseHex(look.hull) : null;
  const key = `${look.sail}|${look.flag}|${look.hull ?? ""}|${look.sprite}`;
  const known = cache.get(key);
  if (known) return known;
  const made = paint(look, sail, flag, hull).catch(() => null);
  cache.set(key, made);
  return made;
}

export function useSkinArt(look: SkinLook | null | undefined): SkinArt | null {
  const [art, setArt] = useState<{ readonly look: SkinLook; readonly art: SkinArt | null } | null>(null);
  useEffect(() => {
    if (!look) return;
    let alive = true;
    void skinArt(look).then((a) => {
      if (alive) setArt({ look, art: a });
    });
    return () => {
      alive = false;
    };
  }, [look]);
  return look && art?.look === look ? art.art : null;
}
