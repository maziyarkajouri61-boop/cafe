const BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function call(method, body) {
  const res = await fetch(`${BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function sendMessage(chatId, text, extra = {}) {
  return call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

export function sendButtons(chatId, text, buttons) {
  return sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: buttons },
  });
}

export function answerCallback(callbackQueryId, text = "") {
  return call("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

// Notify the cafe owner (admin) about a new reservation
export function notifyAdmin(text) {
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId) return;
  return sendMessage(adminId, text);
}
