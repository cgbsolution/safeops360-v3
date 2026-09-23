import { chromium } from "playwright-core";
import fs from "node:fs"; import path from "node:path";
const BASE = "http://localhost:3005";
const OUT = "booth-shots-expgenie"; fs.mkdirSync(OUT, { recursive: true });

async function session(email, pw) {
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2,
    colorScheme: "light", reducedMotion: "reduce",
  });
  await ctx.addInitScript(() => { try { localStorage.setItem("theme","light"); } catch {} });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  await page.fill("#email", email); await page.fill("#password", pw);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.pathname.includes("/login"), { timeout: 60000 }).catch(()=>{});
  await page.waitForTimeout(2000);
  console.error(`logged in ${email} -> ${page.url()}`);
  return { ctx, page };
}

async function shot(page, id, route, actions = []) {
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(()=>{});
  await page.waitForTimeout(3000);
  for (const [kind, sel] of actions) {
    try {
      if (kind === "clickText") await page.getByText(sel, { exact: false }).first().click({ timeout: 8000 });
      else if (kind === "click") await page.locator(sel).first().click({ timeout: 8000 });
      await page.waitForTimeout(1800);
    } catch (e) { console.error(`     (skip ${kind} "${sel}": ${e.message.split("\n")[0].slice(0,50)})`); }
  }
  // park the pointer off-canvas so no hover tooltip / cursor artefact is baked in
  await page.mouse.move(1910, 1070);
  await page.waitForTimeout(900);
  fs.writeFileSync(path.join(OUT, `${id}.png`), await page.screenshot({ type: "png" }));
  const h1 = (await page.locator("h1").first().textContent().catch(()=>"")) || "";
  console.error(`  + ${id.padEnd(24)} "${h1.trim().slice(0,40)}"`);
}

const browser = await chromium.launch({ headless: true, channel: "chromium" });

const a = await session("admin@acme.com", "demo1234");
await shot(a.page, "admin-reports-clean",   "/t/acme/admin/reports");
await shot(a.page, "admin-approvals-all",   "/t/acme/admin/approvals", [["clickText","All"]]);
await shot(a.page, "admin-expense-detail",  "/t/acme/admin/expenses", [["click","tbody tr:first-child button"]]);
await shot(a.page, "admin-dashboard-clean", "/t/acme/admin", [["clickText","1Y"]]);
await a.ctx.close();

const s = await session("owner@expgenie.com", "demo1234");
await shot(s.page, "super-admin-overview", "/super-admin");
await s.ctx.close();

await browser.close();
