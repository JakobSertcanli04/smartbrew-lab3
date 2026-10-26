/** @file Owns SQLite initialization, reproducible seeds and salted PIN verification. */
const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const { dirname } = require('node:path');
const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');

/**
 * Hash a PIN with a random salt.
 * @param {string} pin Plain PIN.
 * @returns {string} Encoded salt and scrypt hash.
 */
function hashPin(pin) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pin, salt, 64).toString('hex')}`;
}

/**
 * Compare a PIN against its stored hash.
 * @param {string} pin Supplied PIN.
 * @param {string} encoded Salt/hash.
 * @returns {boolean} Whether the PIN matches.
 */
function verifyPin(pin, encoded) {
  const [salt, expected] = encoded.split(':');
  return timingSafeEqual(scryptSync(pin, salt, 64), Buffer.from(expected, 'hex'));
}

/**
 * Create/open SQLite and seed only missing initial data.
 * @param {string} filename Database path or :memory: for tests.
 * @param {string} adminPin Initial technician PIN; ignored once configured.
 * @returns {DatabaseSync} Open database, owned and closed by the caller.
 */
function openDatabase(filename, adminPin = '2468') {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pin_hash TEXT NOT NULL, card_id TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('customer','admin')),
      user_id INTEGER REFERENCES users(id), expires_at INTEGER NOT NULL,
      CHECK((role='admin' AND user_id IS NULL) OR (role='customer' AND user_id IS NOT NULL))
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL,
      level INTEGER NOT NULL CHECK(level>=0 AND level<=capacity),
      capacity INTEGER NOT NULL CHECK(capacity>0), minimum INTEGER NOT NULL CHECK(minimum>=0 AND minimum<=capacity)
    );
    CREATE TABLE IF NOT EXISTS bins (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL,
      level INTEGER NOT NULL CHECK(level>=0 AND level<=capacity), capacity INTEGER NOT NULL CHECK(capacity>0)
    );
    CREATE TABLE IF NOT EXISTS beverages (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK(price_cents>0), nutrition TEXT NOT NULL,
      recipe TEXT NOT NULL, waste TEXT NOT NULL, uses_grinder INTEGER NOT NULL CHECK(uses_grinder IN (0,1))
    );
    CREATE TABLE IF NOT EXISTS faults (id TEXT PRIMARY KEY, message TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)));
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      beverage_id INTEGER NOT NULL REFERENCES beverages(id), price_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid')),
      recipe_snapshot TEXT NOT NULL, payment_method TEXT,
      confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, paid_at TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, kind TEXT NOT NULL, message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare("SELECT value FROM settings WHERE key='admin_pin'").get()) {
      if (!/^\d{4,8}$/.test(adminPin)) throw new Error('ADMIN_PIN must contain 4–8 digits.');
      db.prepare('INSERT INTO settings VALUES (?,?)').run('admin_pin', hashPin(adminPin));
    }
    const ingredients = [
      ['coffee', 'Coffee beans', 'g', 180, 18], ['milk', 'Milk', 'ml', 1000, 100],
      ['water', 'Water', 'ml', 3000, 100], ['tea', 'Tea leaves', 'g', 60, 3],
      ['cocoa', 'Cocoa powder', 'g', 300, 25], ['cups', 'Cups', 'pcs', 30, 1]
    ];
    for (const [id, name, unit, capacity, minimum] of ingredients) {
      db.prepare('INSERT OR IGNORE INTO ingredients VALUES (?,?,?,?,?,?)').run(id, name, unit, capacity, capacity, minimum);
    }
    for (const [id, name, unit, capacity] of [['liquid', 'Liquid waste', 'ml', 500], ['grounds', 'Coffee grounds', 'g', 90]]) {
      db.prepare('INSERT OR IGNORE INTO bins VALUES (?,?,?,?,?)').run(id, name, unit, 0, capacity);
    }
    const drinks = [
      [1, 'Espresso', 'Coffee', 2000, { kcal: 3, protein: 0.2, carbohydrates: 0.5, sugars: 0, fat: 0.1 }, { coffee: 18, water: 60, cups: 1 }, { liquid: 20, grounds: 18 }, 1],
      [2, 'Cappuccino', 'Coffee', 3000, { kcal: 80, protein: 4, carbohydrates: 6, sugars: 6, fat: 4 }, { coffee: 18, water: 60, milk: 120, cups: 1 }, { liquid: 25, grounds: 18 }, 1],
      [3, 'Latte', 'Coffee', 3500, { kcal: 130, protein: 7, carbohydrates: 10, sugars: 10, fat: 7 }, { coffee: 18, water: 60, milk: 200, cups: 1 }, { liquid: 25, grounds: 18 }, 1],
      [4, 'Tea', 'Other', 1500, { kcal: 2, protein: 0, carbohydrates: 0.4, sugars: 0, fat: 0 }, { tea: 3, water: 250, cups: 1 }, { liquid: 25 }, 0],
      [5, 'Hot Chocolate', 'Other', 3000, { kcal: 210, protein: 7, carbohydrates: 30, sugars: 25, fat: 7 }, { cocoa: 25, milk: 200, water: 50, cups: 1 }, { liquid: 30 }, 0]
    ];
    for (const [id, name, category, price, nutrition, recipe, waste, grinder] of drinks) {
      db.prepare('INSERT OR IGNORE INTO beverages VALUES (?,?,?,?,?,?,?,?)').run(id, name, category, price, JSON.stringify(nutrition), JSON.stringify(recipe), JSON.stringify(waste), grinder);
    }
    db.prepare('INSERT OR IGNORE INTO faults VALUES (?,?,0)').run('grinder', 'Grinder jammed');
    db.prepare('INSERT OR IGNORE INTO faults VALUES (?,?,0)').run('heater', 'Water heater fault');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    throw error;
  }
  return db;
}

module.exports = { openDatabase, hashPin, verifyPin };
