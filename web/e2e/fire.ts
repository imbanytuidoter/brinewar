import { expect, type Page } from "@playwright/test";

const CELLS = ["E5", "A10", "J1", "C7", "H3", "F9", "B4", "I8", "D2", "G6", "A1", "J10"];

export async function fireUntilMiss(page: Page, cells: readonly string[] = CELLS): Promise<string> {
  const callout = page.locator('[aria-live="assertive"]');
  for (const cell of cells) {
    await expect(page.getByText("Your turn")).toBeVisible({ timeout: 180_000 });
    await page.getByLabel("Target").fill(cell);
    await page.getByRole("button", { name: "Fire", exact: true }).click();
    const result = new RegExp(`^(Miss|Hit|Sunk)[\\s\\S]*\\b${cell}\\b`, "i");
    let seen = "";
    await expect
      .poll(async () => {
        seen = await callout.innerText();
        return result.test(seen);
      }, { timeout: 120_000, intervals: [100] })
      .toBe(true);
    if (/^miss/i.test(seen)) return cell;
  }
  throw new Error("every shot hit: no miss to pass the turn");
}
