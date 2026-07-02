require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const {
  getUser,
  createUser,
  incrementReferralCount,
  adjustReferralCount,
  logReferralEvent,
  markRewardGiven,
  getTopReferrers,
  getAllUserIds,
  getStats,
  resetAllData,
  getSetting,
  setSetting,
  getRequiredChannels,
  setRequiredChannels,
  getReferralThreshold,
  setReferralThreshold,
} = require("./db");

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME;
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
if (!BOT_USERNAME) {
  console.error("XATOLIK: .env faylida BOT_USERNAME topilmadi.");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Referal kodni kanalga qo'shilguncha vaqtincha saqlab turish uchun
const pendingPayload = new Map();
// Admin bilan matnli "suhbat" holatini saqlash uchun (masalan "kanal ro'yxatini kutyapmiz")
const adminState = new Map();

// ================== YORDAMCHI FUNKSIYALAR ==================

function isAdmin(telegramId) {
  return ADMIN_IDS.includes(telegramId);
}

function mainMenu() {
  return Markup.keyboard([
    ["📖 Loyiha haqida", "🔗 Referal havolam"],
    ["📊 Mening statistikam", "🏆 Top-10 reyting"],
  ]).resize();
}

function getReferralLink(telegramId) {
  return `https://t.me/${BOT_USERNAME}?start=${telegramId}`;
}

function channelDisplayUrl(value) {
  // value @username yoki https:// havola bo'lishi mumkin
  if (value.startsWith("http")) return value;
  return `https://t.me/${value.replace("@", "")}`;
}

// Foydalanuvchi barcha majburiy kanallarga a'zo bo'lganini tekshirish.
// Natija: { allSubscribed: bool, missing: [ {value} ] }
async function checkRequiredChannels(ctx, telegramId) {
  const channels = getRequiredChannels();
  if (channels.length === 0) return { allSubscribed: true, missing: [] };

  const missing = [];
  for (const ch of channels) {
    try {
      const member = await ctx.telegram.getChatMember(ch.value, telegramId);
      if (!["member", "administrator", "creator"].includes(member.status)) {
        missing.push(ch);
      }
    } catch (e) {
      // Bot kanalda admin bo'lmasa yoki kanal topilmasa - shu kanalni "obuna bo'lmagan" deb hisoblaymiz
      // va adminlarga muammoni bildiramiz (faqat konsolga)
      console.error(`Kanal tekshiruvida xato (${ch.value}):`, e.message);
      missing.push(ch);
    }
  }
  return { allSubscribed: missing.length === 0, missing };
}

function subscribeKeyboard(missingChannels) {
  const buttons = missingChannels.map((ch, i) => [
    Markup.button.url(
      `📢 Kanal ${i + 1}ga qo'shilish`,
      channelDisplayUrl(ch.value),
    ),
  ]);
  buttons.push([Markup.button.callback("✅ Tekshirish", "check_sub")]);
  return Markup.inlineKeyboard(buttons);
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
  if (user) return user;

  let referredBy = null;
  if (payload && !isNaN(Number(payload)) && Number(payload) !== telegramId) {
    const referrer = getUser(Number(payload));
    if (referrer) referredBy = Number(payload);
  }

  createUser({ telegramId, username, firstName, referredBy });

  if (referredBy) {
    incrementReferralCount(referredBy);
    logReferralEvent(referredBy, telegramId);
    await notifyReferrerAndCheckReward(ctx, referredBy);
  }

  return getUser(telegramId);
}

// Referal egasiga xabar yuborish + chegaraga yetgan bo'lsa maxfiy kanal linkini berish
async function notifyReferrerAndCheckReward(ctx, referrerId) {
  const referrerData = getUser(referrerId);
  if (!referrerData) return;

  const threshold = getReferralThreshold();
  const qoldi = Math.max(threshold - referrerData.referral_count, 0);

  try {
    if (qoldi > 0) {
      await ctx.telegram.sendMessage(
        referrerId,
        `🎉 Tabriklaymiz! Sizning havolangiz orqali yana 1 nafar ishtirokchi muvaffaqiyatli ro'yxatdan o'tdi.\n\n` +
          `✅ Sizning referallaringiz: ${referrerData.referral_count} ta.\n` +
          `🎯 Maxfiy kanalga kirish uchun yana ${qoldi} ta referal qoldi.`,
      );
    } else {
      await ctx.telegram.sendMessage(
        referrerId,
        `🎉 Tabriklaymiz! Sizning havolangiz orqali yana 1 nafar ishtirokchi muvaffaqiyatli ro'yxatdan o'tdi.\n\n` +
          `✅ Sizning referallaringiz: ${referrerData.referral_count} ta.`,
      );
    }
  } catch (e) {
    // Foydalanuvchi botni bloklagan bo'lishi mumkin
  }

  if (referrerData.referral_count >= threshold && !referrerData.reward_given) {
    await grantSecretChannelAccess(ctx, referrerId);
  }
}

// Maxfiy kanalga bir martalik taklif havolasi yaratib, foydalanuvchiga yuborish
async function grantSecretChannelAccess(ctx, telegramId) {
  const secretChannelId = getSetting("secret_channel_id");
  markRewardGiven(telegramId);

  if (!secretChannelId) {
    try {
      await ctx.telegram.sendMessage(
        telegramId,
        `🏆 Ajoyib! Siz kerakli referal soniga yetdingiz!\n\n` +
          `Hozircha maxfiy kanal havolasi sozlanmagan. Administrator siz bilan tez orada bog'lanadi.`,
      );
    } catch (e) {}
    return;
  }

  try {
    const invite = await ctx.telegram.createChatInviteLink(secretChannelId, {
      member_limit: 1,
      name: `referral-${telegramId}-${Date.now()}`,
    });
    await ctx.telegram.sendMessage(
      telegramId,
      `🏆 Tabriklaymiz! Siz kerakli referal soniga yetdingiz!\n\n` +
        `🔒 Maxfiy kanalga qo'shilish uchun havola (faqat bir marta ishlaydi):\n${invite.invite_link}`,
    );
  } catch (e) {
    console.error("Maxfiy kanal havolasini yaratishda xato:", e.message);
    try {
      await ctx.telegram.sendMessage(
        telegramId,
        `🏆 Siz kerakli referal soniga yetdingiz! Havola yaratishda texnik xatolik yuz berdi, administrator tez orada siz bilan bog'lanadi.`,
      );
    } catch (e2) {}
  }
}

// ================== /start ==================

bot.start(async (ctx) => {
  const telegramId = ctx.from.id;
  const username = ctx.from.username;
  const firstName = ctx.from.first_name;
  const payload = ctx.startPayload;

  const { allSubscribed, missing } = await checkRequiredChannels(
    ctx,
    telegramId,
  );

  if (!allSubscribed) {
    pendingPayload.set(telegramId, payload);
    return ctx.reply(
      `Assalomu alaykum, ${firstName || "aziz do'stimiz"}! 👋\n\n` +
        `Botdan foydalanish uchun quyidagi kanal(lar)ga qo'shiling, so'ng "✅ Tekshirish" tugmasini bosing.`,
      subscribeKeyboard(missing),
    );
  }

  await registerUserIfNew(ctx, telegramId, username, firstName, payload);

  await ctx.reply(
    `Assalomu alaykum, ${firstName || "aziz do'stimiz"}! 👋\n\n` +
      `Loyihaga xush kelibsiz. Do'stlaringizni taklif qiling va maxfiy kanalga kirish huquqiga ega bo'ling!`,
    mainMenu(),
  );
});

bot.action("check_sub", async (ctx) => {
  const telegramId = ctx.from.id;
  const username = ctx.from.username;
  const firstName = ctx.from.first_name;
  const payload = pendingPayload.get(telegramId);

  const { allSubscribed, missing } = await checkRequiredChannels(
    ctx,
    telegramId,
  );

  if (!allSubscribed) {
    return ctx.answerCbQuery(
      "❌ Siz hali barcha kanallarga qo'shilmadingiz. Iltimos, avval qo'shiling.",
      { show_alert: true },
    );
  }

  pendingPayload.delete(telegramId);
  await registerUserIfNew(ctx, telegramId, username, firstName, payload);
  await ctx.answerCbQuery("✅ Rahmat! Obuna tasdiqlandi.");
  try {
    await ctx.editMessageText(
      `Rahmat! Barcha kanallarga muvaffaqiyatli qo'shildingiz. 🎉`,
    );
  } catch (e) {}
  await ctx.reply("Quyidagi menyudan foydalaning:", mainMenu());
});

// ================== ASOSIY MENYU ==================

bot.hears("📖 Loyiha haqida", (ctx) => {
  ctx.reply(
    getSetting("project_text") || "Loyiha haqida ma'lumot hali kiritilmagan.",
  );
});

bot.hears("🔗 Referal havolam", (ctx) => {
  const link = getReferralLink(ctx.from.id);
  ctx.reply(
    `Sizning shaxsiy referal havolangiz:\n\n${link}\n\n` +
      `Ushbu havolani do'stlaringizga yuboring. Ular shu havola orqali botga kirib, barcha shartlarni bajarsa, sizga hisoblanadi.`,
  );
});

bot.hears("📊 Mening statistikam", (ctx) => {
  const user = getUser(ctx.from.id);
  if (!user) {
    return ctx.reply("Iltimos, avval /start buyrug'ini bosing.");
  }
  const threshold = getReferralThreshold();
  const qoldi = Math.max(threshold - user.referral_count, 0);
  const name = user.first_name || user.username || `ID:${user.telegram_id}`;

  let text =
    `👤 ${name}\n` +
    `🆔 Telegram ID: ${user.telegram_id}\n` +
    `✅ Referallar: ${user.referral_count} ta\n`;

  if (user.reward_given) {
    text += `🔒 Maxfiy kanal: olingan ✅`;
  } else if (qoldi > 0) {
    text += `🎯 Maxfiy kanalga kirish uchun yana ${qoldi} ta referal kerak.`;
  } else {
    text += `🎯 Siz shartni bajardingiz! Tez orada havola yuboriladi.`;
  }

  ctx.reply(text);
});

bot.hears("🏆 Top-10 reyting", (ctx) => {
  const top = getTopReferrers(10);
  if (top.length === 0) {
    return ctx.reply("Hozircha reyting bo'sh.");
  }
  let text = "🏆 Top-10 reyting:\n\n";
  top.forEach((u, i) => {
    const name = u.first_name || u.username || `ID:${u.telegram_id}`;
    text += `${i + 1}-o'rin — ${name} — ${u.referral_count} ta\n`;
  });
  ctx.reply(text);
});

// ================== ADMIN PANEL ==================

function adminMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📢 Majburiy kanallar", "adm_channels")],
    [Markup.button.callback("📝 Loyiha matni", "adm_project_text")],
    [Markup.button.callback("🔒 Maxfiy kanal", "adm_secret_channel")],
    [Markup.button.callback("🎯 Referal chegarasi", "adm_threshold")],
    [Markup.button.callback("📊 Statistika", "adm_stats")],
    [Markup.button.callback("🏆 Reyting", "adm_rating")],
    [Markup.button.callback("📣 Broadcast", "adm_broadcast")],
    [Markup.button.callback("➕➖ Referal sozlash", "adm_adjust_referral")],
    [Markup.button.callback("🗑 Barcha ma'lumotlarni tozalash", "adm_reset")],
  ]);
}

