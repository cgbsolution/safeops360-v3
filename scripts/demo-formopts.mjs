// Read the real option lists off /observations/new so the trainer's
// "type exactly this" table matches the live tenant.
import { chromium } from "playwright-core";
const BASE = process.env.DEMO_BASE ?? "https://safeops360-v2.vercel.app";
const b = await chromium.launch({ headless: true, channel: "chromium" });
const ctx = await b.newContext({ viewport: { width: 1512, height: 945 } });
const p = await ctx.newPage();
await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await p.fill("#email", process.env.AS || "worker.it.nw@safeops360.in");
await p.fill("#password", "demo123");
await p.click('button[type="submit"]');
await p.waitForURL(u => !u.pathname.includes("/login"), { timeout: 60000 });

await p.goto(`${BASE}/observations/new`, { waitUntil: "domcontentloaded" });
await p.waitForLoadState("networkidle", { timeout: 25000 }).catch(() => {});
await p.waitForTimeout(3000);

const dump = await p.evaluate(() => {
  const out = {};
  document.querySelectorAll("select").forEach((s, i) => {
    const lab = s.closest("div")?.querySelector("label")?.textContent?.trim()
      || s.getAttribute("name") || s.id || `select_${i}`;
    out[lab] = [...s.options].map(o => o.textContent.trim()).filter(Boolean).slice(0, 40);
  });
  out.__labels = [...document.querySelectorAll("label")].map(l => l.textContent.trim()).slice(0, 60);
  out.__buttons = [...document.querySelectorAll("button")].map(x => x.textContent.trim()).filter(Boolean).slice(0, 30);
  return out;
});
console.log(JSON.stringify(dump, null, 1));
await b.close();
