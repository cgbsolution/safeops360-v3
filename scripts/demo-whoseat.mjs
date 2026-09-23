// For each route that came back denied/blank, find a persona that can actually see it.
// Prints a ready-to-paste persona assignment.
import { chromium } from "playwright-core";
const BASE = process.env.DEMO_BASE ?? "https://safeops360-v2.vercel.app";

const P = {
  admin: "admin.it.nw@safeops360.in",
  sysadmin: "system-admin.hr.nw@safeops360.in",
  head: "plant-head.it.nw@safeops360.in",
  priya: "priya.nair@safeops360.in",
  corp: "corporate-hse.it.nw@safeops360.in",
  cro: "anand.krishnan@safeops360.in",
  maint: "maintenance-head.it.nw@safeops360.in",
};

const ROUTES = [
  "/facilities", "/facilities/social-compliance", "/facilities/certifications",
  "/facilities/map", "/facilities/compare",
  "/safety-culture", "/safety-culture/leading-lagging", "/safety-culture/bbs-quality",
  "/safety-culture/leadership", "/safety-culture/perception",
  "/configuration/dropdowns", "/configuration/workflows", "/configuration/risk-matrices",
  "/loto", "/loto/executions", "/brsr", "/brsr/trends",
  "/ppe", "/training-intelligence", "/skill-matrix/correlation",
];

const b = await chromium.launch({ headless: true, channel: "chromium" });
const winners = {};

for (const [tag, email] of Object.entries(P)) {
  const ctx = await b.newContext({ viewport: { width: 1512, height: 945 } });
  const p = await ctx.newPage();
  try {
    await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await p.fill("#email", email); await p.fill("#password", "demo123");
    await p.click('button[type="submit"]');
    await p.waitForURL(u => !u.pathname.includes("/login"), { timeout: 60000 });
  } catch { console.log(`LOGIN FAIL ${tag}`); await ctx.close(); continue; }

  for (const route of ROUTES) {
    if (winners[route]) continue;                      // already solved
    try {
      await p.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 40000 });
      await p.waitForLoadState("networkidle", { timeout: 18000 }).catch(() => {});
      await p.waitForTimeout(1800);
      const t = ((await p.textContent("body")) || "").replace(/\s+/g, " ");
      const denied = /Access Denied|Missing permission|Screen not enabled|don't have permission/i.test(t);
      const blank = t.length < 9000;
      if (!denied && !blank) {
        winners[route] = tag;
        const hrefs = await p.$$eval("a[href]", as => as.map(a => a.getAttribute("href")));
        const det = hrefs.find(h => h && new RegExp("^" + route.replace(/\//g, "\\/") + "\\/[a-z0-9]{18,}").test(h));
        console.log(`✔ ${route}  →  ${tag}${det ? "   detail:" + det : ""}`);
      }
    } catch { /* try next persona */ }
  }
  await ctx.close();
}

const unsolved = ROUTES.filter(r => !winners[r]);
console.log("\nUNSOLVED (no persona could see it):\n" + (unsolved.join("\n") || "none"));
await b.close();
