require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const {
  getUser,
  createUser,
  incrementReferralCount,
  logReferralEvent,
  markRewardGiven,
  getTopReferrers,
  getStats,
} = require("./db");

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME; // masalan: @wegweiserclub (kanal username, @ bilan)
const REWARD_THRESHOLD = parseInt(process.env.REWARD_THRESHOLD || "5", 10);
const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean)
  .map(Number);

if (!BOT_TOKEN) {
  console.error(
    "XATOLIK: .env faylida BOT_TOKEN topilmadi. .env.example dan nusxa oling.",
  );
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ---------- Yordamchi funksiyalar ----------

function isAdmin(telegramId) {
  return ADMIN_IDS.includes(telegramId);
}

function mainMenu() {
  return Markup.keyboard([
    ["🔗 Mening referal havolam", "📊 Statistikam"],
    ["🏆 Reyting", "ℹ️ Yordam"],
  ]).resize();
}

function getReferralLink(telegramId) {
  return `https://t.me/${BOT_USERNAME}?start=${telegramId}`;
}

// Foydalanuvchi kanalga a'zo bo'lган-bo'lmaganini tekshirish
async function isSubscribed(ctx, telegramId) {
  if (!CHANNEL_USERNAME) return true; // kanal sozlanmagan bo'lsa, tekshiruvsiz o'tkazamiz
  try {
    const member = await ctx.telegram.getChatMember(
      CHANNEL_USERNAME,
      telegramId,
    );
    return ["member", "administrator", "creator"].includes(member.status);
  } catch (e) {
    console.error(
      "Obunani tekshirishda xatolik (bot kanalda admin emasmi?):",
      e.message,
    );
    return true; // xato bo'lsa, foydalanuvchini bloklab qo'ymaslik uchun o'tkazib yuboramiz
  }
}

function subscribeKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.url(
        "📢 Kanalga qo'shilish",
        `https://t.me/${CHANNEL_USERNAME.replace("@", "")}`,
      ),
    ],
    [Markup.button.callback("✅ Tekshirish", "check_sub")],
  ]);
}

// Yangi foydalanuvchini ro'yxatdan o'tkazish va referalni hisoblash (faqat bir marta ishlaydi)
async function registerUserIfNew(
  ctx,
  telegramId,
  username,
  firstName,
  payload,
) {
  let user = getUser(telegramId);
  if (user) return; // allaqachon ro'yxatdan o'tgan

  let referredBy = null;
  if (payload && !isNaN(Number(payload)) && Number(payload) !== telegramId) {
    const referrer = getUser(Number(payload));
    if (referrer) referredBy = Number(payload);
  }

  createUser({ telegramId, username, firstName, referredBy });

  if (referredBy) {
    incrementReferralCount(referredBy);
    logReferralEvent(referredBy, telegramId);

    const referrerData = getUser(referredBy);
    try {
      await ctx.telegram.sendMessage(
        referredBy,
        `🎉 Tabriklaymiz! Sizning havolangiz orqali yangi o'quvchi qo'shildi.\n` +
          `Jami takliflaringiz: ${referrerData.referral_count}`,
      );
    } catch (e) {}

    if (
      referrerData.referral_count >= REWARD_THRESHOLD &&
      !referrerData.reward_given
    ) {
      markRewardGiven(referredBy);
      try {
        await ctx.telegram.sendMessage(
          referredBy,
          `🏆 Ajoyib! Siz ${REWARD_THRESHOLD} ta do'stingizni taklif qildingiz.\n` +
            `Sizga maxsus bonus/chegirma taqdim etiladi. Administrator siz bilan tez orada bog'lanadi!`,
        );
      } catch (e) {}
    }
  }
}

// Foydalanuvchi kanalga hali qo'shilmagan holatda referal kodni vaqtincha saqlab turish uchun
const pendingPayload = new Map();

// ---------- /start komandasi ----------

bot.start(async (ctx) => {
  const telegramId = ctx.from.id;
  const username = ctx.from.username;
  const firstName = ctx.from.first_name;
  const payload = ctx.startPayload; // referal kod (taklif qilgan userning ID si)

  const subscribed = await isSubscribed(ctx, telegramId);

  if (!subscribed) {
    // Referal ma'lumotini vaqtincha eslab qolamiz (session o'rniga oddiy global obyekt)
    pendingPayload.set(telegramId, payload);
    return ctx.reply(
      `Assalomu alaykum, ${firstName || "aziz do'stimiz"}! 👋\n\n` +
        `Botdan foydalanish uchun avval bizning kanalimizga qo'shiling, so'ng "✅ Tekshirish" tugmasini bosing.`,
      subscribeKeyboard(),
    );
  }

  await registerUserIfNew(ctx, telegramId, username, firstName, payload);

  await ctx.reply(
    `Assalomu alaykum, ${firstName || "aziz do'stimiz"}! 👋\n\n` +
      `Bizning o'quv markazimizga xush kelibsiz.\n` +
      `Do'stlaringizni taklif qiling va bonuslarga ega bo'ling!`,
    mainMenu(),
  );
});

