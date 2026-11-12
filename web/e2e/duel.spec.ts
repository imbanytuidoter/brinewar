import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { fireUntilMiss } from "./fire";

test.skip(!process.env.E2E_BASE_URL, "set E2E_BASE_URL to a running Brinewar web app");

function watchPopups(context: BrowserContext, page: Page, sink: string[]): void {
  context.on("page", (p) => sink.push(p.url()));
  page.on("dialog", (d) => {
    sink.push(`dialog:${d.message()}`);
    void d.dismiss();
  });
}

test("two captains duel through an invite link with no wallet", async ({ browser, baseURL }) => {
  test.setTimeout(360_000);
  const popups: string[] = [];
  const hostCtx = await browser.newContext({ baseURL });
  const guestCtx = await browser.newContext({ baseURL });
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  watchPopups(hostCtx, host, popups);
  watchPopups(guestCtx, guest, popups);

  await host.goto("/");
  await host.getByRole("button", { name: "Take command" }).click({ timeout: 90_000 });
  await host.getByRole("button", { name: "Invite a friend" }).click();
  await host.getByRole("button", { name: "Challenge a friend" }).click({ timeout: 90_000 });
  await expect(host.getByText("Waiting for your friend", { exact: true })).toBeVisible({ timeout: 90_000 });
  const link = (await host.locator("[data-invite]").first().getAttribute("data-invite")) ?? "";
  expect(link).toMatch(/\/duel\/\d+#[A-Za-z0-9_-]{43}$/);

  await guest.goto(link.replace(/#.*$/, "").replace(/^https?:\/\/[^/]+/, ""));
  await expect(guest.getByText(/challenges you/)).toBeVisible({ timeout: 90_000 });
  await guest.getByRole("button", { name: "Accept the duel" }).click();
  await expect(guest.getByText(/invite link is incomplete/)).toBeVisible({ timeout: 30_000 });

  await guest.goto(link.replace(/#.*$/, `#${"A".repeat(43)}`).replace(/^https?:\/\/[^/]+/, ""));
  await guest.reload();
  await expect(guest.getByText(/challenges you/)).toBeVisible({ timeout: 90_000 });
  await guest.getByRole("button", { name: "Accept the duel" }).click();
  await expect(guest.getByText(/invite link is not valid/)).toBeVisible({ timeout: 90_000 });

  await guest.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await guest.reload();
  await expect(guest.getByText(/challenges you/)).toBeVisible({ timeout: 90_000 });
  await guest.getByRole("button", { name: "Accept the duel" }).click();

  await fireUntilMiss(host);
  await fireUntilMiss(guest);
  await expect(host.getByText("Your shot", { exact: true })).toBeVisible({ timeout: 180_000 });

  await guest.getByRole("button", { name: "Strike colours" }).click();
  await expect(host.getByText("Victory, Captain.")).toBeVisible({ timeout: 180_000 });
  await expect(guest.getByText(/wins the duel/)).toBeVisible({ timeout: 180_000 });

  await host.getByRole("link", { name: "Verify" }).last().click();
  await expect(host.getByRole("heading", { name: /proven/ })).toBeVisible();
  await expect(host.getByText("Duel", { exact: true })).toBeVisible({ timeout: 30_000 });

  expect(popups).toEqual([]);
  await hostCtx.close();
  await guestCtx.close();
});
