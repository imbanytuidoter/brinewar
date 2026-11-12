import { describe, expect, it } from "vitest";
import { ISLANDS, PLACES, START, nearest, outOfIslands, patrolAt, PATROLS, steer, WORLD_H, WORLD_W, type Helm } from "./world";

describe("world", () => {
  it("starts in open water, with every place reachable from the sea", () => {
    expect(outOfIslands(START)).toEqual(START);
    for (const p of PLACES) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(WORLD_H);
      expect(outOfIslands(p)).toBe(p);
    }
  });

  it("sails to a target and stops there", () => {
    let h: Helm = { pos: { x: 100, y: 100 }, heading: 0, target: { x: 300, y: 100 } };
    for (let i = 0; i < 200 && h.target; i++) h = steer(h, 1 / 30);
    expect(h.target).toBeNull();
    expect(Math.hypot(h.pos.x - 300, h.pos.y - 100)).toBeLessThan(10);
  });

  it("turns before running at full speed and never enters an island", () => {
    const isle = ISLANDS[0]!;
    let h: Helm = { pos: { x: isle.x - isle.radius - 40, y: isle.y }, heading: 0, target: { x: isle.x + isle.radius + 60, y: isle.y } };
    for (let i = 0; i < 400 && h.target; i++) {
      h = steer(h, 1 / 30);
      expect(Math.hypot(h.pos.x - isle.x, h.pos.y - isle.y)).toBeGreaterThanOrEqual(isle.radius - 0.001);
    }
    expect(h.pos.x).toBeGreaterThan(0);
    expect(h.pos.x).toBeLessThan(WORLD_W);
  });

  it("finds the nearest thing within reach", () => {
    expect(nearest(PLACES, { x: PLACES[0]!.x + 10, y: PLACES[0]!.y }, (p) => p.reach)?.kind).toBe("port");
    expect(nearest(PLACES, { x: 20, y: 20 }, (p) => p.reach)).toBeNull();
  });

  it("moves patrols around their loops", () => {
    const a = patrolAt(PATROLS[0]!, 0).pos;
    const b = patrolAt(PATROLS[0]!, 3).pos;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(10);
  });
});
