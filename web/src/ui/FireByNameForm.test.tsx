import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FireByName } from "./FireByName";

describe("fire by cell name", () => {
  it("says why a cell cannot be fired instead of silently ignoring the click", () => {
    const onFire = vi.fn();
    render(<FireByName disabled={false} onFire={onFire} refusal={(i) => (i === 12 ? "No ship can be at C2: it touches a sunk ship." : null)} />);
    const input = screen.getByLabelText("Target");
    fireEvent.change(input, { target: { value: "C2" } });
    expect(screen.getByRole("status").textContent).toContain("touches a sunk ship");
    expect(screen.getByRole("button", { name: "Fire" })).toHaveProperty("disabled", true);
    fireEvent.change(input, { target: { value: "K11" } });
    expect(screen.getByRole("status").textContent).toContain("A1 to J10");
    fireEvent.change(input, { target: { value: "D2" } });
    fireEvent.click(screen.getByRole("button", { name: "Fire" }));
    expect(onFire).toHaveBeenCalledWith(13);
  });
});
