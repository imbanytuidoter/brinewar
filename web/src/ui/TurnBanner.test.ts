import { describe, expect, it } from "vitest";
import { turnOf } from "./TurnBanner";

const base = { step: null, busy: null, aiming: null, incoming: null, rival: null, phase: "Playing" };

describe("turn banner", () => {
  it("says plainly whose shot it is", () => {
    expect(turnOf({ ...base, step: "fire" })).toMatchObject({ side: "you", title: "Your shot" });
    expect(turnOf({ ...base, step: "wait", aiming: 11 })).toMatchObject({ side: "you", title: "Your shot · B2" });
    expect(turnOf({ ...base, step: "thinking" })).toMatchObject({ side: "them", title: "The Nauarch is aiming" });
    expect(turnOf({ ...base, step: "answer", incoming: 0 })).toMatchObject({ side: "them", title: "The Nauarch fired · A1" });
    expect(turnOf({ ...base, step: "thinking", rival: "Ishmael" })).toMatchObject({ side: "them", title: "Ishmael is aiming" });
  });

  it("stays quiet when there is no battle step", () => {
    expect(turnOf({ ...base, step: "done" })).toBeNull();
    expect(turnOf({ ...base, step: "invite" })).toBeNull();
    expect(turnOf({ ...base, step: "wait", phase: "Placing" })).toMatchObject({ side: "none" });
  });
});
