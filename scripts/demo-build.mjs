// Assemble the single-file Demo Trainer.
//
//   node scripts/demo-build.mjs
//
// Reads  docs/demo/trainer.template.html   (page + content, with a /*__SHOTS__*/ marker)
//        docs/demo/shots/*.webp            (captured by demo-capture.mjs)
// Writes docs/demo/SafeOps360_Demo_Trainer.html — self-contained, no external
// requests, safe to email or publish as an Artifact.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] || "../docs/demo");
const TPL = path.join(ROOT, "trainer.template.html");
const SHOTDIR = path.join(ROOT, "shots");
const OUT = path.join(ROOT, "SafeOps360_Demo_Trainer.html");

if (!fs.existsSync(TPL)) { console.error(`missing template: ${TPL}`); process.exit(1); }

const files = fs.existsSync(SHOTDIR)
  ? fs.readdirSync(SHOTDIR).filter(f => f.endsWith(".webp")).sort()
  : [];

const CONTENT_PATH = path.join(ROOT, "trainer-content.js");
if (!fs.existsSync(CONTENT_PATH)) { console.error(`missing content: ${CONTENT_PATH}`); process.exit(1); }
const contentSrc = fs.readFileSync(CONTENT_PATH, "utf8");
// Only inline screens the content actually shows — shots/ stays a full library,
// the shipped HTML stays lean.
const used = new Set([...contentSrc.matchAll(/shot:\s*"([a-z0-9-]+)"/g)].map(m => m[1]));

const entries = [];
let bytes = 0;
for (const f of files) {
  const id = path.basename(f, ".webp");
  if (!used.has(id)) continue;
  const buf = fs.readFileSync(path.join(SHOTDIR, f));
  bytes += buf.length;
  entries.push(`${JSON.stringify(id)}:"data:image/webp;base64,${buf.toString("base64")}"`);
}

const shotsJs = `const SHOTS = {\n${entries.join(",\n")}\n};`;
const tpl = fs.readFileSync(TPL, "utf8");
if (!tpl.includes("/*__SHOTS__*/")) { console.error("template has no /*__SHOTS__*/ marker"); process.exit(1); }

const CONTENT = path.join(ROOT, "trainer-content.js");
if (!fs.existsSync(CONTENT)) { console.error(`missing content: ${CONTENT}`); process.exit(1); }
const contentJs = fs.readFileSync(CONTENT, "utf8");

const html = tpl
  .replace("/*__SHOTS__*/", () => shotsJs)
  .replace("/*__CONTENT__*/", () => contentJs);
fs.writeFileSync(OUT, html);

const mb = n => (n / 1048576).toFixed(2) + " MB";
console.log(`${entries.length} screenshots inlined (${mb(bytes)} raw → ${mb(bytes * 4 / 3)} base64)`);
console.log(`${OUT}  →  ${mb(Buffer.byteLength(html))}`);
if (Buffer.byteLength(html) > 15.5 * 1048576)
  console.warn("⚠ over ~15.5 MB — re-encode shots at lower quality before publishing as an Artifact");

// which referenced shot ids have no image behind them?
const referenced = [...contentJs.matchAll(/shot:\s*"([a-z0-9-]+)"/g)].map(m => m[1]);
const have = new Set(entries.map(e => JSON.parse(e.split(":")[0])));
const missing = [...new Set(referenced)].filter(r => !have.has(r));
if (missing.length) console.warn(`⚠ ${missing.length} referenced but not captured: ${missing.join(", ")}`);
const unused = [...have].filter(h => !referenced.includes(h));
if (unused.length) console.log(`(${unused.length} captured but unused: ${unused.join(", ")})`);
