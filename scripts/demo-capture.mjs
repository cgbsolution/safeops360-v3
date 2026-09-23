// Capture the real SafeOps360 screens for the sales Demo Trainer.
//
//   node scripts/demo-recon.mjs   recon.json     # discover live detail-record URLs
//   node scripts/demo-capture.mjs recon.json shots/   # write shots/<id>.webp + shots/index.json
//
// STRICTLY READ-ONLY. It logs in, navigates and screenshots. It never clicks a
// submit/approve/save control. Note that opening a record stamps WorkflowTask
// .readAt, so detail screens do mark those demo records as read.
import { chromium, devices } from "playwright-core";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.DEMO_BASE ?? "https://safeops360-v2.vercel.app";
const PW = "demo123";
const RECON = JSON.parse(fs.readFileSync(process.argv[2] || "recon.json", "utf8"));
const OUT = process.argv[3] || "shots";
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
// SKIP takes id prefixes, e.g. SKIP=erm-,bcm-,ctrl- to defer the RBAC-gated set.
const SKIP = process.env.SKIP ? process.env.SKIP.split(",") : [];

fs.mkdirSync(OUT, { recursive: true });

const P = {
  priya: "priya.nair@safeops360.in",
  corp: "corporate-hse.it.nw@safeops360.in",
  head: "plant-head.it.nw@safeops360.in",
  worker: "worker.it.nw@safeops360.in",
  sup: "supervisor.it.nw@safeops360.in",
  maint: "maintenance-head.it.nw@safeops360.in",
  so: "safety-officer.it.nw@safeops360.in",
  anjali: "anjali.verma@safeops360.in",
  rohan: "rohan.bhatt@safeops360.in",
  // ERM / BCM / Controls are RBAC-gated — HSE and Corporate HSE seats get
  // "Missing permission 'ERM.READ'". The Chief Risk Officer is the seat that
  // holds them (the in-app error names this account).
  cro: "anand.krishnan@safeops360.in",
  admin: "admin.it.nw@safeops360.in",
};

