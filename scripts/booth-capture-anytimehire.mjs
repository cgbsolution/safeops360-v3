// Booth capture — AnytimeHire (local: FE :3001 -> BE :8010).
import { chromium } from "playwright-core";
import fs from "node:fs"; import path from "node:path";
const BASE = process.env.BASE ?? "http://localhost:3001";
const OUT  = process.env.OUT  ?? "booth-shots-anytimehire";
fs.mkdirSync(OUT, { recursive: true });

// Brief explicitly excludes Fit Score / AI Round Score / proctoring-review screens.
const SHOTS = [
  ["candidates-pipeline", "/candidates"],
  ["job-openings",        "/job-openings"],
  ["dashboard",           "/"],
  ["create-openings",     "/create-openings"],
  ["resume-database",     "/resume-database"],
  ["question-bank",       "/question-bank"],
  ["calendar",            "/calendar"],
  ["organizations",       "/organizations"],
];
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;

const browser = await chromium.launch({ headless: true, channel: "chromium" });
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2,
  colorScheme: "light", reducedMotion: "reduce",
});
await ctx.addInitScript(() => { try { localStorage.setItem("theme","light"); } catch {} });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);

await page.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.locator('input[type="email"]').first().fill(process.env.EMAIL ?? "booth.capture@cgbindia.com");
await page.locator('input[type="password"]').first().fill(process.env.PASSWORD ?? "BoothShot#2026");
await page.locator('button[type="submit"]').first().click();
await page.waitForURL(u => !u.pathname.includes("/signin"), { timeout: 60000 }).catch(()=>{});
await page.waitForTimeout(4000);
// First login opens a 21-step product tour that dims and covers every page.
// Escape closes it and persists `product_tour_seen:<userId>` in localStorage.
for (let i = 0; i < 3; i++) {
  if (!(await page.getByText("Welcome to AI Recruiter").count())) break;
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1200);
}
console.error(`signed in -> ${page.url()}`);

const report = [];
for (const [id, route] of SHOTS) {
  if (ONLY && !ONLY.has(id)) continue;
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(()=>{});
    await page.waitForTimeout(3500);
    await page.mouse.move(1910, 1070);     // no hover artefacts
    await page.waitForTimeout(700);
    const body = (await page.textContent("body").catch(()=>"")) || "";
    const empty = /No .{0,30}(found|yet)|Nothing to show|is empty|No records|No data/i.exec(body);
    const rows  = await page.locator("table tbody tr").count().catch(()=>0);
    const h1    = (await page.locator("h1,h2").first().textContent().catch(()=>"")) || "";
    const status = /signin|sign in/i.test(page.url()) ? "REDIRECTED TO SIGNIN" : empty ? `EMPTY (${empty[0]})` : "OK";
    report.push({ id, route, status, rows, h1: h1.trim().slice(0,50) });
    console.error(`  ${status==="OK"?"+":"-"} ${id.padEnd(20)} ${status.padEnd(26)} rows=${rows}  "${h1.trim().slice(0,34)}"`);
    fs.writeFileSync(path.join(OUT, `${id}.png`), await page.screenshot({ type: "png" }));
  } catch (e) {
    report.push({ id, route, status: `ERROR ${e.message.split("\n")[0].slice(0,60)}` });
    console.error(`  X ${id} — ${e.message.split("\n")[0].slice(0,70)}`);
  }
}
await browser.close();
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
