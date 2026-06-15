// Single-shot runner for the cron / GitHub Actions deploy.
//
// Unlike index.js (which loops forever), this does exactly one poll and exits:
//   load state -> fetch market -> evaluate rules -> send Telegram -> save state
//
// Dedup state lives in a JSON file so it survives between runs (GitHub Actions
// restores/saves it via cache). No desktop popup and no web server here —
// alerts go out over Telegram only.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { fetchMarket } from "./provider.js";
import { evaluate } from "./rules.js";
import { alert } from "./notify.js";
import { loadConfig } from "./loadConfig.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const STATE_FILE = join(root, ".state.json");

async function loadState() {
  try {
    const raw = JSON.parse(await readFile(STATE_FILE, "utf8"));
    return {
      seenIpos: new Set(raw.seenIpos || []),
      // firedPrice is [ [key, lastAlertedMs], ... ] -> Map.
      firedPrice: new Map(raw.firedPrice || []),
    };
  } catch {
    return { seenIpos: new Set(), firedPrice: new Map() };
  }
}

async function saveState(state) {
  const out = {
    seenIpos: [...state.seenIpos],
    firedPrice: [...state.firedPrice], // Map -> [ [key, ms], ... ]
    savedAt: new Date().toISOString(),
  };
  await writeFile(STATE_FILE, JSON.stringify(out, null, 2));
}

async function main() {
  const config = await loadConfig();
  const state = await loadState();

  // Log which symbols this run is actually watching, so the Actions log makes
  // it obvious whether the PRICE_WATCH secret is the watchlist you expect.
  const watched = (config.priceWatch || []).map((w) => w.symbol).join(", ") || "(none)";
  console.log(`Watching ${(config.priceWatch || []).length} symbol(s): ${watched}`);

  const market = await fetchMarket(config);
  const alerts = evaluate(config, market, state);

  for (const a of alerts) {
    await alert(config, a.title, a.message);
  }

  await saveState(state);
  console.log(
    `Run complete: ${Object.keys(market.prices || {}).length} symbols, ${alerts.length} alert(s) sent.`
  );
}

main().catch((err) => {
  console.error("Run failed:", err);
  process.exit(1);
});
