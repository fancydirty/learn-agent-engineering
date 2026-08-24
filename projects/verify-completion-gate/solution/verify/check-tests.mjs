import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const donePath = process.argv[2] || join(root, "verify", "done.json");
const done = JSON.parse(readFileSync(donePath, "utf8"));
const expected = done.expectedTestCount;
const smoke = readFileSync(join(root, "test", "smoke.test.js"), "utf8");
const observed = (smoke.match(/\btest\s*\(/g) || []).length;
if (typeof expected !== "number" || observed !== expected) {
  console.error("LAYER 2 FAIL — test count mismatch (or missing expectedTestCount).");
  console.error("  Expected: " + expected + "  Observed in test/smoke.test.js: " + observed);
  console.error("  Satisfied when: smoke tests declare exactly expectedTestCount tests.");
  console.error("  Do not lower expectedTestCount to make the gate pass.");
  process.exitCode = 1;
} else {
  console.log("LAYER 2  pass   (" + observed + "/" + expected + " tests, count matches recorded total)");
}
