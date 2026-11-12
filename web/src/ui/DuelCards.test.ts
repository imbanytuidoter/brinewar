import { describe, expect, it } from "vitest";
import { duelFromLocation, duelLink } from "./DuelCards";

describe("duel links", () => {
  it("round-trips the game number and ignores anything else", () => {
    const k = "ab".repeat(32);
    expect(duelLink("https://brinewar.imbanytui.xyz", 12, k)).toBe(`https://brinewar.imbanytui.xyz/?duel=12#k=${k}`);
    expect(duelFromLocation("?duel=12", `#k=${k}`)).toEqual({ gameId: 12, secret: k });
    expect(duelFromLocation("?duel=12", "")).toEqual({ gameId: 12, secret: "" });
    expect(duelFromLocation("?duel=12abc", "")).toBeNull();
    expect(duelFromLocation("?duel=-1", "")).toBeNull();
    expect(duelFromLocation("", "")).toBeNull();
  });
});
