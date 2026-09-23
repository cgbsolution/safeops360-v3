// Recon for the sales Demo Trainer capture run.
// Probes persona logins + route health on the live app so the capture
// manifest only contains screens that actually render with data.
//   node scripts/demo-recon.mjs > recon.json
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.DEMO_BASE ?? "https://safeops360-v2.vercel.app";
const PW = "demo123";

const PERSONAS = [
  "priya.nair@safeops360.in",
  "corporate-hse.it.nw@safeops360.in",
  "plant-head.it.nw@safeops360.in",
  "worker.it.nw@safeops360.in",
  "supervisor.it.nw@safeops360.in",
  "maintenance-head.it.nw@safeops360.in",
  "safety-officer.it.nw@safeops360.in",
  "anjali.verma@safeops360.in",
  "rohan.bhatt@safeops360.in",
];

// Routes to probe, and for list screens the href pattern of a detail record.
const ROUTES = [
  ["/inbox"], ["/dashboard"], ["/dashboard/daily"], ["/signals"], ["/scorecard"],
  ["/observations", /\/observations\/[a-z0-9]{20,}/],
  ["/near-miss", /\/near-miss\/[a-z0-9]{20,}/],
  ["/ptw", /\/ptw\/[a-z0-9]{20,}/],
  ["/loto", /\/loto\/[a-z0-9]{20,}/],
  ["/loto/executions", /\/loto\/executions\/[a-z0-9]{20,}/],
  ["/flra", /\/flra\/[a-z0-9]{20,}/],
  ["/incidents", /\/incidents\/[a-z0-9]{20,}/],
  ["/field-reports", /\/field-reports\/[a-z0-9]{20,}/],
  ["/hira", /\/hira\/[a-z0-9]{20,}/],
  ["/hira/reviews"],
  ["/eai", /\/eai\/[a-z0-9]{20,}/],
  ["/eai/reviews"],
  ["/risk-register"], ["/risk-register?tab=analytics"],
  ["/capa", /\/capa\/[a-z0-9]{20,}/],
  ["/moc", /\/moc\/[a-z0-9]{20,}/],
  ["/compliance", /\/compliance\/[A-Z0-9-]+/],
  ["/cams"], ["/cams/programme", /\/cams\/programme\/[a-z0-9]{20,}/],
  ["/cams/calendar"],
  ["/cams/audits", /\/cams\/audits\/[a-z0-9]{20,}/],
  ["/cams/audits/my-checkpoints"],
  ["/cams/engagements"], ["/cams/templates", /\/cams\/templates\/[a-z0-9]{20,}/],
  ["/cams/findings", /\/cams\/findings\/[a-z0-9]{20,}/],
  ["/cams/capa"], ["/cams/compliance"], ["/cams/assurance"], ["/cams/audits?tab=analytics"], ["/cams/audits?tab=benchmarking"],
  ["/erm"], ["/erm/register", /\/erm\/register\/[a-z0-9]{20,}/],
  ["/erm/heatmap"], ["/erm/network"], ["/erm/treatments"],
  ["/erm/kris"], ["/erm/appetite"], ["/erm/appetite/breaches"],
  ["/erm/compliance"], ["/erm/loss"],
  ["/erm/rca", /\/erm\/rca\/[a-z0-9]{20,}/],
  ["/erm/rca/analytics"], ["/erm/rca/map"],
  ["/erm/reviews"], ["/erm/board-packs"], ["/erm/reports"],
  ["/erm/bcm"], ["/erm/bcm/processes"], ["/erm/bcm/dependency-map"],
  ["/erm/bcm/plans"], ["/erm/bcm/crisis"], ["/erm/bcm/exercises"],
  ["/erm/bcm/scenarios"], ["/erm/bcm/horizon"],
  ["/erm/controls"], ["/erm/controls/library"], ["/erm/controls/matrix"], ["/erm/controls/deficiencies"],
  ["/erm/vendors"], ["/erm/vendors/register"], ["/erm/vendors/esg"],
  ["/erm/insurance"], ["/erm/insurance/policies"], ["/erm/insurance/coverage-gap"],
  ["/facilities", /\/facilities\/[a-z0-9]{20,}/],
  ["/facilities/social-compliance"], ["/facilities/certifications"],
  ["/facilities/map"], ["/facilities/compare"], ["/facilities/reports"],
  ["/brsr", /\/brsr\/[a-z0-9]{20,}/], ["/brsr/trends"],
  ["/training-intelligence"], ["/training"], ["/training/assignments"],
  ["/training/programs"], ["/training?tab=analytics"], ["/training/certificates"],
  ["/skill-matrix"], ["/skill-matrix/rollup"], ["/skill-matrix/correlation"],
  ["/safety-culture"], ["/safety-culture/leadership"], ["/safety-culture/leading-lagging"],
  ["/safety-culture/bbs-quality"], ["/safety-culture/perception"], ["/safety-culture/recognition"],
  ["/ppe"], ["/inspections", /\/inspections\/[a-z0-9]{20,}/],
  ["/inspections/inbox"], ["/inspections/findings"], ["/inspections/equipment"],
  ["/inspections/types"], ["/inspections/checklists"], ["/inspections?tab=analytics"],
  ["/manhours"], ["/manhours/kpi"], ["/manhours/performance"], ["/manhours/performance?view=trends"],
  ["/anomalies"], ["/audit-trail"], ["/licence"],
  ["/configuration"], ["/configuration/roles"], ["/configuration/users"],
  ["/configuration/workflows"], ["/configuration/dropdowns"],
  ["/configuration/agents"], ["/configuration/risk-matrices"], ["/configuration/hazards"],
  ["/emergency-response"], ["/fire-safety"], ["/industrial-hygiene"],
  ["/occupational-health"], ["/process-safety"], ["/bbs"],
];

