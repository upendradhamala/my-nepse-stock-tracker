// Data provider for NEPSE.
//
// IMPORTANT: This reads PUBLIC market data only. It does NOT log into your TMS
// account and does NOT place orders. When an alert fires, you place the order
// yourself in the TMS web app. That keeps you inside the platform's rules.
//
// Two modes (set in config.json -> "dataSource"):
//   "mock" : returns fake data so you can see the full alert pipeline work now.
//   "live" : calls a real public NEPSE data endpoint you wire in below.

let mockTick = 0;

// --- MOCK MODE -------------------------------------------------------------
// Simulates: prices drifting, and a new IPO appearing after a few polls.
function fetchMock() {
  mockTick += 1;
  const ipos =
    mockTick >= 3
      ? [{ id: "ipo-demo-1", symbol: "DEMOIPO", company: "Demo Hydropower Ltd", status: "open" }]
      : [];

  const prices = {
    NABIL: 590 + mockTick * 5, // climbs past 600 around tick 3
    NICA: 360 - mockTick * 4,  // drops below 350 around tick 3
  };

  return { ipos, prices };
}

// --- LIVE MODE -------------------------------------------------------------
// Reads PUBLIC NEPSE data from a JSON source you trust (e.g. a sharesansar /
// merolagani / NEPSE-proxy endpoint). It still NEVER logs in or places orders.
//
// NEPSE has no single official public JSON API, so this is written to be
// source-agnostic: point `liveBaseUrl` at your chosen base, and (optionally)
// override the two paths via `livePaths` in config.json. Each endpoint may
// return either a bare array or an object wrapping the array under a common
// key (`data`, `content`, `result`, ...). Field names are normalized below, so
// most public NEPSE JSON feeds work without code changes.
//
// Output shape (same as fetchMock):
//   { ipos: [{ id, symbol, company, status, price? }], prices: { SYMBOL: number } }

const DEFAULT_PATHS = { prices: "/live-market", ipos: "/ipo/open" };
const REQUEST_TIMEOUT_MS = 10_000;

// Pull the row array out of whatever envelope the endpoint used.
function asRows(json) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    for (const key of ["data", "content", "result", "results", "rows", "list"]) {
      if (Array.isArray(json[key])) return json[key];
    }
  }
  return [];
}

// First defined value among several possible field names (case-insensitive).
function pick(row, names) {
  for (const name of names) {
    if (row[name] != null && row[name] !== "") return row[name];
    const lower = name.toLowerCase();
    for (const key of Object.keys(row)) {
      if (key.toLowerCase() === lower && row[key] != null && row[key] !== "") {
        return row[key];
      }
    }
  }
  return undefined;
}

// Parse a price that may arrive as "1,234.50" (string) or 1234.5 (number).
function toPrice(value) {
  if (value == null) return NaN;
  return Number(String(value).replace(/,/g, "").trim());
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}`);
    }
    return await res.json();
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function parsePrices(json) {
  const prices = {};
  for (const row of asRows(json)) {
    const symbol = pick(row, ["symbol", "stockSymbol", "ticker", "scrip"]);
    const price = toPrice(
      pick(row, ["ltp", "lastTradedPrice", "lastUpdatedPrice", "close", "closePrice", "price"])
    );
    if (symbol && Number.isFinite(price)) {
      prices[String(symbol).trim().toUpperCase()] = price;
    }
  }
  return prices;
}

function parseIpos(json) {
  const ipos = [];
  for (const row of asRows(json)) {
    const symbol = pick(row, ["symbol", "stockSymbol", "scrip"]);
    if (!symbol) continue;
    const status = String(pick(row, ["status", "issueStatus"]) ?? "open").toLowerCase();
    const id = String(
      pick(row, ["id", "ipoId", "issueId"]) ?? `ipo-${String(symbol).trim().toUpperCase()}`
    );
    const price = toPrice(pick(row, ["price", "issuePrice", "unitPrice"]));
    ipos.push({
      id,
      symbol: String(symbol).trim().toUpperCase(),
      company: String(pick(row, ["company", "companyName", "name", "securityName"]) ?? symbol),
      status,
      ...(Number.isFinite(price) ? { price } : {}),
    });
  }
  return ipos;
}

async function fetchLive(baseUrl, paths = {}) {
  if (!baseUrl) {
    throw new Error('dataSource is "live" but config.liveBaseUrl is empty.');
  }
  const base = baseUrl.replace(/\/+$/, "");
  const pricePath = paths.prices || DEFAULT_PATHS.prices;
  const ipoPath = paths.ipos || DEFAULT_PATHS.ipos;

  // Prices are essential — let a failure here surface as a poll error.
  const prices = parsePrices(await fetchJson(base + pricePath));

  // IPO feed is best-effort: if it's down, still deliver price alerts.
  let ipos = [];
  try {
    ipos = parseIpos(await fetchJson(base + ipoPath));
  } catch (err) {
    console.error(`\nIPO feed unavailable (${err.message}) — continuing with prices only.`);
  }

  return { ipos, prices };
}

export async function fetchMarket(config) {
  if (config.dataSource === "live") {
    return fetchLive(config.liveBaseUrl, config.livePaths);
  }
  return fetchMock();
}
