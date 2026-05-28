import { sendMessage, sendButtons, answerCallback, notifyAdmin } from "../lip/telegram.js";
import { setState, getState, clearState, saveReservation, findAvailableTable, cancelReservation, getReservation, getReservationsByDate } from "../lib/db.js";
import { extractReservation } from "../lib/claude.js";

const TOTAL_TABLES = parseInt(process.env.TOTAL_TABLES || "10");
const CAFE_NAME = process.env.CAFE_NAME || "Our Cafe";

function today() {
  // Iran timezone UTC+3:30
  const now = new Date(Date.now() + 3.5 * 60 * 60 * 1000);
  return now.toISOString().split("T")[0];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  const update = req.body;
  res.status(200).json({ ok: true }); // Answer Telegram immediately

  try {
    // Handle inline button callbacks
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return;
    }

    const msg = update.message;
    if (!msg || !msg.text) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text.trim();
    const username = msg.from.first_name || "Guest";

    // --- ADMIN COMMANDS ---
    if (String(userId) === process.env.ADMIN_TELEGRAM_ID) {
      if (text === "/reservations" || text === "/bugünkü") {
        const list = await getReservationsByDate(today());
        if (!list.length) {
          await sendMessage(chatId, "📭 No reservations for today. / Bugün rezervasyon yok.");
          return;
        }
        const lines = list
          .filter((r) => r.status !== "cancelled")
          .map((r) => `🪑 <b>${r.name}</b> — ${r.time} — ${r.guests} guests — Table ${r.tableNumber}\n   ID: <code>${r.id}</code>`)
          .join("\n\n");
        await sendMessage(chatId, `📋 <b>Today's Reservations / Bugünkü Rezervasyonlar</b>\n\n${lines || "None / Yok"}`);
        return;
      }
    }

    // --- /start ---
    if (text === "/start") {
      await clearState(userId);
      await sendButtons(
        chatId,
        `👋 Welcome to <b>${CAFE_NAME}</b>!\n\nWhat would you like to do?\n\n🇹🇷 Merhaba! <b>${CAFE_NAME}</b>'e hoş geldiniz!\n\nNe yapmak istersiniz?`,
        [
          [
            { text: "📅 Make a Reservation / Rezervasyon Yap", callback_data: "start_reservation" },
          ],
          [
            { text: "❌ Cancel Reservation / İptal Et", callback_data: "start_cancel" },
          ],
          [
            { text: "ℹ️ Info / Bilgi", callback_data: "info" },
          ],
        ]
      );
      return;
    }

    // --- /cancel shortcut ---
    if (text.startsWith("/cancel ")) {
      const id = text.replace("/cancel ", "").trim();
      const ok = await cancelReservation(id);
      await sendMessage(
        chatId,
        ok
          ? `✅ Reservation <code>${id}</code> cancelled.\n🇹🇷 Rezervasyon iptal edildi.`
          : `❌ Reservation not found. / Rezervasyon bulunamadı.`
      );
      return;
    }

    // --- Conversation flow ---
    const state = await getState(userId);

    if (!state || state.step === "idle") {
      // Start fresh chat → guide them
      await sendMessage(chatId, `Please use /start to begin.\n🇹🇷 Başlamak için /start yazın.`);
      return;
    }

    if (state.step === "collecting") {
      // Add user message to history
      const history = state.history || [];
      history.push({ role: "user", content: text });

      const result = await extractReservation(history, today());

      if (result.type === "message") {
        // Claude is asking for more info
        history.push({ role: "assistant", content: result.text });
        await setState(userId, { step: "collecting", history });
        await sendMessage(chatId, result.text);
        return;
      }

      // Claude extracted an action
      const { data } = result;

      if (data.action === "reserve") {
        const { name, date, time, guests } = data;

        // Validate time
        const [h] = time.split(":").map(Number);
        if (h < 9 || h >= 22) {
          await sendMessage(chatId, `⏰ We are open 09:00–22:00.\n🇹🇷 Çalışma saatlerimiz 09:00–22:00.`);
          return;
        }

        // Find available table
        const tableNumber = await findAvailableTable(date, time, guests, TOTAL_TABLES);

        if (!tableNumber) {
          await sendMessage(
            chatId,
            `😔 Sorry, no tables available for ${date} at ${time}.\nPlease try a different time.\n\n🇹🇷 Üzgünüz, ${date} tarihinde ${time} için uygun masa yok. Farklı bir saat deneyin.`
          );
          return;
        }

        // Show confirmation buttons
        await setState(userId, {
          step: "confirming",
          pending: { name, date, time, guests, tableNumber, userId, username },
        });

        await sendButtons(
          chatId,
          `📋 <b>Reservation Summary / Özet</b>\n\n👤 ${name}\n📅 ${date}\n⏰ ${time}\n👥 ${guests} guests/kişi\n🪑 Table/Masa ${tableNumber}\n\n✅ Confirm? / Onaylıyor musunuz?`,
          [
            [
              { text: "✅ Confirm / Onayla", callback_data: "confirm_yes" },
              { text: "❌ Cancel / İptal", callback_data: "confirm_no" },
            ],
          ]
        );
        return;
      }

      if (data.action === "cancel") {
        const ok = await cancelReservation(data.reservationId);
        await clearState(userId);
        await sendMessage(
          chatId,
          ok
            ? `✅ Cancelled successfully.\n🇹🇷 Rezervasyon iptal edildi.`
            : `❌ Not found. Check your reservation ID.\n🇹🇷 Rezervasyon bulunamadı.`
        );
        return;
      }
    }

    // Default fallback
    await sendMessage(chatId, `Please use /start.\n🇹🇷 Lütfen /start yazın.`);
  } catch (err) {
    console.error("Bot error:", err);
  }
}