bot.command("admin", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx.reply("🛠 Admin panel:", adminMenu());
});

bot.action("adm_back", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminState.delete(ctx.from.id);
  ctx.editMessageText("🛠 Admin panel:", adminMenu()).catch(() => {});
});

// ---- Majburiy kanallar ----
bot.action("adm_channels", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const current = getRequiredChannels();
  const list = current.length
    ? current.map((c, i) => `${i + 1}. ${c.value}`).join("\n")
    : "Hozircha kanal qo'shilmagan.";
  adminState.set(ctx.from.id, { action: "set_channels" });
  ctx
    .editMessageText(
      `📢 Joriy majburiy kanallar:\n\n${list}\n\n` +
        `Yangi ro'yxat yuborish uchun kanal username'larini vergul bilan ajratib yuboring.\n` +
        `Misol: @kanal1, @kanal2, @kanal3\n\n` +
        `(Bot barcha kanallarda ADMIN bo'lishi shart, aks holda tekshira olmaydi)`,
      Markup.inlineKeyboard([[Markup.button.callback("« Orqaga", "adm_back")]]),
    )
    .catch(() => {});
});

// ---- Loyiha matni ----
bot.action("adm_project_text", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminState.set(ctx.from.id, { action: "set_project_text" });
  ctx
    .editMessageText(
      `📝 Joriy loyiha matni:\n\n${getSetting("project_text")}\n\n` +
        `Yangi matnni yuboring (shu matn "📖 Loyiha haqida" bo'limida ko'rinadi).`,
      Markup.inlineKeyboard([[Markup.button.callback("« Orqaga", "adm_back")]]),
    )
    .catch(() => {});
});

