import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
const FILE = pathToFileURL(process.argv[2]).href;
const b = await chromium.launch({ headless: true, channel: "chromium" });
const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
p.on("pageerror", e => console.log("PAGEERROR", e.message));
for (const h of ["", "#obs/3", "#cams-audit/5", "#erm/2", "#nope/9"]) {
  await p.goto("about:blank");
  await p.goto(FILE + h, { waitUntil: "load" });
  await p.waitForTimeout(1400);
  console.log(JSON.stringify({
    hash: h || "(none)",
    flow: await p.textContent("#tbFlow"),
    count: (await p.textContent("#tbCount")).slice(0, 44),
    doText: (await p.textContent(".do-text")).slice(0, 54),
    say: !!(await p.$(".box.say")),
    img: !!(await p.$(".frame img")),
  }));
}
await b.close();