// detailOf: pull the first real record URL discovered during recon.
// scroll: px to scroll before shooting (for panels below the fold).
// device: "mobile" for the field-capture PWA.
const SHOTS = [
  ["login",              null,     "/login"],
  ["login-personas",     null,     "/login", { actions: [["fill", "input[type='text']", "priya"]] }],

  // ── evidence of what is NOT available on this deployment ──
  // /loto and /brsr exist in src/app but 404 on the deployed frontend (stale
  // Vercel build); /safety-culture is an RBAC refusal. Captured deliberately so
  // the trainer can show what the failure looks like.
  ["loto-404",           "priya",  "/loto"],
  ["brsr-404",           "priya",  "/brsr"],
  ["culture-denied",     "admin",  "/safety-culture", { expectDenied: true }],

  // ── extra depth, to stop one screen standing in for four steps ──
  ["obs-table",          "priya",  "/observations", { scroll: 1500 }],
  ["hira-matrix",        "admin",  "/configuration/risk-matrices/cmqgxbiaw0000ehystpwano7e"],
  ["hira-alarp",         "priya",  { detailOf: "/hira" }, { scroll: 1900 }],
  ["cams-conduct",       "anjali", { detailOf: "/cams/audits" }, { suffix: "/conduct" }],
  ["cams-signoff",       "anjali", { detailOf: "/cams/audits" }, { scroll: 2400 }],
  ["ptw-evidence",       "priya",  { detailOf: "/ptw" }, { scroll: 1400 }],
  ["moc-gates",          "priya",  { detailOf: "/moc" }, { scroll: 2000 }],
  ["capture-lang2",      "worker", "/capture", { device: "mobile", actions: [["clickText", "English"]] }],

  // ── platform ──
  ["inbox",              "priya",  "/inbox"],
  ["dashboard",          "priya",  "/dashboard"],
  ["daily-brief",        "priya",  "/dashboard/daily"],
  ["audit-trail",        "priya",  "/audit-trail"],
  ["licence",            "priya",  "/licence"],
  ["agents",             "priya",  "/configuration/agents"],
  ["config",             "priya",  "/configuration"],
  ["config-roles",       "admin",  "/configuration/roles"],
  ["config-users",       "admin",  "/configuration/users"],
  ["config-workflows",   "admin",  "/configuration/workflows"],
  ["config-dropdowns",   "admin",  "/configuration/dropdowns"],
  ["config-matrices",    "admin",  "/configuration/risk-matrices"],

  // ── operational safety ──
  ["obs-list",           "priya",  "/observations"],
  ["obs-insights",       "priya",  "/observations", { scroll: 700 }],
  ["obs-new",            "worker", "/observations/new"],
  ["obs-new-filled",     "worker", "/observations/new", { fill: "observation" }],
  ["obs-detail",         "priya",  { detailOf: "/observations" }],
  ["obs-trail",          "priya",  { detailOf: "/observations" }, { scroll: 1600 }],
  ["inbox-sup",          "sup",    "/inbox"],
  ["inbox-maint",        "maint",  "/inbox"],
  ["inbox-so",           "so",     "/inbox"],
  ["nearmiss-list",      "priya",  "/near-miss"],
  ["nearmiss-detail",    "priya",  { detailOf: "/near-miss" }],
  ["ptw-list",           "priya",  "/ptw"],
  ["ptw-detail",         "priya",  { detailOf: "/ptw" }],
  ["ptw-new",            "priya",  "/ptw/new"],
  ["loto-list",          "admin",  "/loto"],
  ["loto-detail",        "admin",  { detailOf: "/loto" }],
  ["loto-exec-list",     "admin",  "/loto/executions"],
  ["loto-exec-detail",   "admin",  { detailOf: "/loto/executions" }],
  ["flra-list",          "sup",    "/flra"],
  ["flra-detail",        "sup",    { detailOf: "/flra" }],
  ["inc-list",           "priya",  "/incidents"],
  ["inc-detail",         "priya",  { detailOf: "/incidents" }],
  ["inc-rca",            "priya",  { detailOf: "/incidents" }, { scroll: 1500 }],
  ["capture-mobile",     "worker", "/capture", { device: "mobile" }],
  ["field-reports",      "so",     "/field-reports"],

  // ── risk management ──
  ["hira-list",          "priya",  "/hira"],
  ["hira-study",         "priya",  { detailOf: "/hira" }],
  ["hira-entry",         "priya",  { detailOf: "/hira" }, { scroll: 900 }],
  ["hira-reviews",       "priya",  "/hira/reviews"],
  ["eai-list",           "priya",  "/eai"],
  ["eai-study",          "priya",  { detailOf: "/eai" }],
  ["eai-reviews",        "priya",  "/eai/reviews"],
  ["risk-register",      "corp",   "/risk-register"],
  ["risk-dashboard",     "corp",   "/risk-register?tab=analytics"],
  ["capa-list",          "priya",  "/capa"],
  ["capa-detail",        "priya",  { detailOf: "/capa" }],
  ["moc-list",           "priya",  "/moc"],
  ["moc-detail",         "priya",  { detailOf: "/moc" }],
  ["moc-impact",         "priya",  { detailOf: "/moc" }, { scroll: 1100 }],
  ["compliance",         "priya",  "/compliance"],
  ["compliance-reg",     "priya",  { detailOf: "/compliance" }],

  // ── CAMS ──
  ["cams-home",          "priya",  "/cams"],
  ["cams-programme",     "rohan",  "/cams/programme"],
  ["cams-prog-detail",   "rohan",  { detailOf: "/cams/programme" }],
  ["cams-calendar",      "priya",  "/cams/calendar"],
  ["cams-audits",        "priya",  "/cams/audits"],
  ["cams-audit-detail",  "anjali", { detailOf: "/cams/audits" }],
  ["cams-audit-findings","anjali", { detailOf: "/cams/audits" }, { scroll: 1200 }],
  ["cams-checkpoints",   "sup",    "/cams/audits/my-checkpoints"],
  ["cams-engagements",   "priya",  "/cams/engagements"],
  ["cams-templates",     "priya",  "/cams/templates"],
  ["cams-template",      "priya",  { detailOf: "/cams/templates" }],
  ["cams-findings",      "priya",  "/cams/findings"],
  ["cams-capa",          "priya",  "/cams/capa"],
  ["cams-compliance",    "priya",  "/cams/compliance"],
  ["cams-assurance",     "rohan",  "/cams/assurance"],
  ["cams-analytics",     "rohan",  "/cams/audits?tab=analytics"],

  // ── ERM ──
  ["erm-home",           "cro",   "/erm"],
  ["erm-register",       "cro",   "/erm/register"],
  ["erm-risk",           "cro",   { detailOf: "/erm/register" }],
  ["erm-risk-controls",  "cro",   { detailOf: "/erm/register" }, { scroll: 1400 }],
  ["erm-heatmap",        "cro",   "/erm/heatmap"],
  ["erm-network",        "cro",   "/erm/network"],
  ["erm-treatments",     "cro",   "/erm/treatments"],
  ["erm-kris",           "cro",   "/erm/kris"],
  ["erm-appetite",       "cro",   "/erm/appetite"],
  ["erm-breaches",       "cro",   "/erm/appetite/breaches"],
  ["erm-loss",           "cro",   "/erm/loss"],
  ["erm-board-packs",    "cro",   "/erm/board-packs"],
  ["rca-list",           "cro",   "/erm/rca"],
  ["rca-detail",         "cro",   { detailOf: "/erm/rca" }],
  ["rca-analytics",      "cro",   "/erm/rca/analytics"],
  ["rca-map",            "cro",   "/erm/rca/map"],
  ["bcm-home",           "cro",   "/erm/bcm"],
  ["bcm-processes",      "cro",   "/erm/bcm/processes"],
  ["bcm-depmap",         "cro",   "/erm/bcm/dependency-map"],
  ["bcm-plans",          "cro",   "/erm/bcm/plans"],
  ["bcm-exercises",      "cro",   "/erm/bcm/exercises"],
  ["bcm-crisis",         "cro",   "/erm/bcm/crisis"],
  ["ctrl-library",       "cro",   "/erm/controls/library"],
  ["ctrl-matrix",        "cro",   "/erm/controls/matrix"],
  ["ctrl-deficiencies",  "cro",   "/erm/controls/deficiencies"],
  ["insurance-policies", "cro",   "/erm/insurance/policies"],
  ["insurance-gap",      "cro",   "/erm/insurance/coverage-gap"],

  // ── facilities & reporting ──
  ["facilities",         "admin",   "/facilities"],
  ["facility-detail",    "admin",   { detailOf: "/facilities" }],
  ["fac-social",         "admin",   "/facilities/social-compliance"],
  ["fac-certs",          "admin",   "/facilities/certifications"],
  ["fac-compare",        "admin",   "/facilities/compare"],
  ["fac-map",            "admin",   "/facilities/map"],
  ["brsr",               "admin",   "/brsr"],
  ["brsr-cycle",         "admin",   { detailOf: "/brsr" }],
  ["brsr-trends",        "admin",   "/brsr/trends"],

  // ── people & culture ──
  ["training-intel",     "admin",  "/training-intelligence"],
  ["training",           "priya",  "/training"],
  ["training-assign",    "priya",  "/training/assignments"],
  ["training-analytics", "priya",  "/training?tab=analytics"],
  ["skill-matrix",       "priya",  "/skill-matrix"],
  ["skill-rollup",       "priya",  "/skill-matrix/rollup"],
  ["skill-correlation",  "admin",  "/skill-matrix/correlation"],
  ["culture",            "admin",  "/safety-culture"],
  ["culture-leadership", "admin",  "/safety-culture/leadership"],
  ["culture-ratio",      "admin",  "/safety-culture/leading-lagging"],
  ["culture-bbs",        "admin",  "/safety-culture/bbs-quality"],
  ["culture-perception", "admin",  "/safety-culture/perception"],

  // ── assets & performance ──
  ["ppe",                "admin",  "/ppe"],
  ["inspections",        "maint",  "/inspections"],
  ["insp-inbox",         "maint",  "/inspections/inbox"],
  ["insp-findings",      "maint",  "/inspections/findings"],
  ["insp-equipment",     "maint",  "/inspections/equipment"],
  ["insp-analytics",     "maint",  "/inspections?tab=analytics"],
  ["manhours",           "priya",  "/manhours"],
  ["manhours-kpi",       "priya",  "/manhours/kpi"],
  ["mis-dashboard",      "priya",  "/manhours/performance"],
  ["anomalies",          "priya",  "/anomalies"],
];

