import { describe, expect, it, vi } from "vitest";
import { asAdmiralty, fetchAdmiralty, fetchTreasury } from "./api";

const heat = Array.from({ length: 100 }, (_, i) => i % 3);
const res = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("harbour history", () => {
  it("keeps only well-formed admiralty days", async () => {
    const h = await fetchAdmiralty("", res({ current: { heat, boards_counted: 4, day: 2 }, days: [{ at: 1, block: 5, data: { heat, boards_counted: 3, day: 1 } }, { at: 2, block: 6, data: { heat: [1], boards_counted: 1, day: 2 } }, "junk"] }));
    expect(h.current?.boards_counted).toBe(4);
    expect(h.days.map((d) => d.data.day)).toEqual([1]);
    expect(asAdmiralty({ heat: heat.map(() => -1), boards_counted: 1, day: 1 })).toBeNull();
  });

  it("keeps only numeric treasury samples", async () => {
    const t = await fetchTreasury("", res({ current: { account: "a", balance: "900", entry: "10", bounty: "25", threshold: "500" }, history: [{ at: 1, block: 1, data: { balance: "1000", entry: "10", bounty: "25" } }, { at: 2, block: 2, data: { balance: "1e9", entry: "1", bounty: "1" } }] }));
    expect(t.current?.balance).toBe("900");
    expect(t.history).toHaveLength(1);
  });

  it("fails loudly on a bad status", async () => {
    await expect(fetchTreasury("", res({}, 500))).rejects.toThrow(/500/);
  });
});
