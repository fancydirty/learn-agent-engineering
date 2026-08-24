/**
 * Export orders from fixtures/orders.json to out/orders.csv.
 * Columns: id, name, note.
 *
 * INTENTIONALLY FRAGILE: fields are joined with commas and never quoted.
 * A note that contains a comma will break the row when the file is reopened.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function toCsvRow(fields) {
  // Planted bug: no RFC 4180 quoting/escaping.
  return fields.join(",");
}

export function exportOrders(orders) {
  const header = toCsvRow(["id", "name", "note"]);
  const rows = orders.map((o) => toCsvRow([o.id, o.name, o.note]));
  return [header, ...rows].join("\n") + "\n";
}

export function writeOrdersCsv(outPath = join(root, "out", "orders.csv")) {
  const orders = JSON.parse(
    readFileSync(join(root, "fixtures", "orders.json"), "utf8"),
  );
  mkdirSync(dirname(outPath), { recursive: true });
  const csv = exportOrders(orders);
  writeFileSync(outPath, csv, "utf8");
  return outPath;
}

const isMain =
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const path = writeOrdersCsv();
  console.log(`Wrote ${path}`);
}
