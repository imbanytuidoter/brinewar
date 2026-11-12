import { describe, expect, it } from "vitest";
import { resultLine } from "./ResultSplash";

describe("result splash", () => {
  it("names who won and how", () => {
    expect(resultLine("won", "FleetSunk", "The Nauarch")).toBe("You sank the Nauarch's fleet");
    expect(resultLine("won", "Timeout", "Ishmael")).toBe("Ishmael ran out of time");
    expect(resultLine("lost", "FleetSunk", "Ishmael")).toBe("Ishmael sank your fleet");
    expect(resultLine("lost", "Resigned", "The Nauarch")).toBe("You struck colours");
  });
});
