import { describe, expect, it } from "vitest";
import { buildLeaderboard, Snapshots } from "../src/lib/leaderboard.js";
import { FakeViewer } from "./fakes.js";

const ships: Record<string, object> = {
  "ship:1": { captain: "p-a.testnet", owner: "p-a.testnet", rank: "Lieutenant", class: "Sloop", xp: 140, wins: 1, losses: 2, sunk: 4 },
  "ship:2": { captain: "p-b.testnet", owner: "p-b.testnet", rank: "Captain", class: "Frigate", xp: 320, wins: 3, losses: 0, sunk: 12 },
  "ship:3": { captain: "p-c.testnet", owner: "p-c.testnet", rank: "Ensign", class: "Cutter", xp: 0, wins: 0, losses: 0, sunk: 0 },
};
const players: Record<string, object> = {
  "p-a.testnet": { display_name: "Anna", gold: "85", games_vs_nauarch: 3, wins: 1, losses: 2 },
  "p-b.testnet": { display_name: "Bo", gold: "160", games_vs_nauarch: 3, wins: 3, losses: 0 },
  "p-c.testnet": { display_name: "Captain c0de", gold: "100", games_vs_nauarch: 0, wins: 0, losses: 0 },
};

const viewer = () =>
  new FakeViewer((method, args) => {
    if (method === "config") return { players: 4 };
    if (method === "get_ship") return ships[String(args.token_id)] ?? null;
    if (method === "get_player") return players[String(args.account_id)] ?? null;
    throw new Error(method);
  });

describe("leaderboard", () => {
  it("ranks captains who have played by XP and sums the Nauarch's record", async () => {
    const board = await buildLeaderboard(viewer(), 10, 2);
    expect(board.captains.map((c) => c.name)).toEqual(["Bo", "Anna"]);
    expect(board.captains[0]).toMatchObject({ account: "p-b.testnet", rank: "Captain", xp: 320, wins: 3, losses: 0, sunk: 12, gold: "160" });
    expect(board.nauarch).toEqual({ wins: 2, losses: 4, battles: 6 });
    expect(board.total).toBe(3);
  });

  it("keeps the top entries only", async () => {
    const board = await buildLeaderboard(viewer(), 1, 2);
    expect(board.captains).toHaveLength(1);
  });

  it("serves the last snapshot while one refresh runs in the background", async () => {
    let calls = 0;
    let now = 0;
    const snaps = new Snapshots(async () => ++calls, 1000, () => now);
    expect(await snaps.get()).toBe(1);
    expect(await snaps.get()).toBe(1);
    now = 2000;
    expect(await snaps.get()).toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(await snaps.get()).toBe(2);
    expect(calls).toBe(2);
  });
});
