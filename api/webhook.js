import { sendMessage, sendButtons, answerCallback, notifyAdmin } from "../lib/telegram.js";
import { setState, getState, clearState, saveReservation, findAvailableTable, cancelReservation, getReservationsByDate } from "../lib/db.js";

const TOTAL_TABLES = parseInt(process.env.TOTAL_TABLES || "10");
const CAFE_NAME = process.env.CAFE_NAME || "Our Cafe";

const TR_MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const TR_DAYS = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
const TIME_SLOTS = ["10:00","12:00","14:00","16:00","18:00","20:00"];

function todayDate() {
  const now = new Date(Date.now() + 3.5 * 60 * 60 * 1000);
  return now.toISOString().split("T")[0];
}

function getNextDays(count) {
  const days = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.now() + 3.5 * 60 * 60 * 1000 + i * 86400000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const label = i === 0
      ? `Bugün — ${dd} ${TR_MONTHS[d.getUTCMonth()]}`
      : `${dd} ${TR_MONTHS[d.getUTCMonth()]} — ${TR_DAYS[d.getUTCDay()]}`;
    days.push({ value: `${yyyy}-${mm}-${dd}`, label });
  }
  return days;
}

function formatDateLabel(date) {
  const p = date.split("-");
  const d = new Date(Date.UTC(p[0], p[1]-1, p[2]));
  return `${d.getUTCDate()} ${TR_MONTHS[d.getUTCMonth()]} ${TR_DAYS[d.getUTCDay()]}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });
  const update = req.body;
  try {
    if (update.callback_query) await handleCallback(update.callback_query);
    else if (update.message?.text) await handleMessage(update.message);
  } catch (err) { console.error("Bot error:", err); }
  return res.status(200).json({ ok: true });
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();

  if (String(userId) === process.env.ADMIN_TELEGRAM_ID && text === "/reservations") {
    const list = await getReservationsByDate(todayDate());
    if (!list.length) { await sendMessage(chatId, "📭 Bugün rezervasyon yok."); return; }
    const lines = list.filter(r => r.status !== "cancelled")
      .map(r => `🪑 <b>${r.name}</b> — ${r.time} — ${r.guests} kişi — Masa ${r.tableNumber}\nID: <code>${r.id}</code>`).join("\n\n");
    await sendMessage(chatId, `📋 <b>Bugünkü Rezervasyonlar</b>\n\n${lines}`);
    return;
  }

  if (text === "/start") {
    await clearState(userId);
    await sendButtons(chatId,
      `👋 <b>${CAFE_NAME}</b>'e hoş geldiniz!\nWelcome to <b>${CAFE_NAME}</b>!`,
      [
        [{ text: "📅 Rezervasyon Yap / Make a Reservation", callback_data: "start_reservation" }],
        [{ text: "❌ Rezervasyon İptal / Cancel", callback_data: "start_cancel" }],
        [{ text: "ℹ️ Bilgi / Info", callback_data: "info" }],
      ]
    );
    return;
  }

  const state = await getState(userId);

  if (state?.step === "name") {
    await setState(userId, { step: "date", name: text });
    const days = getNextDays(5);
    const buttons = days.map(d => [{ text: d.label, callback_data: `date_${d.value}` }]);
    await sendButtons(chatId, `📅 Tarihi seçin / Choose a date:`, buttons);
    return;
  }

  if (state?.step === "cancel_id") {
    const ok = await cancelReservation(text.trim());
    await clearState(userId);
    await sendMessage(chatId, ok
      ? `✅ Rezervasyon iptal edildi. / Cancelled successfully.`
      : `❌ Rezervasyon bulunamadı. / Not found.`
    );
    return;
  }

  await sendMessage(chatId, `Lütfen /start yazın. / Please use /start.`);
}

