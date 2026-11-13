import { describe, expect, it } from "vitest";
import { contrast, markColor, parseHex, tintFlag, tintHull, tintSail, type Pixels, type Rgb } from "./spriteTint";

function image(width: number, height: number, paint: (x: number, y: number) => readonly [number, number, number, number]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4);
  return { data, width, height };
}

const at = (px: Uint8ClampedArray, w: number, x: number, y: number) => Array.from(px.slice((y * w + x) * 4, (y * w + x) * 4 + 4));

const CREAM = [243, 229, 200, 255] as const;
const TRIM = [150, 90, 40, 255] as const;
const SLATE: Rgb = [0x3e, 0x55, 0x66];
const TEAL: Rgb = [0x7f, 0xe0, 0xd0];

describe("sprite tint", () => {
  const sail = image(4, 3, (x, y) => (y === 0 ? TRIM : x === 3 ? [0, 0, 0, 0] : CREAM));

  it("paints the cloth in the skin colour and keeps the yard and the transparent edge", () => {
    const out = tintSail(sail, null, SLATE, TEAL);
    expect(at(out, 4, 1, 1)).toEqual([...SLATE, 255]);
    expect(at(out, 4, 1, 0)).toEqual([...TRIM]);
    expect(at(out, 4, 3, 2)[3]).toBe(0);
  });

  it("stamps the emblem of the skin onto the new cloth in the mark colour", () => {
    const emblem = image(4, 3, (x, y) => (x === 1 && y === 1 ? [255, 255, 255, 255] : [112, 180, 76, 255]));
    const out = tintSail(sail, emblem, SLATE, TEAL);
    expect(at(out, 4, 1, 1)).toEqual([...TEAL, 255]);
    expect(at(out, 4, 2, 1)).toEqual([...SLATE, 255]);
  });

  it("swaps a mark that would vanish into the cloth for one that stands out", () => {
    const cream: Rgb = [255, 244, 216];
    const gold: Rgb = [255, 224, 138];
    const mark = markColor(cream, gold);
    expect(contrast(cream, mark)).toBeGreaterThanOrEqual(1.8);
    expect(markColor(SLATE, TEAL)).toEqual(TEAL);
  });

  it("recolours the planks of the hull but leaves the glass windows alone", () => {
    const hull = image(2, 1, (x) => (x === 0 ? [180, 123, 65, 255] : [160, 205, 215, 255]));
    const out = tintHull(hull, [0x8a, 0xa0, 0xad]);
    expect(at(out, 2, 0, 0)).toEqual([0x8a, 0xa0, 0xad, 255]);
    expect(at(out, 2, 1, 0)).toEqual([160, 205, 215, 255]);
  });

  it("tints the pennant and reads only plain hex colours", () => {
    const flag = image(1, 2, () => [243, 229, 200, 255]);
    expect(at(tintFlag(flag, TEAL), 1, 0, 1)).toEqual([...TEAL, 255]);
    expect(parseHex("#3e5566")).toEqual(SLATE);
    expect(parseHex("hsl(10 40% 50%)")).toBeNull();
  });
});
