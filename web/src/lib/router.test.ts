import { describe, expect, it } from "vitest";
import { pageKey, routeOf } from "./router";

const here = { origin: "https://brinewar.example", pathname: "/fleet", search: "" };
const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
const link = (href: string, target = "", download = false) => ({ href, target, download });

describe("router", () => {
  it("keeps in-site page links inside the app so music keeps playing", () => {
    expect(routeOf(link("https://brinewar.example/captains"), click, here)).toBe("/captains");
    expect(routeOf(link("/verify/12"), click, here)).toBe("/verify/12");
    expect(routeOf(link("/?duel=4#s"), click, here)).toBe("/?duel=4#s");
  });

  it("leaves other sites, new tabs, downloads and modified clicks to the browser", () => {
    expect(routeOf(link("https://testnet.nearblocks.io/txns/x"), click, here)).toBeNull();
    expect(routeOf(link("/captains", "_blank"), click, here)).toBeNull();
    expect(routeOf(link("/music/CREDITS.txt"), click, here)).toBeNull();
    expect(routeOf(link("/captains", "", true), click, here)).toBeNull();
    expect(routeOf(link("/captains"), { ...click, metaKey: true }, here)).toBeNull();
    expect(routeOf(link("/captains"), { ...click, button: 1 }, here)).toBeNull();
    expect(routeOf(link("/captains"), { ...click, defaultPrevented: true }, here)).toBeNull();
  });

  it("lets the browser jump to an anchor on the same page", () => {
    expect(routeOf(link("/fleet#skins"), click, here)).toBeNull();
  });

  it("keys pages by what they show, so a new duel invite opens fresh but plain play stays mounted", () => {
    expect(pageKey("/duel/12")).not.toBe(pageKey("/duel/13"));
    expect(pageKey("/?duel=4")).not.toBe(pageKey("/"));
    expect(pageKey("/")).toBe("play");
    expect(pageKey("/?from=x")).toBe("play");
    expect(pageKey("/fleet")).toBe("fleet");
    expect(pageKey("/verify/12")).toBe("verify/12");
    expect(pageKey("/replay/3")).toBe("replay/3");
  });
});
