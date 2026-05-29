import { saveReservation, findAvailableTable, cancelReservation } from "../lib/db.js";
import { notifyAdmin } from "../lib/telegram.js";

const TOTAL_TABLES = parseInt(process.env.TOTAL_TABLES || "10");
const TR_MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const TR_DAYS = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];

function formatDateLabel(date) {
  const p = date.split("-");
  const d = new Date(Date.UTC(p[0], p[1]-1, p[2]));
  return `${d.getUTCDate()} ${TR_MONTHS[d.getUTCMonth()]} ${TR_DAYS[d.getUTCDay()]}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const body = req.body;

  try {
    if (body.action === 'cancel') {
      const ok = await cancelReservation(body.reservationId);
      return res.json({ ok });
    }

    const { name, date, time, guests, userId, username } = body;
    if (!name || !date || !time || !guests) return res.json({ ok: false, message: 'Eksik bilgi / Missing info' });

    const tableNumber = await findAvailableTable(date, time, guests, TOTAL_TABLES);
    if (!tableNumber) {
      return res.json({ ok: false, message: `${formatDateLabel(date)} — ${time} için uygun masa yok. Farklı saat deneyin.` });
    }

    const dateLabel = formatDateLabel(date);
    const resId = await saveReservation({ name, date, dateLabel, time, guests, tableNumber, userId, username });

    await notifyAdmin(
      `🆕 Yeni Rezervasyon (Web App)\n👤 ${name}\n📅 ${dateLabel} ${time}\n👥 ${guests} kişi\n🪑 Masa ${tableNumber}\n🆔 ${resId}`
    );

    return res.json({ ok: true, reservationId: resId });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: 'Sunucu hatası' });
  }
}