function resolveRoute(spec, persona) {
  if (typeof spec === "string") return spec;
  if (spec?.detailOf) {
    const r = RECON.routes?.[spec.detailOf];
    if (!r) return null;
    // prefer the persona's own discovery, else any persona that found one
    const mine = r[P[persona]]?.detail;
    if (mine) return mine;
    for (const v of Object.values(r)) if (v?.detail) return v.detail;
    return null;
  }
  return null;
}

// Fill the New Observation form with the trainer's demo data — WITHOUT
// submitting — so the screenshot shows exactly what the presenter should type.
// Also reports back the option labels it actually chose, so the trainer's
// "type exactly this" table can be corrected to match the live tenant.
const PLANT_WANT = process.env.DEMO_PLANT ?? "North Garment Unit";
async function fillObservation(p) {
  const chosen = {};
  const sel = i => p.locator("select").nth(i);
  const pickBy = async (i, res, label) => {
    const opts = await sel(i).locator("option").allTextContents();
    const real = opts.filter(o => o.trim() && !/^—|^-{2,}|select a|select an|choose/i.test(o.trim()));
    let hit = null;
    for (const re of res) { hit = real.find(o => re.test(o)); if (hit) break; }
    hit ??= real[0];
    if (!hit) return null;
    await sel(i).selectOption({ label: hit });
    chosen[label] = hit.trim();
    await p.waitForTimeout(1100);          // dependent selects repopulate
    return hit;
  };

  await pickBy(0, [/^High$/], "Severity");
  await pickBy(1, [new RegExp(PLANT_WANT, "i")], "Plant");
  await pickBy(2, [/store|warehouse|fabric|sewing|stitch|cutting/i], "Area");
  await pickBy(3, [/^Unsafe Condition$/], "Observation Type");
  await pickBy(4, [/Housekeeping/i, /Procedures/i], "Category");
  await pickBy(5, [/egress|walkway|aisle|block/i], "Sub-category");

  const tas = p.locator("textarea");
  const n = await tas.count();
  if (n > 0) await tas.nth(0).fill(
    "Two stacked pallets of packing cartons are parked directly across the fire exit door at the north end of the finished-goods store. The exit cannot be opened more than about 30 cm.");
  if (n > 1) await tas.nth(1).fill(
    "Told the store operator on shift; one pallet moved aside so the door can open.");
  await p.waitForTimeout(900);

  // read back the auto-derived SLA date — the thing the presenter points at
  const dates = await p.locator('input[type="date"]').all();
  for (const d of dates) {
    const v = await d.inputValue().catch(() => "");
    if (v) chosen[(await d.getAttribute("id")) || "date"] = v;
  }
  return chosen;
}