async function handleCallback(query) {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  await answerCallback(query.id);

  if (data === "start_reservation") {
    await setState(userId, {
      step: "collecting",
      history: [
        {
          role: "assistant",
          content: `Hello! I'll help you make a reservation. What's your name?\n\n🇹🇷 Merhaba! Rezervasyon için yardımcı olacağım. Adınız nedir?`,
        },
      ],
    });
    await sendMessage(
      chatId,
      `Hello! I'll help you make a reservation. What's your name?\n\n🇹🇷 Merhaba! Rezervasyon için yardımcı olacağım. Adınız nedir?`
    );
    return;
  }

  if (data === "start_cancel") {
    await setState(userId, {
      step: "collecting",
      history: [
        {
          role: "assistant",
          content: `Please send your reservation ID to cancel it.\n\n🇹🇷 İptal etmek için rezervasyon ID'nizi gönderin.`,
        },
      ],
    });
    await sendMessage(
      chatId,
      `Please send your reservation ID (e.g. RES-1234567890).\n\n🇹🇷 Rezervasyon ID'nizi gönderin (örn. RES-1234567890).`
    );
    return;
  }

  if (data === "info") {
    await sendMessage(
      chatId,
      `ℹ️ <b>${CAFE_NAME}</b>\n\n🕐 Hours / Saatler: 09:00 – 22:00\n📞 Contact your cafe staff for more info.\n\n🇹🇷 Daha fazla bilgi için personelimizle iletişime geçin.`
    );
    return;
  }

  if (data === "confirm_yes") {
    const state = await getState(userId);
    if (!state || state.step !== "confirming") return;

    const resId = await saveReservation(state.pending);
    await clearState(userId);

    await sendMessage(
      chatId,
      `🎉 <b>Confirmed! / Onaylandı!</b>\n\n📋 Reservation ID: <code>${resId}</code>\n👤 ${state.pending.name}\n📅 ${state.pending.date}\n⏰ ${state.pending.time}\n👥 ${state.pending.guests} guests/kişi\n🪑 Table/Masa ${state.pending.tableNumber}\n\n💡 Save your ID to cancel later.\n🇹🇷 ID'nizi saklayın, iptal için gerekli.`
    );

    // Notify admin
    await notifyAdmin(
      `🆕 New Reservation!\n👤 ${state.pending.name}\n📅 ${state.pending.date} ${state.pending.time}\n👥 ${state.pending.guests} guests\n🪑 Table ${state.pending.tableNumber}\n🆔 ${resId}`
    );
    return;
  }

  if (data === "confirm_no") {
    await clearState(userId);
    await sendMessage(chatId, `Cancelled. Use /start to begin again.\n🇹🇷 İptal edildi. Tekrar başlamak için /start yazın.`);
    return;
  }
}
