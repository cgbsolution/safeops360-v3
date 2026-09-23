// Render the built trainer in both themes and report broken images / JS errors.
//   node scripts/demo-selfcheck.mjs <path-to-html> <out-dir>
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";

const FILE = pathToFileURL(process.argv[2]).href;
const OUT = process.argv[3];
const b = await chromium.launch({ headless: true, channel: "chromium" });

for (const theme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, colorScheme: theme });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });

  await p.goto(FILE, { waitUntil: "load" });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/self-${theme}-intro.png` });

  await p.goto("about:blank");
  await p.goto(FILE + (process.argv[4] || "#obs/4"), { waitUntil: "load" });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/self-${theme}-step.png`, fullPage: true });

  const stats = await p.evaluate(() => ({
    frames: document.querySelectorAll(".frame img").length,
    broken: [...document.querySelectorAll("img")].filter(i => !i.complete || i.naturalWidth === 0).length,
    flows: document.querySelectorAll(".flowbtn").length,
    say: !!document.querySelector(".box.say"),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyFg: getComputedStyle(document.body).color,
    railBg: getComputedStyle(document.querySelector(".rail")).backgroundColor,
    hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  console.log(theme.toUpperCase(), JSON.stringify(stats));
  if (errs.length) console.log("  errors:", errs.slice(0, 5));
  await ctx.close();
}
await b.close();
