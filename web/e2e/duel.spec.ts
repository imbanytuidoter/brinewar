import { expect, test, type BrowserContext, type Page } from "@playwright/test";

test.skip(!process.env.E2E_BASE_URL, "set E2E_BASE_URL to a running Brinewar web app");

function watchPopups(context: BrowserContext, page: Page, sink: string[]): void {
  context.on("page", (p) => sink.push(p.url()));
  page.on("dialog", (d) => {
    sink.push(`dialog:${d.message()}`);
    void d.dismiss();
  });
}

async function fire(page: Page, cell: string): Promise<void> {
  await expect(page.getByText("Your turn")).toBeVisible({ timeout: 120_000 });
  await page.getByLabel("Target").fill(cell);
  await page.getByRole("button", { name: "Fire", exact: true }).click();
}

test("two captains duel through an invite link with no wallet", async ({ browser, baseURL }) => {
  const popups: string[] = [];
  const hostCtx = await browser.newContext({ baseURL });
  const guestCtx = await browser.newContext({ baseURL });
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  watchPopups(hostCtx, host, popups);
  watchPopups(guestCtx, guest, popups);

  await host.goto("/");
  await host.getByRole("button", { name: "Take command" }).click({ timeout: 90_000 });
  await host.getByRole("button", { name: "Challenge a friend" }).click({ timeout: 90_000 });
  await expect(host.getByText("Waiting for your friend", { exact: true })).toBeVisible({ timeout: 90_000 });
  const link = (await host.locator("code").first().innerText()).trim();
  expect(link).toMatch(/\/\?duel=\d+#k=[0-9a-f]{64}$/);

  await guest.goto(link.replace(/#.*$/, "").replace(/^https?:\/\/[^/]+/, ""));
  await expect(guest.getByText(/challenges you/)).toBeVisible({ timeout: 90_000 });
  await guest.getByRole("button", { name: "Accept the duel" }).click();
  await expect(guest.getByText(/invite link is incomplete/)).toBeVisible({ timeout: 30_000 });

  await guest.goto(link.replace(/#k=.*$/, `#k=${"0".repeat(64)}`).replace(/^https?:\/\/[^/]+/, ""));
  await guest.reload();
  await expect(guest.getByText(/challenges you/)).toBeVisible({ timeout: 90_000 });
  await guest.getByRole("button", { name: "Accept the duel" }).click();
  await expect(guest.getByText(/invite link is not valid/)).toBeVisible({ timeout: 90_000 });

  await guest.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await guest.reload();
  await expect(guest.getByText(/challenges you/)).toBeVisible({ timeout: 90_000 });
  await guest.getByRole("button", { name: "Accept the duel" }).click();

  await fire(host, "E5");
  await expect(guest.getByText("Your turn")).toBeVisible({ timeout: 180_000 });
  await fire(guest, "B2");
  await expect(host.getByText("Your turn")).toBeVisible({ timeout: 180_000 });

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
