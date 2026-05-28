export default async function handler(req, res) {
  res.status(200).json({ ok: true });

  if (req.method !== "POST") return;

  const msg = req.body?.message;
  if (!msg?.text || !msg?.chat?.id) return;

  const chatId = msg.chat.id;
  const text = msg.text;

  const BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

  try {
    // Test: just echo back
    await fetch(`${BASE}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `✅ ربات کار می‌کنه! گفتی: ${text}`,
      }),
    });
  } catch (err) {
    console.error(err);
  }
}
