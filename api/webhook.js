import { sendMessage, sendButtons, answerCallback, notifyAdmin } from "../lib/telegram.js";
import { setState, getState, clearState, saveReservation, findAvailableTable, cancelReservation, getReservationsByDate } from "../lib/db.js";
import { extractReservation } from "../lib/claude.js";

const TOTAL_TABLES = parseInt(process.env.TOTAL_TABLES || "10");
const CAFE_NAME = process.env.CAFE_NAME || "Our Cafe";

function today() {
  const now = new Date(Date.now() + 3.5 * 60 * 60 * 1000);
  return now.toISOString().split("T")[0];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  const update = req.body;

  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else {
      const msg = update.message;
      if (msg && msg.text) await handleMessage(msg);
    }
  } catch (err) {
    console.error("Bot error:", err);
  }

  return res.status(200).json({ ok: true });
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();
  const username = msg.from.first_name || "Guest";

  if (String(userId) === process.env.ADMIN_TELEGRAM_ID) {
    if (text === "/reservations") {
      const list = await getReservationsByDate(today());
      if (!list.length) { await sendMessage(chatId, "📭 No reservations today. / Bugün rezervasyon yok."); return; }
      const lines = list.filter(r => r.status !== "cancelled").map(r => `🪑 <b>${r.name}</b> — ${r.time} — ${r.guests} guests — Table ${r.tableNumber}\n   ID: <code>${r.id}</code>`).join("\n\n");
      await sendMessage(chatId, `📋 <b>Today's Reservations</b>\n\n${lines || "None"}`);
      return;
    }
  }

  if (text === "/start") {
    await clearState(userId);
    await sendButtons(chatId, `👋 Welcome to <b>${CAFE_NAME}</b>!\n\n🇹🇷 Merhaba! <b>${CAFE_NAME}</b>'e hoş geldiniz!\n\nNe yapmak istersiniz?`, [
      [{ text: "📅 Make a Reservation / Rezervasyon Yap", callback_data: "start_reservation" }],
      [{ text: "❌ Cancel Reservation / İptal Et", callback_data: "start_cancel" }],
      [{ text: "ℹ️ Info / Bilgi", callback_data: "info" }],
    ]);
    return;
  }

  if (text.startsWith("/cancel ")) {
    const id = text.replace("/cancel ", "").trim();
    const ok = await cancelReservation(id);
    await sendMessage(chatId, ok ? `✅ Cancelled / İptal edildi: <code>${id}</code>` : `❌ Not found / Bulunamadı.`);
    return;
  }

  const state = await getState(userId);
  if (!state || state.step === "idle") {
    await sendMessage(chatId, `Please use /start.\n🇹🇷 Lütfen /start yazın.`);
    return;
  }

  if (state.step === "collecting") {
    const history = state.history || [];
    history.push({ role: "user", content: text });
    const result = await extractReservation(history, today());

    if (result.type === "message") {
      history.push({ role: "assistant", content: result.text });
      await setState(userId, { step: "collecting", history });
      await sendMessage(chatId, result.text);
      return;
    }

    const { data } = result;

    if (data.action === "reserve") {
      const { name, date, time, guests } = data;
      const [h] = time.split(":").map(Number);
      if (h < 9 || h >= 22) { await sendMessage(chatId, `⏰ We are open 09:00–22:00.\n🇹🇷 Saat 09:00–22:00 arası.`); return; }
      const tableNumber = await findAvailableTable(date, time, guests, TOTAL_TABLES);
      if (!tableNumber) { await sendMessage(chatId, `😔 No tables available for ${date} at ${time}.\n🇹🇷 ${date} tarihinde ${time} için uygun masa yok.`); return; }
      await setState(userId, { step: "confirming", pending: { name, date, time, guests, tableNumber, userId, username } });
      await sendButtons(chatId, `📋 <b>Reservation / Rezervasyon</b>\n\n👤 ${name}\n📅 ${date}\n⏰ ${time}\n👥 ${guests} guests\n🪑 Table ${tableNumber}\n\n✅ Confirm?`, [
        [{ text: "✅ Confirm / Onayla", callback_data: "confirm_yes" }, { text: "❌ Cancel / İptal", callback_data: "confirm_no" }],
      ]);
      return;
    }

    if (data.action === "cancel") {
      const ok = await cancelReservation(data.reservationId);
      await clearState(userId);
      await sendMessage(chatId, ok ? `✅ Cancelled.\n🇹🇷 İptal edildi.` : `❌ Not found.\n🇹🇷 Bulunamadı.`);
      return;
    }
  }

  await sendMessage(chatId, `Please use /start.\n🇹🇷 Lütfen /start yazın.`);
}

async function handleCallback(query) {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  await answerCallback(query.id);

  if (data === "start_reservation") {
    const firstMsg = `Hello! I'll help you make a reservation. What's your name?\n\n🇹🇷 Merhaba! Adınız nedir?`;
    await setState(userId, { step: "collecting", history: [{ role: "assistant", content: firstMsg }] });
    await sendMessage(chatId, firstMsg);
    return;
  }

  if (data === "start_cancel") {
    const firstMsg = `Please send your reservation ID.\n\n🇹🇷 Rezervasyon ID'nizi gönderin (örn. RES-1234567890).`;
    await setState(userId, { step: "collecting", history: [{ role: "assistant", content: firstMsg }] });
    await sendMessage(chatId, firstMsg);
    return;
  }

  if (data === "info") {
    await sendMessage(chatId, `ℹ️ <b>${CAFE_NAME}</b>\n\n🕐 09:00 – 22:00\n\n🇹🇷 Daha fazla bilgi için personelimizle iletişime geçin.`);
    return;
  }

  if (data === "confirm_yes") {
    const state = await getState(userId);
    if (!state || state.step !== "confirming") return;
    const resId = await saveReservation(state.pending);
    await clearState(userId);
    await sendMessage(chatId, `🎉 <b>Confirmed! / Onaylandı!</b>\n\n📋 ID: <code>${resId}</code>\n👤 ${state.pending.name}\n📅 ${state.pending.date}\n⏰ ${state.pending.time}\n👥 ${state.pending.guests} guests\n🪑 Table ${state.pending.tableNumber}\n\n💡 Save your ID!\n🇹🇷 ID'nizi saklayın!`);
    await notifyAdmin(`🆕 New Reservation!\n👤 ${state.pending.name}\n📅 ${state.pending.date} ${state.pending.time}\n👥 ${state.pending.guests} guests\n🪑 Table ${state.pending.tableNumber}\n🆔 ${resId}`);
    return;
  }

  if (data === "confirm_no") {
    await clearState(userId);
    await sendMessage(chatId, `Cancelled. Use /start.\n🇹🇷 İptal edildi. /start yazın.`);
    return;
  }
}
