import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LOCK_AFTER_LAND_MS, LOCK_MS, useLockOn } from "./useLockOn";

describe("useLockOn", () => {
  it("locks onto his first shot of a battle and every new one, but not onto shots already on the board", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ id, n, cell }) => useLockOn(id, n, cell, true), { initialProps: { id: 4 as number | null, n: null as number | null, cell: null as number | null } });
    expect(result.current).toBeNull();
    rerender({ id: 4, n: 1, cell: 37 });
    expect(result.current).toBe(37);
    act(() => vi.advanceTimersByTime(LOCK_MS + 10));
    expect(result.current).toBeNull();
    rerender({ id: 4, n: 3, cell: 12 });
    expect(result.current).toBe(12);
    vi.useRealTimers();
  });

  it("does not lock onto a battle reopened with shots already fired", () => {
    const { result, rerender } = renderHook(({ id, n, cell }) => useLockOn(id, n, cell, true), { initialProps: { id: 8 as number | null, n: 5 as number | null, cell: 9 as number | null } });
    rerender({ id: 8, n: 5, cell: 9 });
    expect(result.current).toBeNull();
  });

  it("keeps the spyglass on his target until his ball has landed", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ n, cell, air }) => useLockOn(4, n, cell, true, air), { initialProps: { n: null as number | null, cell: null as number | null, air: false } });
    rerender({ n: 1, cell: 37, air: false });
    rerender({ n: 1, cell: 37, air: true });
    act(() => vi.advanceTimersByTime(LOCK_MS * 3));
    expect(result.current).toBe(37);
    rerender({ n: 1, cell: 37, air: false });
    expect(result.current).toBe(37);
    act(() => vi.advanceTimersByTime(LOCK_AFTER_LAND_MS + 10));
    expect(result.current).toBeNull();
    vi.useRealTimers();
  });
});
