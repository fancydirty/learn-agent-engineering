/**
 * Weak smoke tests — existence and line count only.
 * These pass even when CSV quoting is wrong (the pedagogical trap).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeOrdersCsv } from "../src/export-orders.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "out", "orders.csv");

test("export writes out/orders.csv", () => {
  rmSync(join(root, "out"), { recursive: true, force: true });
  writeOrdersCsv(outPath);
  assert.equal(existsSync(outPath), true, "expected out/orders.csv to exist");
});

test("csv has a header line plus one line per fixture order", () => {
  writeOrdersCsv(outPath);
  const orders = JSON.parse(
    readFileSync(join(root, "fixtures", "orders.json"), "utf8"),
  );
  const lines = readFileSync(outPath, "utf8").trimEnd().split("\n");
  assert.equal(
    lines.length,
    orders.length + 1,
    "expected header + one row per order (line count only — does not parse CSV)",
  );
});
