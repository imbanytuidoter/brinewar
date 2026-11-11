import { describe, expect, it } from "vitest";
import { framesOf } from "@/pages/AdmiraltyPage";
import { niceMax } from "./LineChart";
import { HEAT_EMPTY, HEAT_RAMP, heatColor } from "./palette";

const heat = (v: number) => Array.from({ length: 100 }, () => v);

describe("chart helpers", () => {
  it("rounds the axis up to a readable maximum", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(870)).toBe(1000);
    expect(niceMax(1010)).toBe(2000);
    expect(niceMax(26)).toBe(50);
  });

  it("keeps empty cells off the ramp and clamps the hottest", () => {
    expect(heatColor(0)).toBe(HEAT_EMPTY);
    expect(heatColor(0.01)).toBe(HEAT_RAMP[0]);
    expect(heatColor(1)).toBe(HEAT_RAMP[HEAT_RAMP.length - 1]);
  });

  it("orders admiralty frames by day and lets the live view replace today", () => {
    const frames = framesOf({
      current: { heat: heat(2), boards_counted: 9, day: 3 },
      days: [
        { at: 2, block: 2, data: { heat: heat(1), boards_counted: 5, day: 3 } },
        { at: 1, block: 1, data: { heat: heat(0), boards_counted: 2, day: 1 } },
      ],
    });
    expect(frames.map((f) => [f.day, f.boards_counted])).toEqual([[1, 2], [3, 9]]);
  });
});
