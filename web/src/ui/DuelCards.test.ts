import { describe, expect, it } from "vitest";
import { duelFromLocation, duelLink, duelLinkShown } from "./DuelCards";

describe("duel links", () => {
  it("round-trips the game number and ignores anything else", () => {
    const k = "ab".repeat(32);
    const link = duelLink("https://example.org", 12, k);
    expect(link).toMatch(/^https:\/\/example\.org\/duel\/12#[A-Za-z0-9_-]{43}$/);
    const url = new URL(link);
    expect(duelFromLocation(url.search, url.hash, url.pathname)).toEqual({ gameId: 12, secret: k });
    expect(duelLinkShown("https://example.org", 12)).toBe("example.org/duel/12");
    expect(duelFromLocation("?duel=12", `#k=${k}`)).toEqual({ gameId: 12, secret: k });
    expect(duelFromLocation("", "", "/duel/7abc")).toBeNull();
    expect(duelFromLocation("?duel=12", "")).toEqual({ gameId: 12, secret: "" });
    expect(duelFromLocation("?duel=12abc", "")).toBeNull();
    expect(duelFromLocation("?duel=-1", "")).toBeNull();
    expect(duelFromLocation("", "")).toBeNull();
  });
});