// ---- Maxfiy kanal ----
bot.action("adm_secret_channel", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const current = getSetting("secret_channel_id") || "sozlanmagan";
  adminState.set(ctx.from.id, { action: "set_secret_channel" });
  ctx
    .editMessageText(
      `🔒 Joriy maxfiy kanal ID: ${current}\n\n` +
        `Yangi maxfiy kanalni sozlash uchun o'sha kanaldan istalgan xabarni shu botga FORWARD qiling ` +
        `(bot avtomatik kanal ID sini aniqlaydi).\n\n` +
        `Bot maxfiy kanalda ADMIN bo'lishi va "invite link yaratish" huquqiga ega bo'lishi shart.`,
      Markup.inlineKeyboard([[Markup.button.callback("« Orqaga", "adm_back")]]),
    )
    .catch(() => {});
});

// ---- Referal chegarasi ----
bot.action("adm_threshold", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminState.set(ctx.from.id, { action: "set_threshold" });
  ctx
    .editMessageText(
      `🎯 Joriy chegara: ${getReferralThreshold()} ta referal.\n\n` +
        `Yangi sonni kiriting (masalan: 10).`,
      Markup.inlineKeyboard([[Markup.button.callback("« Orqaga", "adm_back")]]),
    )
    .catch(() => {});
});

