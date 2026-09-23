import { chromium } from "playwright-core";
const BASE = process.env.DEMO_BASE ?? "https://safeops360-v2.vercel.app";
const b = await chromium.launch({ headless: true, channel: "chromium" });
const ctx = await b.newContext({ viewport: { width: 1512, height: 945 } });
const p = await ctx.newPage();
await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });

// what personas does the login screen advertise?
const api = await p.evaluate(async () => {
  const tries = ["/api/demo-users", "/api/users/demo", "/api/auth/demo-personas", "/api/users?demo=1"];
  const out = {};
  for (const u of tries) {
    try { const r = await fetch(u); out[u] = r.status === 200 ? (await r.text()).slice(0, 1500) : r.status; }
    catch (e) { out[u] = "ERR"; }
  }
  return out;
});
console.log("API PROBE:", JSON.stringify(api, null, 1).slice(0, 2000));

await p.fill("#email", "corporate-hse.it.nw@safeops360.in");
await p.fill("#password", "demo123");
await p.click('button[type="submit"]');
await p.waitForURL(u => !u.pathname.includes("/login"), { timeout: 60000 });

for (const route of ["/erm", "/erm/register", "/erm/heatmap", "/erm/kris", "/erm/bcm", "/erm/controls/library", "/erm/vendors/register", "/licence"]) {
  await p.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(2200);
  const t = ((await p.textContent("main").catch(() => null)) || "").replace(/\s+/g, " ").trim();
  console.log(`\n=== ${route} (${t.length}c)\n${t.slice(0, 480)}`);
}
await b.close();