const browser = await chromium.launch({ headless: true, channel: "chromium" });
const index = {};
const failures = [];

// group by persona so we log in once each
const byPersona = new Map();
for (const s of SHOTS) {
  const [id, persona] = s;
  if (ONLY && !ONLY.has(id)) continue;
  if (SKIP.some(pre => id.startsWith(pre))) continue;
  if (!byPersona.has(persona)) byPersona.set(persona, []);
  byPersona.get(persona).push(s);
}

for (const [persona, list] of byPersona) {
  const email = P[persona];
  const desktop = { viewport: { width: 1512, height: 945 }, deviceScaleFactor: 2 };
  const ctx = await browser.newContext(desktop);
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);

  if (email) {
    try {
      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
      await page.fill("#email", email);
      await page.fill("#password", PW);
      await page.click('button[type="submit"]');
      await page.waitForURL(u => !u.pathname.includes("/login"), { timeout: 60000 });
      console.error(`\n── logged in as ${persona} (${email})`);
    } catch (e) {
      console.error(`\n✘ LOGIN FAILED ${persona}: ${e.message.split("\n")[0]}`);
      list.forEach(([id]) => failures.push([id, "login failed"]));
      await ctx.close();
      continue;
    }
  }

  let mobileCtx = null, mobilePage = null;

  for (const [id, , spec, opts = {}] of list) {
    let route = resolveRoute(spec, persona);
    if (route && opts.suffix) route += opts.suffix;
    if (!route) { failures.push([id, "no route resolved"]); console.error(`  ✘ ${id} — unresolved`); continue; }

    let p = page;
    if (opts.device === "mobile") {
      if (!mobileCtx) {
        mobileCtx = await browser.newContext({ ...devices["Pixel 5"], deviceScaleFactor: 3, storageState: await ctx.storageState() });
        mobilePage = await mobileCtx.newPage();
      }
      p = mobilePage;
    }

    try {
      await p.goto(route.startsWith("http") ? route : `${BASE}${route}`, { waitUntil: "domcontentloaded" });
      await p.waitForLoadState("networkidle", { timeout: 25000 }).catch(() => {});
      await p.waitForTimeout(opts.wait ?? 2200);
      // settle any count-up / chart animations
      await p.waitForTimeout(600);
      // opts.actions: read-only interactions before the shot — reveal a panel,
      // step a wizard forward. Never a submit/save/approve control.
      for (const [kind, a, bArg] of opts.actions ?? []) {
        try {
          if (kind === "clickText") await p.getByText(a, { exact: false }).first().click({ timeout: 8000 });
          else if (kind === "click") await p.locator(a).first().click({ timeout: 8000 });
          else if (kind === "fill") await p.locator(a).first().fill(bArg);
          await p.waitForTimeout(bArg && kind === "fill" ? 1600 : 1500);
        } catch (e) { console.error(`     (action ${kind} "${a}" skipped: ${e.message.split("\n")[0].slice(0, 50)})`); }
      }

      if (opts.fill === "observation") {
        const chosen = await fillObservation(p).catch(e => ({ _error: e.message.split("\n")[0] }));
        index[`${id}__values`] = chosen;
        console.error(`     filled: ${JSON.stringify(chosen)}`);
      }
      if (opts.scroll) {
        await p.evaluate(y => window.scrollTo({ top: y, behavior: "instant" }), opts.scroll);
        await p.waitForTimeout(900);
      }
      // Guard: an Access Denied / not-entitled page is a valid HTTP 200 and
      // looks like a normal capture. Search the WHOLE body — these pages open
      // with ~6.7kB of inline nprogress CSS, so sampling the head misses it.
      const body = ((await p.textContent("body").catch(() => "")) || "");
      const bad = /Access Denied|Missing permission|Screen not enabled|don't have permission/i.exec(body);
      if (bad && !opts.expectDenied) {
        failures.push([id, `DENIED (${bad[0]}) as ${persona}`]);
        console.error(`  ✘ ${id} — DENIED as ${persona}: ${bad[0]}`);
        continue;
      }
      if (process.env.VERIFY) { console.error(`  ✔ ${id} ok`); index[id] = { route, persona, verified: true, bytes: 0 }; continue; }

      const buf = await p.screenshot({ type: "png" });
      const width = opts.device === "mobile" ? 620 : 1420;
      const webp = await sharp(buf).resize({ width, withoutEnlargement: true })
        .webp({ quality: 74, effort: 5 }).toBuffer();
      fs.writeFileSync(path.join(OUT, `${id}.webp`), webp);
      index[id] = { route, persona, email, bytes: webp.length };
      console.error(`  ✔ ${id}  ${route}  ${(webp.length / 1024).toFixed(0)}kB`);
    } catch (e) {
      failures.push([id, e.message.split("\n")[0].slice(0, 90)]);
      console.error(`  ✘ ${id} — ${e.message.split("\n")[0].slice(0, 70)}`);
    }
  }

  if (mobileCtx) await mobileCtx.close();
  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify({ index, failures }, null, 1));
const total = Object.values(index).reduce((a, s) => a + s.bytes, 0);
console.error(`\n${Object.keys(index).length} captured, ${failures.length} failed, ${(total / 1048576).toFixed(2)} MB total`);
if (failures.length) console.error(failures.map(f => `  ${f[0]}: ${f[1]}`).join("\n"));
