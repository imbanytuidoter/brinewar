import { describe, expect, it } from "vitest";
import { duelFromSearch, duelLink } from "./DuelCards";

describe("duel links", () => {
  it("round-trips the game number and ignores anything else", () => {
    expect(duelLink("https://brinewar.imbanytui.xyz", 12)).toBe("https://brinewar.imbanytui.xyz/?duel=12");
    expect(duelFromSearch("?duel=12")).toBe(12);
    expect(duelFromSearch("?duel=12abc")).toBeNull();
    expect(duelFromSearch("?duel=-1")).toBeNull();
    expect(duelFromSearch("")).toBeNull();
  });
});
