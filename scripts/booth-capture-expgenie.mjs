// Booth capture — Expense Genie manager dashboard (local, USE_MOCKS=true).
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3005";
const OUT  = process.env.OUT  ?? "booth-shots-expgenie";
fs.mkdirSync(OUT, { recursive: true });

const SHOTS = [
  ["admin-dashboard",  "/t/acme/admin"],
  ["admin-approvals",  "/t/acme/admin/approvals"],
  ["admin-expenses",   "/t/acme/admin/expenses"],
  ["admin-integrations","/t/acme/admin/integrations"],
  ["admin-reports",    "/t/acme/admin/reports"],
  ["admin-activity",   "/t/acme/admin/activity"],
  ["admin-team",       "/t/acme/admin/team"],
  ["employee-expenses","/t/acme/employee/expenses"],
  ["employee-reimb",   "/t/acme/employee/reimbursements"],
  ["super-admin",      "/super-admin"],
];
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;

const browser = await chromium.launch({ headless: true, channel: "chromium" });
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2,
  colorScheme: "light", reducedMotion: "reduce",
});
// Force light mode — the app defaults to dark, the brief requires light.
await ctx.addInitScript(() => {
  try { localStorage.setItem("theme", "light"); } catch {}
});
const page = await ctx.newPage();
page.setDefaultTimeout(60000);

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
// NB: the page's "DEMO ACCOUNTS" quick-fill uses Demo@123, which is the REAL
// backend password. In USE_MOCKS mode the mock layer wants MOCK_PASSWORD
// (lib/mocks/users.ts), so fill the fields ourselves.
await page.fill("#email", process.env.EMAIL ?? "admin@acme.com");
await page.fill("#password", process.env.PASSWORD ?? "demo1234");
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.includes("/login"), { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);
console.error(`logged in -> ${page.url()}`);

const report = [];
for (const [id, route] of SHOTS) {
  if (ONLY && !ONLY.has(id)) continue;
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3200);
    const body = (await page.textContent("body").catch(() => "")) || "";
    const empty = /No .{0,30}(found|yet)|Nothing to show|is empty|No records|No data/i.exec(body);
    const rows  = await page.locator("table tbody tr").count().catch(() => 0);
    const title = (await page.locator("h1").first().textContent().catch(() => "")) || "";
    const status = empty ? `EMPTY (${empty[0]})` : "OK";
    report.push({ id, route, status, rows, title: title.trim().slice(0, 50) });
    console.error(`  ${status === "OK" ? "+" : "-"} ${id.padEnd(20)} ${status.padEnd(26)} rows=${rows}  "${title.trim().slice(0,36)}"`);
    fs.writeFileSync(path.join(OUT, `${id}.png`), await page.screenshot({ type: "png" }));
  } catch (e) {
    report.push({ id, route, status: `ERROR ${e.message.split("\n")[0].slice(0,60)}` });
    console.error(`  X ${id} — ${e.message.split("\n")[0].slice(0, 70)}`);
  }
}
await browser.close();
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
