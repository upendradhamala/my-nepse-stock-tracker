// Prints your local watchlist (from .env's PRICE_WATCH) as a single line,
// ready to paste into the GitHub `PRICE_WATCH` secret. Run with:
//   npm run watchlist:secret
//
// This keeps your two copies — .env (local) and the GitHub Secret (cloud) —
// in sync without hand-editing JSON.

const raw = process.env.PRICE_WATCH;

if (!raw) {
  console.error(
    "PRICE_WATCH not found. Run via `npm run watchlist:secret` (it loads .env).",
  );
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  console.error("PRICE_WATCH in .env is not valid JSON:", err.message);
  process.exit(1);
}

console.log("\nCurrent watchlist:");
for (const w of parsed) {
  const bits = [];
  if (typeof w.below === "number") bits.push(`below ${w.below}`);
  if (typeof w.above === "number") bits.push(`above ${w.above}`);
  if (w.when && typeof w.price === "number") bits.push(`${w.when} ${w.price}`);
  console.log(`  • ${w.symbol}: ${bits.join(", ")}`);
}

console.log("\nPaste this as the GitHub PRICE_WATCH secret value:\n");
console.log(JSON.stringify(parsed)); // minified, single line
console.log("");
