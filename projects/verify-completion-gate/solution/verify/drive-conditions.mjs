/** Layer 3: parse out/orders.csv and assert done.json conditions. */
import { readFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeOrdersCsv } from "../src/export-orders.js";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const donePath = process.argv[2] || join(root, "verify", "done.json");
const outPath = join(root, "out", "orders.csv");
function fail(msg) { console.error("\nLAYER 3 FAIL — " + msg); process.exitCode = 1; }
function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let i = 0; let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === "\"") { if (s[i + 1] === "\"") { field += "\""; i += 2; continue; } inQuotes = false; i += 1; continue; }
      field += c; i += 1; continue;
    }
    if (c === "\"") { inQuotes = true; i += 1; continue; }
    if (c === ",") { row.push(field); field = ""; i += 1; continue; }
    if (c === "\r") { i += 1; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i += 1; continue; }
    field += c; i += 1;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") rows.pop();
  return rows;
}
function needsQuoting(v) { return /[",\n\r]/.test(v); }
function quotedInRaw(rawLine, value) {
  if (!needsQuoting(value)) return true;
  const escaped = value.replace(/"/g, "\"\"");
  return rawLine.includes("\"" + escaped + "\"");
}
const done = JSON.parse(readFileSync(donePath, "utf8"));
const conditions = done.conditions || [];
const fixtures = JSON.parse(readFileSync(join(root, "fixtures", "orders.json"), "utf8"));
rmSync(join(root, "out"), { recursive: true, force: true });
writeOrdersCsv(outPath);
const exists = existsSync(outPath);
const raw = exists ? readFileSync(outPath, "utf8") : "";
const rawLines = raw.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l, idx, arr) => !(idx === arr.length - 1 && l === ""));
const parsed = exists ? parseCsv(raw) : [];
const dataRows = parsed.slice(1);
const results = [];
function check(id, ok, detail) { const cond = conditions.find((c) => c.id === id); results.push({ id, ok, must: cond ? cond.must : id, detail }); }
const headerOk = exists && rawLines[0] === "id,name,note";
check("csv-1", headerOk, headerOk ? null : { expected: "header id,name,note", actual: exists ? rawLines[0] : "missing file", where: "src/export-orders.js" });
const countOk = dataRows.length === fixtures.length;
check("csv-2", countOk, countOk ? null : { expected: fixtures.length + " data rows", actual: dataRows.length + " data rows", observed: "unquoted commas often break parse", where: "out/orders.csv" });
const badCols = dataRows.map((r, i) => ({ i, n: r.length, r })).filter((x) => x.n !== 3);
const colsOk = dataRows.length > 0 && badCols.length === 0;
check("csv-3", colsOk, colsOk ? null : { expected: "every data row has 3 fields", actual: badCols[0] ? ("row " + (badCols[0].i + 1) + " has " + badCols[0].n + " fields: " + JSON.stringify(badCols[0].r)) : "no rows", observed: badCols[0] ? rawLines[badCols[0].i + 1] : "", where: "src/export-orders.js toCsvRow" });
let quoteOk = colsOk && countOk; let quoteDetail = null;
if (quoteOk) {
  for (let i = 0; i < fixtures.length; i++) {
    const fix = fixtures[i]; const row = dataRows[i]; const rawLine = rawLines[i + 1] || "";
    const expected = [fix.id, fix.name, fix.note];
    for (let c = 0; c < 3; c++) {
      if (row[c] !== expected[c]) { quoteOk = false; quoteDetail = { expected: JSON.stringify(expected[c]), actual: JSON.stringify(row[c]), observed: rawLine, where: "src/export-orders.js", satisfied: "values must match fixtures; do not strip commas" }; break; }
      if (!quotedInRaw(rawLine, expected[c])) { quoteOk = false; quoteDetail = { expected: "quoted field for " + JSON.stringify(expected[c]), actual: "unquoted or bad escape", observed: rawLine, where: "src/export-orders.js toCsvRow", satisfied: "RFC 4180 quote fields with comma/quote/newline; stripping commas does not satisfy" }; break; }
    }
    if (!quoteOk) break;
  }
} else { quoteDetail = { expected: "stable 3-col round-trip", actual: "skipped; fix csv-2/csv-3 first", where: "out/orders.csv" }; }
check("csv-4", quoteOk, quoteDetail);
const failed = results.filter((r) => !r.ok);
const passing = results.length - failed.length;
if (failed.length === 0) {
  console.log("LAYER 3  pass   (" + results.length + "/" + results.length + " conditions)");
} else {
  const first = failed[0]; const d = first.detail || {};
  fail("condition " + first.id + " (" + failed.length + " of " + results.length + " conditions failing, " + passing + " passing)\n\n  Condition: " + first.must + "\n  Expected:  " + (d.expected || "(see condition)") + "\n  Actual:    " + (d.actual || "failed") + "\n  Observed:  " + (d.observed || "") + "\n  Where:     " + (d.where || "src/export-orders.js") + "\n  Satisfied when: " + (d.satisfied || first.must));
}
