// PTW Control Center smoke test (brief §9): load the board, click a zone and see
// the guidance change, click a pin and see the drawer, open wall mode and see
// the rotation happen.
//
// Prereqs: both servers running (playwright.config.ts header), the control-center
// DDL applied and the demo plant seeded:
//   npm run db:apply-ptw-control-center && ALLOW_DEMO_SEED=1 npm run db:seed-ptw-control-center
// Env: E2E_PTW_EMAIL / E2E_PTW_PASSWORD — a user with PTW.READ on the demo plant
//      E2E_PTW_PLANT — the demo plant id (printed by the seed)

import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_PTW_EMAIL ?? "";
const PASSWORD = process.env.E2E_PTW_PASSWORD ?? "";
const PLANT = process.env.E2E_PTW_PLANT ?? "";

test.use({ viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
test.skip(!EMAIL || !PASSWORD || !PLANT, "set E2E_PTW_EMAIL, E2E_PTW_PASSWORD and E2E_PTW_PLANT");

async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

test("control center: zone guidance, permit drawer, wall rotation", async ({ page }) => {
  await login(page);
  await page.goto(`/ptw?plant=${PLANT}`);

  const map = page.getByRole("heading", { name: /Live site map/ });
  await expect(map).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("list", { name: "Key figures" })).toBeVisible();

  // Default zone = first impaired one; picking another updates the strip.
  await page.getByRole("button", { name: /^Pump House:/ }).click();
  await expect(page.getByRole("heading", { name: "Site guidance · Pump House" })).toBeVisible();
  await page.getByRole("button", { name: /^Racking Aisles:/ }).click();
  await expect(page.getByRole("heading", { name: "Site guidance · Racking Aisles" })).toBeVisible();

  // Keyboard reaches the zones.
  await page.getByRole("button", { name: /^Loading Dock:/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Site guidance · Loading Dock" })).toBeVisible();

  // A pin opens the permit drawer.
  await page.getByRole("button", { name: /Open permit$/ }).first().click();
  await expect(page.getByRole("link", { name: "Open permit" })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");

  // Filters live in the URL.
  await page.getByRole("combobox", { name: "Range" }).click();
  await page.getByRole("option", { name: "Last 7 days" }).click();
  await expect(page).toHaveURL(/range=7d/);

  // Wall mode rotates Overview → Map + Guidance after 45 s.
  await page.clock.install();
  await page.goto(`/ptw/control-center?mode=wall&plant=${PLANT}`);
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
  await page.clock.fastForward(46_000);
  await expect(page.getByRole("tab", { name: "Map + Guidance" })).toHaveAttribute("aria-selected", "true");
});
