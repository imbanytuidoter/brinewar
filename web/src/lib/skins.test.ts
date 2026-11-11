import { describe, expect, it } from "vitest";
import { equippedSkin, equipSkin, ownedSkins, skinLook } from "./skins";
import { memoryStorage } from "./storage";

describe("skins", () => {
  it("has a look for known skins and a stable one for new names", () => {
    expect(skinLook("brine").title).toBe("Brine");
    expect(skinLook("sea-foam")).toEqual(skinLook("sea-foam"));
    expect(skinLook("sea-foam").title).toBe("sea foam");
  });

  it("only equips a skin the captain owns", () => {
    const store = memoryStorage();
    equipSkin(store, "a", "coral");
    expect(equippedSkin(store, "a", ["brine", "coral"])).toBe("coral");
    expect(equippedSkin(store, "a", ["brine"])).toBeNull();
    expect(equippedSkin(store, "b", ["coral"])).toBeNull();
    equipSkin(store, "a", null);
    expect(equippedSkin(store, "a", ["coral"])).toBeNull();
  });
});

describe("owned skins", () => {
  it("asks for balances in batches the contract accepts and drops duplicates", async () => {
    const names = Array.from({ length: 20 }, (_, i) => `s${i}`);
    const batches: number[] = [];
    const viewer = {
      async view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
        if (method === "skins") return [...names, "s0"] as T;
        const ids = args.token_ids as string[];
        batches.push(ids.length);
        return ids.map((id) => (id === "skin:s3" || id === "skin:s18" ? "1" : "0")) as T;
      },
    };
    const r = await ownedSkins(viewer, "a");
    expect(batches).toEqual([16, 4]);
    expect(r.all).toHaveLength(20);
    expect(r.owned).toEqual(["s3", "s18"]);
  });
});
