// Label regression baseline: capture the label-bearing text (nav, headings,
// form labels, table headers, buttons, placeholders, tabs) plus a screenshot
// for every static dashboard route, per persona.
//
//   node scripts/label-baseline.mjs <outDir>                 # capture
//   node scripts/label-baseline.mjs --diff <before> <after>  # compare text snapshots
//
// STRICTLY READ-ONLY: logs in, navigates, reads the DOM. Never clicks a control.
// Env: BASE (default http://localhost:3000), PERSONAS (comma list of keys),
//      ROUTES (comma list, overrides discovery), NO_SHOTS=1 to skip screenshots.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PW = process.env.DEMO_PW ?? "demo123";

const PERSONAS = {
  mfg: "priya.nair@safeops360.in",                  // Meridian Manufacturing (NW)
  apparel: "harpreet.singh@meridian-apparel.in",    // Meridian Apparel (MAG-LDH)
  industry: "plant-head.acs@safeops360.in",         // AutoComp demo plant (ACS)
  retail: "store-ops.admin@meridian-retail.in",     // Meridian Retail (added by the retail seed)
};

function discoverRoutes() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "(dashboard)");
  const out = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith("[") || e.name.startsWith("_")) continue;
      const d = path.join(dir, e.name);
      if (fs.existsSync(path.join(d, "page.tsx"))) out.push("/" + path.relative(root, d).split(path.sep).join("/"));
      walk(d);
    }
  };
  walk(root);
  return out.sort();
}

// Runs in the page. Digits are masked so live counters don't read as label drift.
function snapshotLabels() {
  const norm = s => (s ?? "").replace(/\s+/g, " ").trim();
  const mask = s => s.replace(/\d+/g, "#");
  const pick = sel => [...document.querySelectorAll(sel)]
    .filter(el => el.offsetParent !== null || el.tagName === "OPTION")
    .map(el => mask(norm(el.innerText ?? el.textContent)))
    .filter(Boolean);
  return {
    // Sidebar is a div[data-sidebar=sidebar]; collapsed sections hide their links,
    // so read nav text regardless of visibility (visibility ≠ label drift).
    nav: [...document.querySelectorAll("[data-sidebar=sidebar] a, [data-sidebar=sidebar] [data-sidebar=group-label], [data-sidebar=sidebar] button, aside a, nav a")]
      .map(el => mask(norm(el.textContent))).filter(Boolean),
    headings: pick("main h1, main h2, main h3, main h4"),
    labels: pick("main label, main legend"),
    tableHeaders: pick("main th"),
    buttons: pick("main button"),
    tabs: pick("main [role=tab]"),
    placeholders: [...document.querySelectorAll("main input[placeholder], main textarea[placeholder]")]
      .map(el => mask(norm(el.getAttribute("placeholder")))).filter(Boolean),
    title: document.title,
    notFound: /404|could not be found/i.test(document.body.innerText.slice(0, 400)),
    // A licence lock screen renders on every route; a baseline of it is worthless.
    licenceLocked: /No licence found|Licence required|licence has expired/i.test(document.body.innerText.slice(0, 2000)),
  };
}

async function capture(outDir) {
  const keys = (process.env.PERSONAS ?? "mfg,apparel,industry").split(",");
  const routes = process.env.ROUTES ? process.env.ROUTES.split(",") : discoverRoutes();
  const browser = await chromium.launch({ headless: true });
  for (const key of keys) {
    const email = PERSONAS[key];
    const dir = path.join(outDir, key);
    fs.mkdirSync(path.join(dir, "shots"), { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    // The login page prefills a demo user after hydration; wait for it to settle
    // so our fill isn't overwritten, then confirm the field holds our email.
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.fill("#email", email);
    await page.fill("#password", PW);
    const typed = await page.inputValue("#email");
    if (typed !== email) throw new Error(`login email overwritten: expected ${email}, got ${typed}`);
    await page.click('button[type="submit"]');
    await page.waitForURL(u => !u.pathname.includes("/login"), { timeout: 120000 });
    console.error(`── ${key} (${email}) logged in; ${routes.length} routes`);
    // Fail fast if the app is licence-locked — every page would be the lock screen.
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" }).catch(() => {});
    if ((await page.evaluate(snapshotLabels)).licenceLocked) throw new Error("app is licence-locked; aborting capture");
    const result = {};
    for (const r of routes) {
      try {
        const resp = await page.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(1200);
        result[r] = { status: resp?.status() ?? null, finalPath: new URL(page.url()).pathname, ...(await page.evaluate(snapshotLabels)) };
        if (!process.env.NO_SHOTS) {
          await page.screenshot({ path: path.join(dir, "shots", r.slice(1).replaceAll("/", "__") + ".png"), fullPage: true });
        }
        console.error(`  ✓ ${r}`);
      } catch (e) {
        result[r] = { error: e.message.split("\n")[0] };
        console.error(`  ✘ ${r}: ${result[r].error}`);
      }
    }
    fs.writeFileSync(path.join(dir, "labels.json"), JSON.stringify(result, null, 1));
    await ctx.close();
  }
  await browser.close();
}

function diff(beforeDir, afterDir) {
  let drift = 0;
  for (const key of fs.readdirSync(beforeDir)) {
    const bf = path.join(beforeDir, key, "labels.json"), af = path.join(afterDir, key, "labels.json");
    if (!fs.existsSync(bf) || !fs.existsSync(af)) continue;
    const b = JSON.parse(fs.readFileSync(bf, "utf8")), a = JSON.parse(fs.readFileSync(af, "utf8"));
    for (const r of Object.keys(b)) {
      if (!a[r]) { console.log(`[${key}] ${r}: missing in after`); drift++; continue; }
      for (const f of ["nav", "headings", "labels", "tableHeaders", "buttons", "tabs", "placeholders", "title", "finalPath"]) {
        const bv = JSON.stringify(b[r][f]), av = JSON.stringify(a[r][f]);
        if (bv !== av) {
          drift++;
          const bs = new Set(b[r][f] ?? []), as = new Set(a[r][f] ?? []);
          const gone = Array.isArray(b[r][f]) ? [...bs].filter(x => !as.has(x)) : [b[r][f]];
          const added = Array.isArray(a[r][f]) ? [...as].filter(x => !bs.has(x)) : [a[r][f]];
          console.log(`[${key}] ${r} ${f}: -${JSON.stringify(gone)} +${JSON.stringify(added)}`);
        }
      }
    }
  }
  console.log(drift ? `\n${drift} differing fields` : "\nNo label drift.");
  process.exitCode = drift ? 1 : 0;
}

if (process.argv[2] === "--diff") diff(process.argv[3], process.argv[4]);
else await capture(process.argv[2] ?? "label-baseline");
