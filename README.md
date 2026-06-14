# NEPSE Alert

A monitor that watches **public** NEPSE data and notifies you when:

- a new **IPO opens**, or
- a stock crosses a **price** you care about.

It then alerts you (desktop popup + optional Telegram) so **you** place the order
yourself in the TMS web app. It does **not** log into your account and does
**not** place orders — that keeps you inside the platform's rules.

## Run

```bash
npm install
npm start
```

Starts in `mock` mode so you can see alerts fire immediately.

Then open the **order ticket page** in a browser and keep it on a second
monitor: <http://localhost:7777>. When an alert fires it shows the exact
**symbol / price / quantity** to type into TMS (quantity = budget ÷ price,
rounded down to the lot size). You enter and confirm the order yourself.

## Configure — `config.json`

| Field            | Meaning                                                        |
|------------------|----------------------------------------------------------------|
| `pollSeconds`    | How often to check (minimum 5s).                               |
| `dataSource`     | `"mock"` for testing, `"live"` for real data.                  |
| `liveBaseUrl`    | Base URL of your public NEPSE data endpoint (live mode).      |
| `alertOnNewIpo`  | Alert when an IPO opens.                                        |
| `priceWatch`     | List of `{ symbol, when: "above"\|"below", price }` rules.     |
| `telegram`       | Set `enabled: true` + `botToken` + `chatId` to get phone push. |

## Going live

Edit `src/provider.js` → `fetchLive()` to call a real **public** NEPSE data
source and return:

```js
{ ipos: [{ id, symbol, company, status }], prices: { SYMBOL: number } }
```

The rest of the app (rules, dedup, notifications) needs no changes.

## Telegram (optional, for phone alerts)

1. Message **@BotFather**, `/newbot`, copy the bot token.
2. Message **@userinfobot** to get your chat id.
3. Put both in `config.json` and set `enabled: true`.
```
