# O'quv markaz uchun Referal Telegram Bot

Node.js (Telegraf) + SQLite asosida yozilgan referal bot. O'quvchilar do'stlarini taklif qilib, bonus/chegirmaga ega bo'lishlari mumkin.

## Imkoniyatlar

- Har bir foydalanuvchi uchun shaxsiy referal havola
- Referal statistikasi (nechta odam taklif qilingan)
- Belgilangan sonda avtomatik bonus xabari (masalan, 5 ta taklifdan keyin)
- Reyting (eng faol takliflar)
- Admin uchun `/stats` komandasi

## O'rnatish

### 1. Bot yaratish
Telegramda **@BotFather** ga yozing:
```
/newbot
```
Bot nomi va username so'raladi (username `_bot` bilan tugashi kerak, masalan `academy_referral_bot`). Sizga **token** beriladi — uni saqlab qo'ying.

### 2. Node.js o'rnatish
Agar kompyuteringizda Node.js bo'lmasa, [nodejs.org](https://nodejs.org) dan o'rnating (18+ versiya tavsiya etiladi).

### 3. Loyihani ko'chirish
Ushbu papkani (`referral-bot`) o'z kompyuteringizga yoki serveringizga nusxalang, so'ng terminalda:

```bash
cd referral-bot
npm install
```

### 4. Sozlash (.env)
`.env.example` faylidan nusxa oling va nomini `.env` ga o'zgartiring:

```bash
cp .env.example .env
```

`.env` faylini oching va quyidagilarni to'ldiring:

```
BOT_TOKEN=BotFather bergan token
BOT_USERNAME=bot_username (@ belgisiz)
ADMIN_IDS=sizning_telegram_id_raqamingiz
REWARD_THRESHOLD=5
```

> O'z Telegram ID raqamingizni bilish uchun **@userinfobot** ga `/start` yozing.

### 5. Botni ishga tushirish

```bash
npm start
```

Konsolda `Bot muvaffaqiyatli ishga tushdi ✅` degan xabarni ko'rsangiz, hammasi tayyor. Telegram'da botingizga o'ting va `/start` bosing.

## Botdan qanday foydalaniladi

1. Foydalanuvchi `/start` bosadi → bot unga shaxsiy referal havola beradi
2. Foydalanuvchi bu havolani do'stlariga yuboradi:
   `https://t.me/BOT_USERNAME?start=USER_ID`
3. Yangi odam shu havola orqali botga kirsa, avtomatik ravishda taklif qilgan odamga hisoblanadi
4. Taklif soni belgilangan chegaraga (`REWARD_THRESHOLD`) yetganda, foydalanuvchiga avtomatik bonus xabari yuboriladi
5. Siz (administrator) o'sha foydalanuvchiga qo'lda chegirma kodi yoki bonusni taqdim etasiz (yoki buni avtomatlashtirish mumkin — quyida)

## Serverga joylashtirish (production)

Botni doimiy ishlab turishi uchun quyidagilardan birini tanlang:

- **VPS** (Timeweb, Hetzner, DigitalOcean) + `pm2` orqali botni orqa fonda ishga tushirish:
  ```bash
  npm install -g pm2
  pm2 start bot.js --name referral-bot
  pm2 save
  ```
- **Railway.app** yoki **Render.com** — bepul tarifda Node.js loyihalarini joylashtirish mumkin (GitHub repo ulanadi)

## Fayllar tuzilishi

```
referral-bot/
├── bot.js          # Asosiy bot logikasi
├── db.js           # SQLite baza bilan ishlash
├── package.json    # Bog'liqliklar
├── .env.example    # Sozlamalar namunasi
└── referral.db     # Baza fayli (avtomatik yaratiladi)
```

## Keyingi qadamlar (kengaytirish uchun g'oyalar)

- Kurs sotib olish bilan bog'lash: to'lov qilganlarga avtomatik chegirma kodi generatsiya qilish
- Ko'p darajali referal tizimi (do'stning do'sti uchun ham kichik bonus)
- Admin panelga yangi komandalar: `/broadcast` (hammaga xabar yuborish), `/export` (userlar ro'yxatini CSV qilib olish)
- Web-dashboard orqali statistikani vizual ko'rish

Savol tug'ilsa yoki qo'shimcha funksiya (masalan, avtomatik chegirma kodi, to'lov tizimi bilan integratsiya) kerak bo'lsa — ayting, qo'shib beraman.
