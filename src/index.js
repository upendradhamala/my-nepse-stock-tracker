// NEPSE Alert — polls public market data and notifies you when an IPO opens
// or a price condition is hit. It never logs in or places orders for you.

import { fetchMarket } from "./provider.js";
import { evaluate } from "./rules.js";
import { alert } from "./notify.js";
import { loadConfig } from "./loadConfig.js";

async function tick(config) {
  try {
    const market = await fetchMarket(config);
    const alerts = evaluate(config, market);
    for (const a of alerts) {
      await alert(config, a.title, a.message);
    }
    if (alerts.length === 0) {
      process.stdout.write(".");
    }
  } catch (err) {
    console.error("\nPoll error:", err.message);
  }
}

async function main() {
  const config = await loadConfig();
  const interval = Math.max(5, config.pollSeconds || 30) * 1000;

  console.log("NEPSE Alert started.");
  console.log(`  mode: ${config.dataSource}  |  poll: ${interval / 1000}s`);
  console.log("  This tool only watches public data and alerts you.");
  console.log("  You place every order yourself in the TMS web app.");

  await tick(config);
  setInterval(() => tick(config), interval);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
