import { chromium } from "playwright-core";
import fs from "node:fs"; import path from "node:path";
const BASE = "http://localhost:3005";
const OUT = "booth-shots-expgenie"; fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: "chromium" });
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2,
  colorScheme: "light", reducedMotion: "reduce",
});
await ctx.addInitScript(() => { try { localStorage.setItem("theme","light"); } catch {} });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(900);
await page.fill("#email", "admin@acme.com");
await page.fill("#password", "demo1234");
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.includes("/login"), { timeout: 60000 }).catch(()=>{});
await page.waitForTimeout(2000);

await page.goto(`${BASE}/t/acme/admin/integrations`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(()=>{});
await page.waitForTimeout(3000);
// run the SAP connection test so the panel shows a live green result
try {
  await page.getByRole("button", { name: /Test connection/i }).first().click({ timeout: 8000 });
  await page.waitForTimeout(2200);
} catch (e) { console.error("  (test click skipped:", e.message.split("\n")[0].slice(0,60), ")"); }
await page.mouse.move(1910, 1070);
await page.waitForTimeout(800);
const body = (await page.textContent("body")) || "";
console.error("  Connected badge present:", /Connected/.test(body));
console.error("  test result:", (/Connection OK[^<]{0,30}/.exec(body) || ["(none)"])[0]);
fs.writeFileSync(path.join(OUT, "admin-integrations-connected.png"),
                 await page.screenshot({ type: "png" }));
console.error("  + admin-integrations-connected.png");
await browser.close();
