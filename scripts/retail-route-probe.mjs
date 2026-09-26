// Log in as a Retail user and visit routes; report which render the error boundary.
//   BASE=http://localhost:3000 node scripts/retail-route-probe.mjs /ptw /near-miss/new ...
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.EMAIL ?? "store-ops.admin@meridian-retail.in";
const PW = process.env.PW ?? "demo123";

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.setDefaultTimeout(120000);
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.fill("#email", EMAIL);
await page.fill("#password", PW);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 180000 });

let routes = process.argv.slice(2);
if (!routes.length) {
  // Every sidebar link the user can see.
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" }).catch(() => {});
  routes = [...new Set(await page.$$eval("nav a[href^='/']", (as) => as.map((a) => a.getAttribute("href"))))];
}
for (const r of routes) {
  let status = null;
  try {
    const resp = await page.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded" });
    status = resp?.status() ?? null;
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(800);
  } catch (e) { console.log(`ERR   ${r}  ${e.message.split("\n")[0]}`); continue; }
  const text = await page.evaluate(() => document.body.innerText);
  const broken = /didn't load|Application error|Something went wrong|Unhandled Runtime Error/i.test(text);
  const ref = (text.match(/Reference:\s*(\S+)/) || [])[1] ?? "";
  console.log(`${broken ? "FAIL" : "ok  "}  ${status}  ${r}${ref ? "  ref=" + ref : ""}`);
}
await browser.close();
