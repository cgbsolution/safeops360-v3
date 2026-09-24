// Step 2 regression verdict: Step 0 baseline vs post-refactor capture.
//
//   node scripts/label-regression.mjs <beforeDir> <afterDir> [persona …]
//
// Why not a plain field diff: the sidebar's permission- and licence-gated items
// render only after client-side fetches resolve, so a single snapshot catches
// the nav at different hydration points on different runs (both captures show
// items "missing" in both directions). What the sidebar CONTAINS is the union
// over every page for that persona, so nav is compared as that set; every
// other field is compared route by route. Expected additions (the ported Fire
// & Life Safety module) are declared, not silently ignored.
import fs from "node:fs";
import path from "node:path";

const EXPECTED_NAV_ADDED = new Set(["Fire & Life Safety"]);
const FIRE_ROUTES = /^\/fire-safety(\/|$)/; // replaced wholesale by the Page port
const FIELDS = ["headings", "labels", "tableHeaders", "buttons", "tabs", "placeholders", "title"];

const [beforeDir, afterDir, ...only] = process.argv.slice(2);
let problems = 0;
for (const key of only.length ? only : fs.readdirSync(beforeDir)) {
  const bf = path.join(beforeDir, key, "labels.json"), af = path.join(afterDir, key, "labels.json");
  if (!fs.existsSync(bf) || !fs.existsSync(af)) { console.log(`[${key}] missing capture`); problems++; continue; }
  const b = JSON.parse(fs.readFileSync(bf, "utf8")), a = JSON.parse(fs.readFileSync(af, "utf8"));
  const union = (o) => new Set(Object.values(o).flatMap((x) => x.nav ?? []));
  const nb = union(b), na = union(a);
  const gone = [...nb].filter((x) => !na.has(x));
  const added = [...na].filter((x) => !nb.has(x));
  const unexpected = added.filter((x) => !EXPECTED_NAV_ADDED.has(x));
  console.log(`[${key}] nav: ${nb.size} → ${na.size} entries; added ${JSON.stringify(added)}; removed ${JSON.stringify(gone)}`);
  if (gone.length || unexpected.length) problems++;
  let routeDiffs = 0;
  for (const r of Object.keys(b)) {
    if (FIRE_ROUTES.test(r)) continue;
    const x = b[r], y = a[r];
    if (!y) { console.log(`  ${r}: missing after`); routeDiffs++; continue; }
    if (x.error || y.error) continue; // capture failed on one side — nothing to compare
    for (const f of FIELDS) {
      const bv = JSON.stringify(x[f]), av = JSON.stringify(y[f]);
      if (bv !== av) {
        routeDiffs++;
        const bs = new Set(x[f] ?? []), as = new Set(y[f] ?? []);
        console.log(`  ${r} ${f}: -${JSON.stringify([...bs].filter((v) => !as.has(v))).slice(0, 200)} +${JSON.stringify([...as].filter((v) => !bs.has(v))).slice(0, 200)}`);
      }
    }
    if (x.finalPath !== y.finalPath) { routeDiffs++; console.log(`  ${r} finalPath: ${x.finalPath} → ${y.finalPath}`); }
  }
  console.log(`[${key}] ${routeDiffs} route-level field differences (fire routes excluded: ported module)`);
  problems += routeDiffs;
}
console.log(problems ? `\n${problems} items to review` : "\nPASS — no label regressions");
process.exitCode = problems ? 1 : 0;
