const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "referral.db"));
db.pragma("journal_mode = WAL");

// ---------- Jadvallar ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    referred_by INTEGER,
    referral_count INTEGER DEFAULT 0,
    reward_given INTEGER DEFAULT 0,
    joined_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS referral_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_id INTEGER,
    referred_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ---------- Standart sozlamalar (agar mavjud bo'lmasa) ----------
const DEFAULTS = {
  project_text:
    "📖 Loyiha haqida\n\n" +
    "Bu loyiha orqali do'stlaringizni taklif qilib, maxfiy kanalga kirish huquqiga ega bo'lasiz.\n\n" +
    "✅ Ishtirok shartlari: barcha majburiy kanallarga obuna bo'ling va do'stlaringizni taklif qiling.\n" +
    "🏆 G'oliblar: eng ko'p referal yig'gan foydalanuvchilar reytingda ko'rinadi.\n" +
    "🔒 Mukofot: kerakli referal soniga yetgan foydalanuvchi avtomatik maxfiy kanalga taklif olinadi.\n\n" +
    "Admin bu matnni istalgan vaqtda o'zgartirishi mumkin.",
  required_channels: JSON.stringify([]), // [{ "value": "@kanal1" }, ...]
  secret_channel_id: "",
  referral_threshold: "10",
};

function initDefaults() {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  );
  for (const [key, value] of Object.entries(DEFAULTS)) {
    insert.run(key, value);
  }
}
initDefaults();

// ---------- Sozlamalar (settings) ----------
function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(
    `
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `,
  ).run(key, value);
}

function getRequiredChannels() {
  try {
    return JSON.parse(getSetting("required_channels") || "[]");
  } catch (e) {
    return [];
  }
}

function setRequiredChannels(channelsArray) {
  setSetting("required_channels", JSON.stringify(channelsArray));
}

function getReferralThreshold() {
  return parseInt(getSetting("referral_threshold") || "10", 10);
}

function setReferralThreshold(n) {
  setSetting("referral_threshold", String(n));
}

// ---------- Userlar ----------
function getUser(telegramId) {
  return db
    .prepare("SELECT * FROM users WHERE telegram_id = ?")
    .get(telegramId);
}

function createUser({ telegramId, username, firstName, referredBy }) {
  const stmt = db.prepare(`
    INSERT INTO users (telegram_id, username, first_name, referred_by)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(telegramId, username || null, firstName || null, referredBy || null);
}

function incrementReferralCount(referrerId) {
  db.prepare(
    "UPDATE users SET referral_count = referral_count + 1 WHERE telegram_id = ?",
  ).run(referrerId);
}

// Admin tomonidan qo'lda referal qo'shish/ayirish (manfiy bo'lishi mumkin)
function adjustReferralCount(telegramId, delta) {
  const user = getUser(telegramId);
  if (!user) return null;
  let newCount = user.referral_count + delta;
  if (newCount < 0) newCount = 0;
  db.prepare("UPDATE users SET referral_count = ? WHERE telegram_id = ?").run(
    newCount,
    telegramId,
  );
  return newCount;
}

function logReferralEvent(referrerId, referredId) {
  db.prepare(
    "INSERT INTO referral_events (referrer_id, referred_id) VALUES (?, ?)",
  ).run(referrerId, referredId);
}

function markRewardGiven(telegramId) {
  db.prepare("UPDATE users SET reward_given = 1 WHERE telegram_id = ?").run(
    telegramId,
  );
}

function getTopReferrers(limit = 10) {
  return db
    .prepare(
      `
    SELECT telegram_id, username, first_name, referral_count
    FROM users
    ORDER BY referral_count DESC
    LIMIT ?
  `,
    )
    .all(limit);
}

function getAllUserIds() {
  return db
    .prepare("SELECT telegram_id FROM users")
    .all()
    .map((r) => r.telegram_id);
}

function getStats() {
  const totalUsers = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
  const totalReferrals = db
    .prepare("SELECT COUNT(*) as c FROM referral_events")
    .get().c;
  const totalRewarded = db
    .prepare("SELECT COUNT(*) as c FROM users WHERE reward_given = 1")
    .get().c;
  return { totalUsers, totalReferrals, totalRewarded };
}

module.exports = {
  db,
  getUser,
  createUser,
  incrementReferralCount,
  adjustReferralCount,
  logReferralEvent,
  markRewardGiven,
  getTopReferrers,
  getAllUserIds,
  getStats,
  getSetting,
  setSetting,
  getRequiredChannels,
  setRequiredChannels,
  getReferralThreshold,
  setReferralThreshold,
};
