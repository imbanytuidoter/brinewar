import { describe, expect, it } from "vitest";
import { buildLeaderboard, freshCaptain, LiveLeaderboard } from "../src/lib/leaderboard.js";
import { FakeViewer } from "./fakes.js";

const ships: Record<string, object> = {
  "ship:1": { captain: "p-a.testnet", owner: "p-a.testnet", rank: "Lieutenant", class: "Sloop", xp: 140, wins: 1, losses: 2, sunk: 4 },
  "ship:2": { captain: "p-b.testnet", owner: "p-b.testnet", rank: "Captain", class: "Frigate", xp: 320, wins: 3, losses: 0, sunk: 12 },
  "ship:3": { captain: "p-c.testnet", owner: "p-c.testnet", rank: "Ensign", class: "Cutter", xp: 0, wins: 0, losses: 0, sunk: 0 },
};
const players: Record<string, object> = {
  "p-a.testnet": { display_name: "Anna", gold: "85", games_vs_nauarch: 3, wins: 1, losses: 2 },
  "p-b.testnet": { display_name: "Bo", gold: "160", games_vs_nauarch: 3, wins: 3, losses: 0 },
  "p-c.testnet": { display_name: "Seed_07", gold: "100", games_vs_nauarch: 0, wins: 0, losses: 0 },
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
    expect(board.captains.every((c) => !c.seed)).toBe(true);
  });

  it("marks seeded test captains", async () => {
    const seeded: Record<string, object> = { ...ships, "ship:3": { ...ships["ship:3"], xp: 500, wins: 1 } };
    const v = new FakeViewer((method, args) => {
      if (method === "config") return { players: 3 };
      if (method === "get_ship") return seeded[String(args.token_id)] ?? null;
      if (method === "get_player") return players[String(args.account_id)] ?? null;
      throw new Error(method);
    });
    const board = await buildLeaderboard(v, 10, 2);
    expect(board.captains.find((c) => c.name === "Seed_07")?.seed).toBe(true);
    const top1 = await buildLeaderboard(v, 1, 2);
    expect(top1.captains.map((c) => c.name)).toEqual(["Seed_07", "Bo", "Anna"]);
  });

  it("keeps every live captain however short the seed list is", async () => {
    const board = await buildLeaderboard(viewer(), 0, 2);
    expect(board.captains.map((c) => c.name)).toEqual(["Bo", "Anna"]);
  });

});

describe("live leaderboard", () => {
  function chain() {
    const state = {
      games: 3,
      game: { 0: { a: "p-a.testnet", b: "admiral.testnet", status: "Finished" }, 1: { a: "p-a.testnet", b: "admiral.testnet", status: "Playing" }, 2: { a: "p-b.testnet", b: "admiral.testnet", status: "Placing" } } as Record<number, object>,
      player: { ...players } as Record<string, object>,
      ship: { ...ships } as Record<string, object>,
      calls: [] as string[],
    };
    const v = new FakeViewer((method, args) => {
      state.calls.push(method);
      if (method === "config") return { players: 3, games: state.games };
      if (method === "get_game") return state.game[Number(args.game_id)] ?? null;
      if (method === "get_ship") return state.ship[String(args.token_id)] ?? null;
      if (method === "get_player") {
        const p = state.player[String(args.account_id)];
        if (!p) return null;
        const flagship = Object.entries(state.ship).find(([, s]) => (s as { captain: string }).captain === args.account_id)?.[0];
        return { ...p, flagship };
      }
      throw new Error(method);
    });
    return { state, v };
  }

  it("updates both captains of a battle the moment it finishes, without a full rebuild", async () => {
    const { state, v } = chain();
    const live = new LiveLeaderboard(v, 10, 2);
    expect((await live.get()).captains.map((c) => c.name)).toEqual(["Bo", "Anna"]);
    expect(await live.tick()).toEqual([]);
    state.game[1] = { a: "p-a.testnet", b: "admiral.testnet", status: "Finished" };
    state.player["p-a.testnet"] = { ...players["p-a.testnet"], wins: 2 };
    state.ship["ship:1"] = { ...ships["ship:1"], xp: 900, sunk: 20 };
    state.calls.length = 0;
    expect(await live.tick()).toEqual(["p-a.testnet"]);
    expect(state.calls.filter((c) => c === "get_ship")).toHaveLength(1);
    const board = await live.get();
    expect(board.captains.map((c) => c.name)).toEqual(["Anna", "Bo"]);
    expect(board.captains[0]).toMatchObject({ wins: 2, xp: 900, sunk: 20 });
    expect(board.nauarch).toEqual({ wins: 2, losses: 5, battles: 7 });
  });

  it("watches battles that start after the first load", async () => {
    const { state, v } = chain();
    const live = new LiveLeaderboard(v, 10, 2);
    await live.get();
    state.games = 4;
    state.game[3] = { a: "p-b.testnet", b: "admiral.testnet", status: "Finished" };
    state.player["p-b.testnet"] = { ...players["p-b.testnet"], wins: 4 };
    expect(await live.tick()).toEqual(["p-b.testnet"]);
    expect((await live.get()).captains[0]).toMatchObject({ name: "Bo", wins: 4 });
    expect(await live.tick()).toEqual([]);
  });

  it("does nothing before the first load", async () => {
    const { v } = chain();
    expect(await new LiveLeaderboard(v, 10, 2).tick()).toEqual([]);
  });
});

describe("fresh captain row", () => {
  it("replaces a stale snapshot row with the captain's current record and re-ranks", async () => {
    const board = await buildLeaderboard(viewer(), 10, 2);
    const live = new FakeViewer((method, args) => {
      if (method === "get_player") return { ...players["p-a.testnet"], wins: 2, losses: 2, flagship: "ship:1" };
      if (method === "get_ship") return { ...ships[String(args.token_id)], xp: 500, sunk: 14 };
      throw new Error(method);
    });
    const fresh = await freshCaptain(live, "p-a.testnet");
    expect(fresh).toMatchObject({ account: "p-a.testnet", wins: 2, xp: 500, sunk: 14 });
    expect(board.captains.map((c) => c.name)).toEqual(["Bo", "Anna"]);
  });

  it("ignores a ship that belongs to someone else", async () => {
    const live = new FakeViewer((method, args) => {
      if (method === "get_player") return { ...players["p-a.testnet"], flagship: "ship:2" };
      if (method === "get_ship") return ships[String(args.token_id)] ?? null;
      throw new Error(method);
    });
    expect(await freshCaptain(live, "p-a.testnet")).toBeNull();
  });
});
