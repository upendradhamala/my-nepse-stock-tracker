// Notifications: desktop popup + optional Telegram push.

import notifier from "node-notifier";

function desktop(title, message) {
  // No display (headless server / CI cron) — skip silently; Telegram still fires.
  if (!process.env.DISPLAY && process.platform === "linux") return;
  try {
    notifier.notify({ title, message, sound: true, wait: false });
  } catch (err) {
    console.error("Desktop notify skipped:", err.message);
  }
}

// Secrets come from env vars first (safe for git + cloud deploy), then fall
// back to config.json for quick local runs.
function telegramCreds(config) {
  const t = config.telegram || {};
  return {
    enabled: t.enabled,
    botToken: process.env.TELEGRAM_BOT_TOKEN || t.botToken,
    chatId: process.env.TELEGRAM_CHAT_ID || t.chatId,
  };
}

function telegramConfigured(t) {
  if (!t || !t.enabled) return false;
  const missing = !t.botToken || !t.chatId;
  const placeholder =
    /PUT_YOUR/i.test(t.botToken || "") || /PUT_YOUR/i.test(t.chatId || "");
  if (missing || placeholder) {
    console.error(
      "Telegram is enabled but botToken/chatId are not set — skipping phone push."
    );
    return false;
  }
  return true;
}

async function telegram(config, text) {
  const t = telegramCreds(config);
  if (!telegramConfigured(t)) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const url = `https://api.telegram.org/bot${t.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: t.chatId, text, disable_web_page_preview: true }),
      signal: controller.signal,
    });
    // Telegram always returns JSON with an `ok` flag; surface real failures
    // (bad token, wrong chat_id, bot not started) instead of swallowing them.
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      console.error(
        `Telegram send failed: ${body.description || res.status + " " + res.statusText}`
      );
    }
  } catch (err) {
    const reason = err.name === "AbortError" ? "request timed out" : err.message;
    console.error("Telegram send failed:", reason);
  } finally {
    clearTimeout(timer);
  }
}

export async function alert(config, title, message) {
  const stamp = new Date().toLocaleTimeString();
  console.log(`\n🔔 [${stamp}] ${title}\n   ${message}\n`);
  desktop(title, message);
  await telegram(config, `🔔 ${title}\n${message}`);
}
