import { describe, expect, it } from "vitest";
import { parseCell } from "@/lib/utils";

describe("parseCell", () => {
  it("reads board coordinates like the contract cell names", () => {
    expect(parseCell("A1")).toBe(0);
    expect(parseCell("j10")).toBe(99);
    expect(parseCell(" b 7 ")).toBe(61);
    expect(parseCell("K1")).toBeNull();
    expect(parseCell("A11")).toBeNull();
    expect(parseCell("A0")).toBeNull();
  });
});
