import { describe, expect, it } from "vitest";
import { huntNote, shipName } from "./useBattleFeed";

describe("battle feed", () => {
  const heat = Array.from({ length: 100 }, (_, i) => (i < 20 ? 20 - i : 0));

  it("tags a shot into hot water as hunting from the map", () => {
    expect(huntNote(heat, 40, 0)).toBe("Hunting from the Admiralty map · A1 · 50% of fleets sat here");
    expect(huntNote(heat, 40, 18)).toBe("I2 · 5% of fleets sat here");
  });

  it("calls a shot into cold water a probe and stays quiet without a map", () => {
    expect(huntNote(heat, 40, 77)).toBe("H8 · a probe off his map");
    expect(huntNote(null, 40, 0)).toBeNull();
    expect(huntNote(heat, 0, 0)).toBeNull();
  });

  it("names ships by length", () => {
    expect(shipName(4)).toBe("Man-of-war");
    expect(shipName(1)).toBe("Sloop");
    expect(shipName(7)).toBe("Ship");
  });
});