const b = await chromium.launch({ headless: true, channel: "chromium" });
const out = { base: BASE, personas: {}, routes: {} };

for (const email of PERSONAS) {
  const ctx = await b.newContext({ viewport: { width: 1512, height: 945 } });
  const p = await ctx.newPage();
  try {
    await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.fill("#email", email);
    await p.fill("#password", PW);
    await p.click('button[type="submit"]');
    await p.waitForURL(u => !u.pathname.includes("/login"), { timeout: 45000 });
    const landing = new URL(p.url()).pathname;
    const who = await p.locator("header").first().textContent().catch(() => "");
    out.personas[email] = { ok: true, landing, header: (who || "").replace(/\s+/g, " ").trim().slice(0, 120) };
    console.error(`✔ ${email} → ${landing}`);
  } catch (e) {
    out.personas[email] = { ok: false, error: e.message.split("\n")[0].slice(0, 120) };
    console.error(`✘ ${email} — ${e.message.split("\n")[0].slice(0, 80)}`);
  }
  await ctx.close();
}

// Route probe as the two broadest personas.
for (const email of ["priya.nair@safeops360.in", "corporate-hse.it.nw@safeops360.in"]) {
  if (!out.personas[email]?.ok) continue;
  const ctx = await b.newContext({ viewport: { width: 1512, height: 945 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await p.fill("#email", email); await p.fill("#password", PW);
  await p.click('button[type="submit"]');
  await p.waitForURL(u => !u.pathname.includes("/login"), { timeout: 45000 });

  for (const [route, detailRe] of ROUTES) {
    const key = route;
    out.routes[key] ??= {};
    try {
      const resp = await p.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(900);
      const final = new URL(p.url()).pathname;
      const txt = (await p.textContent("body").catch(() => "")) || "";
      const denied = final.includes("access-denied") || /not authori[sz]ed|access denied|403/i.test(txt.slice(0, 3000));
      let detail = null;
      if (detailRe) {
        const hrefs = await p.$$eval("a[href]", as => as.map(a => a.getAttribute("href")));
        detail = hrefs.find(h => h && detailRe.test(h)) ?? null;
      }
      out.routes[key][email] = {
        status: resp?.status() ?? 0, final, chars: txt.length,
        denied, detail,
        err: /something went wrong|failed to (load|fetch)|internal server error/i.test(txt.slice(0, 4000)),
      };
      console.error(`  ${route} [${email.split("@")[0]}] ${txt.length}c${denied ? " DENIED" : ""}${detail ? " →" + detail : ""}`);
    } catch (e) {
      out.routes[key][email] = { error: e.message.split("\n")[0].slice(0, 100) };
      console.error(`  ${route} [${email.split("@")[0]}] ERROR`);
    }
  }
  await ctx.close();
}

await b.close();
fs.writeFileSync(process.argv[2] || "recon.json", JSON.stringify(out, null, 1));
console.error("written");
