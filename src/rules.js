// Rules engine: turns market data into alerts, and remembers what it already
// fired so you don't get spammed every poll.
//
// Dedup state can be injected so it survives across process runs (the cron /
// single-shot deploy loads it from disk). The long-running loop just omits it
// and uses the module-level default, so its behaviour is unchanged.

const defaultState = {
  seenIpos: new Set(),
  firedPrice: new Map(), // key: `${symbol}:${when}:${price}` -> last-alerted ms
};

export function evaluate(config, market, state = defaultState) {
  const { seenIpos, firedPrice } = state;
  const alerts = [];

  // How often to re-remind while a price stays past its bound. 0 = one-shot
  // (alert once per crossing, the old behaviour). Default: re-nag every 30 min.
  const renotifyMs = (config.renotifyMinutes ?? 30) * 60 * 1000;
  const now = Date.now();

  // New IPO opened
  if (config.alertOnNewIpo && Array.isArray(market.ipos)) {
    for (const ipo of market.ipos) {
      if (ipo.status === "open" && !seenIpos.has(ipo.id)) {
        seenIpos.add(ipo.id);
        alerts.push({
          title: "🟢 New IPO open",
          message: `${ipo.symbol} — ${ipo.company} is now OPEN. Go place your order in TMS.`,
        });
      }
    }
  }

  // Price conditions. Each watch may carry a lower bound, an upper bound, or
  // both. Two forms are accepted:
  //   { symbol, when: "above"|"below", price }   (single condition)
  //   { symbol, below, above }                   (band — either field optional)
  for (const watch of config.priceWatch || []) {
    const ltp = market.prices?.[watch.symbol];
    if (typeof ltp !== "number") continue;

    // Normalize both forms into a list of { when, price } conditions.
    const conditions = [];
    if (watch.when && typeof watch.price === "number") {
      conditions.push({ when: watch.when, price: watch.price });
    }
    if (typeof watch.below === "number") conditions.push({ when: "below", price: watch.below });
    if (typeof watch.above === "number") conditions.push({ when: "above", price: watch.above });

    for (const c of conditions) {
      const hit =
        (c.when === "above" && ltp >= c.price) ||
        (c.when === "below" && ltp <= c.price);

      const key = `${watch.symbol}:${c.when}:${c.price}`;
      if (hit) {
        const last = firedPrice.get(key);
        // Alert if this is a fresh crossing, or if it's still past the bound
        // and the re-nag interval has elapsed since the last reminder.
        const due =
          last === undefined || (renotifyMs > 0 && now - last >= renotifyMs);
        if (due) {
          firedPrice.set(key, now);
          alerts.push({
            title: `📈 ${watch.symbol} ${c.when} ${c.price}`,
            message: `${watch.symbol} is at ${ltp} (condition: ${c.when} ${c.price}).`,
          });
        }
      } else {
        // Re-arm once price moves back across the threshold.
        firedPrice.delete(key);
      }
    }
  }

  return alerts;
}
