import { expect, test } from "@playwright/test";
import { fireUntilMiss } from "./fire";

test.skip(!process.env.E2E_BASE_URL, "set E2E_BASE_URL to a running Brinewar web app");

test("a fresh browser plays the Nauarch with no wallet and verifies the battle", async ({ page, context }) => {
  const popups: string[] = [];
  context.on("page", (p) => popups.push(p.url()));
  page.on("dialog", (d) => {
    popups.push(`dialog:${d.message()}`);
    void d.dismiss();
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Hide yours/ })).toBeVisible();
  await page.getByRole("button", { name: "Take command" }).click({ timeout: 120_000 });
  await expect(page.getByRole("img", { name: /Sea chart/ })).toBeVisible();
  await page.getByRole("button", { name: "Prepare for battle" }).click();
  await expect(page.getByRole("button", { name: "Show where he hunts" })).toBeVisible();
  await page.getByRole("button", { name: "Set sail against the Nauarch" }).click({ timeout: 60_000 });
  await expect(page.getByText(/Sink all 10 ships/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Your shot", { exact: true })).toBeVisible({ timeout: 90_000 });

  await fireUntilMiss(page);
  const nauarch = page.getByRole("region", { name: "The Nauarch" });
  await expect(nauarch.getByText("signed")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Your shot", { exact: true })).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Strike colours" }).click();
  await expect(page.getByText("The Nauarch prevails.")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("button", { name: "New battle" })).toBeEnabled({ timeout: 120_000 });

  await page.getByRole("link", { name: "Verify" }).last().click();
  await expect(page.getByRole("heading", { name: /proven/ })).toBeVisible();
  await expect(page.getByText("proof ✓").first()).toBeVisible({ timeout: 30_000 });

  expect(popups).toEqual([]);
});
