// Loads config.json, then overlays anything that should stay out of the repo.
//
// The watchlist (priceWatch) is your trading plan — symbols and target prices.
// To keep it private even in a PUBLIC repo, it can be supplied as JSON via the
// PRICE_WATCH env var (a GitHub Secret in deploy, .env locally). If the env var
// is missing, we fall back to the priceWatch in config.json.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function loadConfig() {
  const config = JSON.parse(await readFile(join(root, "config.json"), "utf8"));

  if (process.env.PRICE_WATCH) {
    try {
      const parsed = JSON.parse(process.env.PRICE_WATCH);
      if (Array.isArray(parsed)) config.priceWatch = parsed;
      else console.error("PRICE_WATCH is not a JSON array — using config.json watchlist.");
    } catch (err) {
      console.error("PRICE_WATCH is not valid JSON — using config.json watchlist:", err.message);
    }
  }

  return config;
}
