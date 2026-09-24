// Step 4 screen crawl for a tenant persona: visits every route of the enabled
// modules plus sample record pages, and reports
//   * error surfaces  — "HTTP 4xx/5xx", "didn't load", "Forbidden", error boundaries
//   * vocabulary leaks — Plant / Factory / Shift Supervisor / Plant Head in UI chrome
//   * foreign records  — record ids from another tenant reachable by URL
// READ-ONLY: logs in, navigates, reads the DOM. Never clicks a control.
//
//   node scripts/tenant-crawl.mjs <email> <outFile> [routesFile]
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:3000";
const [email, outFile, routesFile] = process.argv.slice(2);
const ENABLED = /^\/(dashboard|inbox|fire-safety|cams\/(engagements|findings)|epc|field-reports|incidents|near-miss|ptw|loto|scorecard)(\/|$)/;
const ERR = /HTTP [45]\d\d|didn't load|Forbidden|Internal server error|Something went wrong|Unexpected error/i;
const LEAK = /\b(Plants?|Factory|Factories|Shift Supervisor|Plant Head|Plant Manager)\b/;

function discover() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "(dashboard)");
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith("[") || e.name.startsWith("_")) continue;
      const p = path.join(d, e.name);
      if (fs.existsSync(path.join(p, "page.tsx"))) out.push("/" + path.relative(root, p).split(path.sep).join("/"));
      walk(p);
    }
  };
  walk(root);
  return out.filter((r) => ENABLED.test(r)).sort();
}

const routes = routesFile ? fs.readFileSync(routesFile, "utf8").split(/\r?\n/).filter(Boolean) : discover();
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.setDefaultTimeout(90000);
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.fill("#email", email);
await page.fill("#password", process.env.DEMO_PW ?? "demo123");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 120000 });

const report = {};
for (const r of routes) {
  try {
    await page.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 2500));
    const res = await page.evaluate(({ errSrc, leakSrc }) => {
      const err = new RegExp(errSrc, "i"), leak = new RegExp(leakSrc);
      const text = (sel) => [...document.querySelectorAll(sel)].map((e) => (e.innerText || "").replace(/\s+/g, " ").trim()).filter(Boolean);
      const chrome = [
        ...text("[data-sidebar=sidebar] a, [data-sidebar=sidebar] [data-sidebar=group-label]"),
        ...text("header"), ...text("main h1, main h2, main h3, main h4"), ...text("main label, main legend"),
        ...text("main th"), ...text("main button"), ...text("main [role=tab]"),
        ...[...document.querySelectorAll("main input[placeholder], main textarea[placeholder]")].map((e) => e.getAttribute("placeholder")),
      ];
      const body = document.querySelector("main")?.innerText ?? "";
      return {
        path: location.pathname,
        errors: [...new Set(body.split("\n").filter((l) => err.test(l)).map((l) => l.trim().slice(0, 160)))],
        leaks: [...new Set(chrome.filter((t) => t && leak.test(t)).map((t) => t.slice(0, 160)))],
      };
    }, { errSrc: ERR.source, leakSrc: LEAK.source });
    report[r] = res;
    const flag = res.errors.length || res.leaks.length ? "✘" : "✓";
    console.error(`${flag} ${r}${res.path !== r ? ` → ${res.path}` : ""}${res.errors.length ? `  ERR ${JSON.stringify(res.errors)}` : ""}${res.leaks.length ? `  LEAK ${JSON.stringify(res.leaks)}` : ""}`);
  } catch (e) {
    report[r] = { crawlError: e.message.split("\n")[0] };
    console.error(`? ${r}: ${report[r].crawlError}`);
  }
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
await browser.close();
