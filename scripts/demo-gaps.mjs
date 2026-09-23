// Probe the routes that came back denied / thin / link-less in recon,
// to find a persona that can see them and how their rows are linked.
import { chromium } from "playwright-core";
const BASE = process.env.DEMO_BASE ?? "https://safeops360-v2.vercel.app";
const PW = "demo123";

const WHO = ["plant-head.it.nw@safeops360.in", "rohan.bhatt@safeops360.in",
             "maintenance-head.it.nw@safeops360.in", "corporate-hse.it.nw@safeops360.in"];
const DENIED = ["/safety-culture", "/safety-culture/leading-lagging", "/configuration/roles", "/configuration/users"];
const THIN = ["/loto", "/loto/executions", "/brsr"];
const LINKLESS = ["/erm/register", "/loto", "/loto/executions", "/brsr", "/erm/loss", "/erm/kris"];

const b = await chromium.launch({ headless: true, channel: "chromium" });

async function login(email) {
  const ctx = await b.newContext({ viewport: { width: 1512, height: 945 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await p.fill("#email", email); await p.fill("#password", PW);
  await p.click('button[type="submit"]');
  await p.waitForURL(u => !u.pathname.includes("/login"), { timeout: 60000 });
  return { ctx, p };
}

for (const email of WHO) {
  const { ctx, p } = await login(email);
  const tag = email.split("@")[0];
  for (const route of DENIED) {
    await p.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(1200);
    const t = (await p.textContent("body")) || "";
    const bad = p.url().includes("access-denied") || /access denied|not authori/i.test(t.slice(0, 2500));
    console.log(`${bad ? "✘" : "✔"} ${route}  [${tag}]  ${t.length}c`);
  }
  await ctx.close();
}

// what do the thin pages actually say, and how are rows linked?
const { ctx, p } = await login("corporate-hse.it.nw@safeops360.in");
for (const route of THIN) {
  await p.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1800);
  const t = ((await p.textContent("main").catch(() => null)) || (await p.textContent("body")) || "").replace(/\s+/g, " ");
  console.log(`\n--- ${route} (${t.length}c) ---\n${t.slice(0, 700)}`);
}
for (const route of LINKLESS) {
  await p.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1800);
  const info = await p.evaluate(() => ({
    anchors: [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href")).filter(h => h && h !== "#").slice(-25),
    rows: document.querySelectorAll("tbody tr").length,
    clickable: document.querySelectorAll('[role="row"],tbody tr[class*="cursor"]').length,
  }));
  console.log(`\n=== ${route} rows=${info.rows} clickableRows=${info.clickable}\n  ${info.anchors.join("\n  ")}`);
}
await ctx.close();
await b.close();