// ---- Statistika ----
bot.action("adm_stats", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const stats = getStats();
  ctx
    .editMessageText(
      `📊 Umumiy statistika:\n\n` +
        `👤 Jami foydalanuvchilar: ${stats.totalUsers}\n` +
        `🔗 Jami referal o'tishlar: ${stats.totalReferrals}\n` +
        `🔒 Maxfiy kanalga kirganlar: ${stats.totalRewarded}`,
      Markup.inlineKeyboard([[Markup.button.callback("« Orqaga", "adm_back")]]),
    )
    .catch(() => {});
});

// ---- Reyting (admin ko'rinishida) ----
bot.action("adm_rating", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const top = getTopReferrers(10);
  let text =
    top.length === 0
      ? "Hozircha reyting bo'sh."
      : top
          .map((u, i) => {
            const name = u.first_name || u.username || `ID:${u.telegram_id}`;
            return `${i + 1}. ${name} (${u.telegram_id}) — ${u.referral_count} ta`;
          })
          .join("\n");
  ctx
    .editMessageText(
      `🏆 Top-10 reyting:\n\n${text}`,
      Markup.inlineKeyboard([[Markup.button.callback("« Orqaga", "adm_back")]]),
    )
    .catch(() => {});
});

// ---- Broadcast ----
bot.action("adm_broadcast", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminState.set(ctx.from.id, { action: "broadcast" });
  ctx
    .editMessageText(
      `📣 Barcha foydalanuvchilarga yuboriladigan xabar matnini kiriting:`,
      Markup.inlineKeyboard([[Markup.button.callback("« Orqaga", "adm_back")]]),
    )
    .catch(() => {});
});

// ---- Referal qo'shish/ayirish ----
bot.action("adm_adjust_referral", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  adminState.set(ctx.from.id, { action: "adjust_referral_wait_id" });
  ctx
    .editMessageText(
      `➕➖ Referal sonini o'zgartirmoqchi bo'lgan foydalanuvchining Telegram ID sini yuboring:`,
      Markup.inlineKeyboard([[Markup.button.callback("« Orqaga", "adm_back")]]),
    )
    .catch(() => {});
});

// ---- Barcha ma'lumotlarni tozalash (tasdiqlash bilan) ----
bot.action("adm_reset", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  ctx
    .editMessageText(
      `⚠️ DIQQAT!\n\n` +
        `Bu amal barcha foydalanuvchilar, referallar va statistikani BUTUNLAY o'chiradi.\n` +
        `Sozlamalar (kanallar, matn, chegara, maxfiy kanal) saqlanib qoladi.\n\n` +
        `Bu amalni ortga qaytarib bo'lmaydi. Davom etasizmi?`,
      Markup.inlineKeyboard([
        [Markup.button.callback("✅ Ha, tozalash", "adm_reset_confirm")],
        [Markup.button.callback("❌ Bekor qilish", "adm_back")],
      ]),
    )
    .catch(() => {});
});

bot.action("adm_reset_confirm", (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  resetAllData();
  ctx
    .editMessageText(
      "✅ Barcha foydalanuvchilar va statistika tozalandi. Bot yangi holatga qaytdi.",
      adminMenu(),
    )
    .catch(() => {});
});

// ================== ADMIN MATNLI KIRITISH (state machine) ==================

