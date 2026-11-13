import { describe, expect, it } from "vitest";
import { rpcUrls } from "../src/lib/config.js";

describe("rpc list", () => {
  it("keeps the configured providers first and adds public testnet spares after them", () => {
    const list = rpcUrls({ NEAR_RPC_URL: "https://a.example,https://rpc.testnet.near.org", GAME_CONTRACT: "brinewar.testnet" }).split(",");
    expect(list[0]).toBe("https://a.example");
    expect(list).toContain("https://test.rpc.fastnear.com");
    expect(list.filter((u) => u === "https://rpc.testnet.near.org")).toHaveLength(1);
  });

  it("adds no testnet spares outside testnet", () => {
    expect(rpcUrls({ NEAR_RPC_URL: "https://a.example", GAME_CONTRACT: "game.near" })).toBe("https://a.example");
  });
});
