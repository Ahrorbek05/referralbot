const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'referral.db'));
db.pragma('journal_mode = WAL');

// Jadvallarni yaratish (agar mavjud bo'lmasa)
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
`);

function getUser(telegramId) {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

function createUser({ telegramId, username, firstName, referredBy }) {
  const stmt = db.prepare(`
    INSERT INTO users (telegram_id, username, first_name, referred_by)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(telegramId, username || null, firstName || null, referredBy || null);
}

function incrementReferralCount(referrerId) {
  db.prepare('UPDATE users SET referral_count = referral_count + 1 WHERE telegram_id = ?').run(referrerId);
}

function logReferralEvent(referrerId, referredId) {
  db.prepare('INSERT INTO referral_events (referrer_id, referred_id) VALUES (?, ?)').run(referrerId, referredId);
}

function markRewardGiven(telegramId) {
  db.prepare('UPDATE users SET reward_given = 1 WHERE telegram_id = ?').run(telegramId);
}

function getTopReferrers(limit = 10) {
  return db.prepare(`
    SELECT telegram_id, username, first_name, referral_count
    FROM users
    ORDER BY referral_count DESC
    LIMIT ?
  `).all(limit);
}

function getStats() {
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalReferrals = db.prepare('SELECT COUNT(*) as c FROM referral_events').get().c;
  return { totalUsers, totalReferrals };
}

module.exports = {
  db,
  getUser,
  createUser,
  incrementReferralCount,
  logReferralEvent,
  markRewardGiven,
  getTopReferrers,
  getStats,
};