bot.on("text", async (ctx, next) => {
  const adminId = ctx.from.id;
  if (!isAdmin(adminId) || !adminState.has(adminId)) {
    return next(); // admin holatida emas -> oddiy menyu handlerlariga o'tkazamiz
  }

  const state = adminState.get(adminId);
  const text = ctx.message.text.trim();

  if (state.action === "set_channels") {
    const channels = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((v) => ({ value: v }));
    setRequiredChannels(channels);
    adminState.delete(adminId);
    return ctx.reply(
      `✅ Majburiy kanallar yangilandi (${channels.length} ta).`,
      adminMenu(),
    );
  }

  if (state.action === "set_project_text") {
    setSetting("project_text", text);
    adminState.delete(adminId);
    return ctx.reply(`✅ Loyiha matni yangilandi.`, adminMenu());
  }

  if (state.action === "set_threshold") {
    const n = parseInt(text, 10);
    if (isNaN(n) || n <= 0) {
      return ctx.reply("❌ Iltimos, musbat butun son kiriting (masalan: 10).");
    }
    setReferralThreshold(n);
    adminState.delete(adminId);
    return ctx.reply(
      `✅ Referal chegarasi ${n} ta qilib belgilandi.`,
      adminMenu(),
    );
  }

  if (state.action === "broadcast") {
    adminState.delete(adminId);
    const userIds = getAllUserIds();
    await ctx.reply(`📣 Yuborilmoqda... (${userIds.length} ta foydalanuvchi)`);
    let success = 0;
    let failed = 0;
    for (const uid of userIds) {
      try {
        await ctx.telegram.sendMessage(uid, text);
        success++;
      } catch (e) {
        failed++;
      }
      // Telegram flood-limitiga tushmaslik uchun kichik pauza
      await new Promise((r) => setTimeout(r, 50));
    }
    return ctx.reply(
      `✅ Broadcast tugadi.\nYuborildi: ${success}\nXato: ${failed}`,
      adminMenu(),
    );
  }

  if (state.action === "adjust_referral_wait_id") {
    const uid = Number(text);
    if (isNaN(uid)) {
      return ctx.reply("❌ Iltimos, faqat Telegram ID (raqam) kiriting.");
    }
    const user = getUser(uid);
    if (!user) {
      adminState.delete(adminId);
      return ctx.reply("❌ Bunday foydalanuvchi topilmadi.", adminMenu());
    }
    adminState.set(adminId, {
      action: "adjust_referral_wait_amount",
      targetId: uid,
    });
    return ctx.reply(
      `Foydalanuvchi topildi: ${user.first_name || user.username || uid} (joriy referal: ${user.referral_count})\n\n` +
        `Nechta referal qo'shish/ayirish kerak? (masalan: 3 yoki -2)`,
    );
  }

  if (state.action === "adjust_referral_wait_amount") {
    const delta = Number(text);
    if (isNaN(delta)) {
      return ctx.reply("❌ Iltimos, butun son kiriting (masalan: 3 yoki -2).");
    }
    const newCount = adjustReferralCount(state.targetId, delta);
    adminState.delete(adminId);

    const threshold = getReferralThreshold();
    const userAfter = getUser(state.targetId);
    if (userAfter.referral_count >= threshold && !userAfter.reward_given) {
      await grantSecretChannelAccess(ctx, state.targetId);
    }

    return ctx.reply(`✅ Yangi referal soni: ${newCount}`, adminMenu());
  }

  return next();
});

// Admin maxfiy kanalni sozlash uchun xabar forward qilganda
bot.on("message", async (ctx, next) => {
  const adminId = ctx.from.id;
  const state = adminState.get(adminId);

  if (
    isAdmin(adminId) &&
    state &&
    state.action === "set_secret_channel" &&
    ctx.message.forward_from_chat
  ) {
    const chatId = ctx.message.forward_from_chat.id;
    setSetting("secret_channel_id", String(chatId));
    adminState.delete(adminId);
    return ctx.reply(
      `✅ Maxfiy kanal sozlandi. Chat ID: ${chatId}`,
      adminMenu(),
    );
  }

  return next();
});

// Boshqa hech qanday handlerga mos kelmagan matnlar uchun eslatma
// (masalan, foydalanuvchi /start bosmasdan to'g'ridan-to'g'ri yozsa)
bot.on("text", (ctx) => {
  const user = getUser(ctx.from.id);
  if (!user) {
    return ctx.reply(
      `Assalomu alaykum! Bizning botimizga xush kelibsiz 👋\n\n` +
        `Botdan foydalanish uchun /start buyrug'ini bosing.`,
    );
  }
  return ctx.reply(`Iltimos, quyidagi menyudan foydalaning 👇`, mainMenu());
});

// ================== ISHGA TUSHIRISH ==================

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