// Foydalanuvchi "✅ Tekshirish" tugmasini bosganda
bot.action("check_sub", async (ctx) => {
  const telegramId = ctx.from.id;
  const username = ctx.from.username;
  const firstName = ctx.from.first_name;
  const payload = pendingPayload.get(telegramId);

  const subscribed = await isSubscribed(ctx, telegramId);

  if (!subscribed) {
    return ctx.answerCbQuery(
      "❌ Siz hali kanalga qo'shilmadingiz. Iltimos, avval qo'shiling.",
      { show_alert: true },
    );
  }

  pendingPayload.delete(telegramId);
  await registerUserIfNew(ctx, telegramId, username, firstName, payload);
  await ctx.answerCbQuery("✅ Rahmat! Obuna tasdiqlandi.");
  await ctx.editMessageText(
    `Rahmat! Kanalga muvaffaqiyatli qo'shildingiz. 🎉\n\n` +
      `Bizning o'quv markazimizga xush kelibsiz.\n` +
      `Do'stlaringizni taklif qiling va bonuslarga ega bo'ling!`,
  );
  await ctx.reply("Quyidagi menyudan foydalaning:", mainMenu());
});

// ---------- Referal havola ----------

bot.hears("🔗 Mening referal havolam", (ctx) => {
  const link = getReferralLink(ctx.from.id);
  ctx.reply(
    `Sizning shaxsiy referal havolangiz:\n\n${link}\n\n` +
      `Ushbu havolani do'stlaringizga yuboring. Ular shu havola orqali botga kirsa, sizga hisoblanadi.`,
  );
});

// ---------- Statistika ----------

bot.hears("📊 Statistikam", (ctx) => {
  const user = getUser(ctx.from.id);
  if (!user) {
    return ctx.reply("Iltimos, avval /start buyrug'ini bosing.");
  }
  const qoldi = Math.max(REWARD_THRESHOLD - user.referral_count, 0);
  ctx.reply(
    `📊 Sizning statistikangiz:\n\n` +
      `👥 Taklif qilinganlar soni: ${user.referral_count}\n` +
      `🎯 Bonusgacha qoldi: ${qoldi} ta\n` +
      `🎁 Bonus olingan: ${user.reward_given ? "Ha ✅" : "Yo'q"}`,
  );
});

// ---------- Reyting ----------

bot.hears("🏆 Reyting", (ctx) => {
  const top = getTopReferrers(10);
  if (top.length === 0) {
    return ctx.reply("Hozircha reyting bo'sh.");
  }
  let text = "🏆 Eng faol takliflar reytingi:\n\n";
  top.forEach((u, i) => {
    const name = u.first_name || u.username || `ID:${u.telegram_id}`;
    text += `${i + 1}. ${name} — ${u.referral_count} ta\n`;
  });
  ctx.reply(text);
});

// ---------- Yordam ----------

bot.hears("ℹ️ Yordam", (ctx) => {
  ctx.reply(
    `ℹ️ Bot qanday ishlaydi:\n\n` +
      `1. "🔗 Mening referal havolam" tugmasini bosing\n` +
      `2. Havolani do'stlaringizga yuboring\n` +
      `3. Har bir yangi qo'shilgan do'stingiz uchun bal olasiz\n` +
      `4. ${REWARD_THRESHOLD} ta do'st taklif qilsangiz — bonus/chegirmaga ega bo'lasiz!\n\n` +
      `Savollar bo'lsa, administratorga murojaat qiling.`,
  );
});

// ---------- Admin komandalar ----------

bot.command("stats", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const stats = getStats();
  ctx.reply(
    `📈 Umumiy statistika:\n\n` +
      `👤 Jami foydalanuvchilar: ${stats.totalUsers}\n` +
      `🔗 Jami referal o'tishlar: ${stats.totalReferrals}`,
  );
});

console.log("Bot ishga tushirilmoqda, biroz kuting...");

bot
  .launch()
  .then(() => {
    console.log("Bot muvaffaqiyatli ishga tushdi ✅");
  })
  .catch((err) => {
    console.error("XATOLIK: Bot ishga tushmadi ❌");
    console.error(err.message || err);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
