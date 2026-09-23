// Booth signage capture — CGB_Booth_Creative_Brief.
// PNG, 1920x1080 viewport @ DSF2 (=3840x2160), light mode, no cursor.
//   PROBE=1 node scripts/booth-capture.mjs   # report data-density only
//   node scripts/booth-capture.mjs           # write booth-shots/*.png
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.DEMO_BASE ?? "https://safe-ops360.vercel.app";
const PW = "demo123";
const OUT = process.env.OUT ?? "booth-shots";
const PROBE = !!process.env.PROBE;
fs.mkdirSync(OUT, { recursive: true });

const P = {
  priya: "priya.nair@safeops360.in",
  admin: "admin.it.nw@safeops360.in",
  corp:  "corporate-hse.it.nw@safeops360.in",
  cro:   "anand.krishnan@safeops360.in",
  anjali:"anjali.verma@safeops360.in",
  rohan: "rohan.bhatt@safeops360.in",
  maint: "maintenance-head.it.nw@safeops360.in",
};

// id, persona, route, opts
const SHOTS = [
  // 1. Contractor Safety Management — pre-qualification scoring
  ["contractor-prequal",   "admin", "/epc/contractors"],
  ["contractor-dash",      "admin", "/epc"],
  ["contractor-workers",   "admin", "/epc/workers"],
  ["contractor-gate",      "admin", "/epc/gate"],
  ["vendor-risk",          "cro",   "/erm/vendors"],
  // 2. Fire & Life Safety — unified asset register
  ["fire-register",        "admin", "/fire-safety/equipment"],
  ["fire-home",            "admin", "/fire-safety"],
  ["emergency-response",   "admin", "/emergency-response"],
  // 3. CAMS — engagement / insight summary
  ["cams-audits",          "priya", "/cams/audits"],
  ["cams-engagements",     "priya", "/cams/engagements"],
  ["cams-home",            "priya", "/cams"],
  ["cams-analytics",       "rohan", "/cams/audits?tab=analytics"],
  ["cams-findings",        "priya", "/cams/findings"],
  // 4. Daily Brief / Cross-Module Signals — executive command centre
  ["daily-brief",          "priya", "/dashboard/daily"],
  ["signals",              "priya", "/signals"],
  ["dashboard",            "priya", "/dashboard"],
  ["scorecard",            "priya", "/scorecard"],
  ["vendor-register",      "cro",   "/erm/vendors/register"],
  ["vendor-esg",           "cro",   "/erm/vendors/esg"],
  ["cams-supplier-audit",  "priya", "/cams/audits?subject=SUPPLIER"],
  ["cams-audit-detail",    "priya", "/cams/audits/AUD-SC-2026-NW-0032"],
  ["fire-drills",          "admin", "/emergency-response"],
];

const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const browser = await chromium.launch({ headless: true, channel: "chromium" });
const report = [];

const byPersona = new Map();
for (const s of SHOTS) {
  if (ONLY && !ONLY.has(s[0])) continue;
  if (!byPersona.has(s[1])) byPersona.set(s[1], []);
  byPersona.get(s[1]).push(s);
}

for (const [persona, list] of byPersona) {
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.fill("#email", P[persona]);
    await page.fill("#password", PW);
    await page.click('button[type="submit"]');
    await page.waitForURL(u => !u.pathname.includes("/login"), { timeout: 60000 });
    console.error(`\n== ${persona} (${P[persona]}) logged in`);
  } catch (e) {
    console.error(`\nX LOGIN FAILED ${persona}: ${e.message.split("\n")[0]}`);
    list.forEach(([id]) => report.push({ id, persona, status: "LOGIN FAILED" }));
    await ctx.close(); continue;
  }

  for (const [id, , route, opts = {}] of list) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(opts.wait ?? 2800);
      const body = (await page.textContent("body").catch(() => "")) || "";
      const denied = /Access Denied|Missing permission|Screen not enabled|don't have permission/i.exec(body);
      const empty  = /No .{0,30}(found|yet|recorded|registered)|Nothing to show|is empty|No records|No data/i.exec(body);
      const rows   = await page.locator("table tbody tr").count().catch(() => 0);
      const cards  = await page.locator('[class*="rounded-xl"],[class*="rounded-2xl"]').count().catch(() => 0);
      const title  = (await page.locator("h1").first().textContent().catch(() => "")) || "";
      const status = denied ? `DENIED (${denied[0]})` : empty ? `EMPTY (${empty[0]})` : "OK";
      report.push({ id, persona, route, status, rows, cards, title: title.trim().slice(0, 60) });
      console.error(`  ${status === "OK" ? "+" : "-"} ${id.padEnd(22)} ${status.padEnd(28)} rows=${rows} cards=${cards}  "${title.trim().slice(0,40)}"`);
      if (!PROBE && !denied) {
        const buf = await page.screenshot({ type: "png", fullPage: !!opts.fullPage });
        fs.writeFileSync(path.join(OUT, `${id}.png`), buf);
      }
    } catch (e) {
      report.push({ id, persona, route, status: `ERROR ${e.message.split("\n")[0].slice(0,60)}` });
      console.error(`  X ${id} — ${e.message.split("\n")[0].slice(0, 70)}`);
    }
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
console.error(`\ndone — ${report.filter(r => r.status === "OK").length}/${report.length} OK`);
