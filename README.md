# 🤖 ربات رزرو کافه — راهنمای نصب

## قدم ۱ — BotFather
1. تلگرام رو باز کن، برو به `@BotFather`
2. بنویس `/newbot`
3. یه اسم بده (مثلاً: MyCafe Reservation)
4. یه username بده که به `bot` ختم بشه (مثلاً: `mycafe_res_bot`)
5. توکنی که داد رو کپی کن ← این می‌شه `TELEGRAM_BOT_TOKEN`

---

## قدم ۲ — آیدی عددی تلگرامت
1. برو به `@userinfobot` در تلگرام
2. `/start` بزن
3. عدد `Id` رو کپی کن ← این می‌شه `ADMIN_TELEGRAM_ID`

---

## قدم ۳ — Claude API Key
1. برو به https://console.anthropic.com
2. ثبت‌نام کن
3. بخش `API Keys` → کلید جدید بساز ← این می‌شه `ANTHROPIC_API_KEY`

---

## قدم ۴ — Upstash Redis
1. برو به https://upstash.com
2. ثبت‌نام کن (رایگانه)
3. `Create Database` → اسم بذار → `Global` انتخاب کن
4. داخل دیتابیس:
   - `UPSTASH_REDIS_REST_URL` رو کپی کن
   - `UPSTASH_REDIS_REST_TOKEN` رو کپی کن

---

## قدم ۵ — Deploy روی Vercel
1. برو به https://vercel.com و ثبت‌نام کن
2. فایل‌های پروژه رو آپلود کن (یا با GitHub)
3. بخش `Environment Variables` این‌ها رو اضافه کن:

```
TELEGRAM_BOT_TOKEN=         توکن از BotFather
ADMIN_TELEGRAM_ID=          آیدی عددیت
ANTHROPIC_API_KEY=          کلید Claude
UPSTASH_REDIS_REST_URL=     URL از Upstash
UPSTASH_REDIS_REST_TOKEN=   Token از Upstash
CAFE_NAME=                  اسم کافه‌ات
TOTAL_TABLES=10             تعداد میزها
```

4. Deploy کن
5. URL پروژه رو کپی کن (مثلاً: `https://my-cafe-bot.vercel.app`)

---

## قدم ۶ — وصل کردن Webhook به تلگرام
این لینک رو در مرورگر باز کن (با مقادیر خودت):

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<YOUR_VERCEL_URL>/api/webhook
```

اگه جواب `{"ok":true}` اومد، همه چیز وصله! ✅

---

## دستورات ادمین
فقط تو (با ADMIN_TELEGRAM_ID) می‌تونی اینا رو بزنی:

- `/reservations` — لیست رزروهای امروز
- `/bugünkü` — همون، به ترکی

---

## دستورات مشتری
- `/start` — شروع
- `/cancel RES-xxxx` — لغو رزرو با کد

---

## فیچرهایی که بعداً اضافه می‌کنیم
- [ ] یادآور خودکار ۱ ساعت قبل
- [ ] منو نمایش بده
- [ ] پرداخت آنلاین
- [ ] رزرو بخش VIP جدا
- [ ] آمار هفتگی برای ادمین
