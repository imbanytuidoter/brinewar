import { describe, expect, it } from "vitest";
import { BOARD_ORIGIN, SIZE } from "./grid";
import { LAYOUTS } from "./layouts";

const MARGIN = 3;

describe("sailing scenery", () => {
  it("keeps every moving ship well clear of both boards, so it never looks like part of a fleet", () => {
    const top = Math.min(BOARD_ORIGIN.mine.z, BOARD_ORIGIN.enemy.z) - MARGIN;
    const bottom = Math.max(BOARD_ORIGIN.mine.z, BOARD_ORIGIN.enemy.z) + SIZE + MARGIN;
    for (const layout of LAYOUTS)
      for (const p of layout.props)
        if (p.motion && p.motion.kind !== "bob") expect(p.z <= top || p.z >= bottom, `${layout.name} ${p.model} at z ${p.z}`).toBe(true);
  });
});