async function handleCallback(query) {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  await answerCallback(query.id);

  if (data === "start_reservation") {
    await setState(userId, { step: "name" });
    await sendMessage(chatId, `👤 Adınızı yazın / Please type your name:`);
    return;
  }

  if (data === "start_cancel") {
    await setState(userId, { step: "cancel_id" });
    await sendMessage(chatId, `Rezervasyon ID'nizi gönderin:\nSend your Reservation ID (e.g. RES-1234567890):`);
    return;
  }

  if (data === "info") {
    await sendMessage(chatId, `ℹ️ <b>${CAFE_NAME}</b>\n\n🕐 10:00 – 22:00\n\n📞 Daha fazla bilgi için personelimizle iletişime geçin.\nFor more info, contact our staff.`);
    return;
  }

  const state = await getState(userId);
  if (!state) { await sendMessage(chatId, `Lütfen /start yazın. / Please use /start.`); return; }

  if (data.startsWith("date_")) {
    const date = data.replace("date_", "");
    await setState(userId, { ...state, step: "time", date });
    const rows = [];
    for (let i = 0; i < TIME_SLOTS.length; i += 3)
      rows.push(TIME_SLOTS.slice(i, i+3).map(t => ({ text: `🕐 ${t}`, callback_data: `time_${t}` })));
    await sendButtons(chatId, `⏰ Saati seçin / Choose a time:`, rows);
    return;
  }

  if (data.startsWith("time_")) {
    const time = data.replace("time_", "");
    await setState(userId, { ...state, step: "guests", time });
    await sendButtons(chatId, `👥 Kişi sayısı / Number of guests:`, [
      [{ text: "1", callback_data: "guests_1" }, { text: "2", callback_data: "guests_2" }, { text: "3", callback_data: "guests_3" }],
      [{ text: "4", callback_data: "guests_4" }, { text: "5", callback_data: "guests_5" }, { text: "6+", callback_data: "guests_6" }],
    ]);
    return;
  }

  if (data.startsWith("guests_")) {
    const guests = parseInt(data.replace("guests_", ""));
    const { name, date, time } = state;
    const tableNumber = await findAvailableTable(date, time, guests, TOTAL_TABLES);

    if (!tableNumber) {
      await setState(userId, { ...state, step: "time", guests });
      const altRows = [];
      const alts = TIME_SLOTS.filter(t => t !== time);
      for (let i = 0; i < alts.length; i += 3)
        altRows.push(alts.slice(i, i+3).map(t => ({ text: `🕐 ${t}`, callback_data: `time_${t}` })));
      await sendButtons(chatId,
        `😔 ${formatDateLabel(date)} — ${time} için uygun masa yok.\nNo tables available. Choose another time:`,
        altRows
      );
      return;
    }

    const dateLabel = formatDateLabel(date);
    await setState(userId, { step: "confirming", pending: { name, date, dateLabel, time, guests, tableNumber, userId } });
    await sendButtons(chatId,
      `📋 <b>Rezervasyon Özeti</b>\n\n👤 ${name}\n📅 ${dateLabel}\n⏰ ${time}\n👥 ${guests} kişi\n🪑 Masa ${tableNumber}\n\n✅ Onaylıyor musunuz?`,
      [[{ text: "✅ Onayla / Confirm", callback_data: "confirm_yes" }, { text: "❌ İptal / Cancel", callback_data: "confirm_no" }]]
    );
    return;
  }

  if (data === "confirm_yes") {
    if (!state?.pending) return;
    const resId = await saveReservation(state.pending);
    await clearState(userId);
    await sendMessage(chatId,
      `🎉 <b>Rezervasyon Onaylandı!</b>\n\n📋 ID: <code>${resId}</code>\n👤 ${state.pending.name}\n📅 ${state.pending.dateLabel}\n⏰ ${state.pending.time}\n👥 ${state.pending.guests} kişi\n🪑 Masa ${state.pending.tableNumber}\n\n💡 ID'nizi saklayın, iptal için gerekli!\nSave your ID for cancellation.`
    );
    await notifyAdmin(
      `🆕 Yeni Rezervasyon!\n👤 ${state.pending.name}\n📅 ${state.pending.dateLabel} ${state.pending.time}\n👥 ${state.pending.guests} kişi\n🪑 Masa ${state.pending.tableNumber}\n🆔 ${resId}`
    );
    return;
  }

  if (data === "confirm_no") {
    await clearState(userId);
    await sendMessage(chatId, `İptal edildi. Tekrar için /start yazın.\nCancelled. Use /start to begin again.`);
    return;
  }
}
