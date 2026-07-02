# O'quv markaz uchun Referal Telegram Bot (v2 — to'liq versiya)

Node.js (Telegraf) + SQLite asosida yozilgan, texnik topshiriqqa mos to'liq referal bot.

## Imkoniyatlar

- 3 (yoki istalgan sondagi) majburiy obuna kanallari
- Har bir foydalanuvchi uchun shaxsiy referal havola
- Referal faqat barcha shartlar bajarilgandagina hisoblanadi
- "📖 Loyiha haqida", "🔗 Referal havolam", "📊 Mening statistikam", "🏆 Top-10 reyting" bo'limlari
- Referal chegarasiga yetganda avtomatik **bir martalik maxfiy kanal invite link**
- To'liq **botning ichidagi admin panel** (`/admin`):
  - Majburiy kanallarni o'zgartirish
  - Loyiha matnini tahrirlash
  - Maxfiy kanalni sozlash (xabarni forward qilish orqali)
  - Referal chegarasini o'zgartirish
  - Statistika va reytingni ko'rish
  - Barcha foydalanuvchilarga xabar yuborish (Broadcast)
  - Istalgan foydalanuvchiga referal qo'shish/ayirish

## O'rnatish

```bash
npm install
cp .env.example .env
```

`.env` faylini to'ldiring: `BOT_TOKEN`, `BOT_USERNAME`, `ADMIN_IDS`.

```bash
npm start
```

## Birinchi sozlash (bot ishga tushgandan keyin)

1. Telegram'da botingizga `/admin` yozing (faqat `ADMIN_IDS`dagi userlar uchun ishlaydi)
2. **📢 Majburiy kanallar** — 3 ta kanal username'ini vergul bilan kiriting: `@kanal1, @kanal2, @kanal3`
   - ⚠️ Bot har uchala kanalda ham **ADMIN** bo'lishi shart, aks holda obunani tekshira olmaydi
3. **🔒 Maxfiy kanal** — botni maxfiy kanalga ADMIN qilib qo'shing (invite link yaratish huquqi bilan), so'ng shu kanaldan istalgan xabarni botga **forward** qiling — bot avtomatik kanal ID sini saqlab oladi
4. **📝 Loyiha matni** — "Loyiha haqida" bo'limida chiqadigan matnni kiriting
5. **🎯 Referal chegarasi** — nechta referal kerakligini belgilang (masalan 10)

Shu 5 qadamdan so'ng bot to'liq texnik topshiriqqa mos ishlay boshlaydi.

## Ishlash tartibi (foydalanuvchi tomonidan)

1. `/start` bosadi
2. Barcha majburiy kanallarga qo'shilishi so'raladi, "✅ Tekshirish" orqali tasdiqlaydi
3. Asosiy menyu ochiladi
4. "🔗 Referal havolam" orqali o'z havolasini oladi, do'stlariga yuboradi
5. Do'sti shu havola orqali kirib, barcha shartlarni bajarsa — referal hisoblanadi va motivatsion xabar yuboriladi
6. Chegaraga yetganda — avtomatik bir martalik maxfiy kanal linki yuboriladi

## Muhim eslatmalar

- **Har bir Telegram akkaunt faqat bir marta referal sifatida hisoblanadi** — bu `users` jadvalidagi `referred_by` maydoni orqali ta'minlangan (bir user faqat bitta marta yozilishi mumkin).
- Majburiy kanallar **public** (username'li) bo'lishi kerak, chunki obunani tekshirish uchun `getChatMember` API'siga username yoki chat ID beriladi.
- Maxfiy kanal **private** bo'lishi mumkin — uning ID sini forward qilish orqali olamiz, keyin bot shu ID asosida bir martalik invite linklar yaratadi.
- Admin panel holati (`adminState`) xotirada (RAM) saqlanadi — agar bot qayta ishga tushsa (deploy, restart), yarim qolgan admin amalini qaytadan boshlash kerak bo'ladi. Sozlamalarning o'zi (kanal ro'yxati, matn va h.k.) baza (`referral.db`)da saqlanadi va yo'qolmaydi.

## Serverga joylashtirish

Railway/Render/VPS + PM2 — avvalgi qo'llanma bo'yicha bir xil (README'ning eski versiyasidagi qadamlar amal qiladi).

## Kengaytirish g'oyalari

- Ko'p darajali referal (do'stning do'sti uchun ham kichik bonus)
- To'lov tizimi bilan integratsiya (Click, Payme)
- Google Sheets bilan sinxronizatsiya
- CSV export