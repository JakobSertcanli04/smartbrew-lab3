/** @file Defines the authenticated HTTP API, order/payment transactions and simulated maintenance actions. */
const express = require('express');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const { openDatabase, hashPin, verifyPin } = require('./database');

const PAYMENT_METHODS = ['EMV chip', 'Contactless card', 'Apple Pay', 'Google Pay', 'Employee card'];

/**
 * Hash an opaque session token for database storage.
 * @param {string} token Browser token.
 * @returns {string} SHA-256 digest.
 */
function digest(token) { return createHash('sha256').update(token).digest('hex'); }

/**
 * Throw an HTTP error handled by Express.
 * @param {number} status HTTP code.
 * @param {string} message Public explanation.
 * @returns {never} Throws an error.
 */
function reject(status, message) { const error = new Error(message); error.status = status; throw error; }

/**
 * Build a local application with isolated persistent state.
 * @param {object} options Optional dbPath and initial adminPin.
 * @returns {import('express').Express} Express app with app.locals.db for shutdown/testing.
 */
function createApp(options = {}) {
  const db = openDatabase(options.dbPath || path.join(__dirname, '..', 'data', 'smartbrew.sqlite'), options.adminPin);
  const app = express();
  app.locals.db = db;
  app.disable('x-powered-by');
  app.use(express.json({ limit: '12kb' }));

  /**
   * Attach authenticated identity and enforce local browser request rules.
   * @param {object} req HTTP request.
   * @param {object} res HTTP response.
   * @param {Function} next Middleware continuation.
   * @returns {void} Continues with req.identity or sends/throws a client error.
   */
  function identify(req, res, next) {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (req.method === 'POST') {
      if (!req.is('application/json')) reject(415, 'Use application/json.');
      if (req.get('origin') && req.get('origin') !== `${req.protocol}://${req.get('host')}`) reject(403, 'Foreign browser origin rejected.');
    }
    const cookie = (req.headers.cookie || '').match(/(?:^|;\s*)smartbrew=([a-f0-9]{64})(?:;|$)/);
    if (cookie) {
      req.token = cookie[1];
      req.identity = db.prepare(`SELECT s.role,s.user_id,u.username,u.card_id FROM sessions s LEFT JOIN users u ON u.id=s.user_id
        WHERE s.token_hash=? AND s.expires_at>?`).get(digest(req.token), Date.now());
    }
    next();
  }
  app.use(identify);

  /**
   * Require a role on any route.
   * @param {string} role customer/admin.
   * @returns {Function} Middleware which continues or returns 401/403.
   */
  function requireRole(role) {
    /**
     * Check a request identity.
     * @param {object} req Request.
     * @param {object} res Response.
     * @param {Function} next Continue.
     * @returns {void} Continues or throws.
     */
    return function roleGuard(req, res, next) {
      if (!req.identity) reject(401, 'Authentication required.');
      if (req.identity.role !== role) reject(403, `${role === 'admin' ? 'Maintenance' : 'Customer'} access required.`);
      next();
    };
  }

  /**
   * Rotate the browser session after authentication.
   * @param {object} req Request.
   * @param {object} res Response.
   * @param {string} role Role.
   * @param {number|null} userId Customer ID or null.
   * @returns {void} Saves a hashed token and sets an eight-hour HttpOnly cookie.
   */
  function startSession(req, res, role, userId = null) {
    if (req.token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(req.token));
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(digest(token), role, userId, Date.now() + 28800000);
    res.cookie('smartbrew', token, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 28800000 });
  }

  /**
   * Read recipe/threshold/hardware guards for a drink, including capacity for its next preparation.
   * @param {object} drink SQLite beverage.
   * @returns {string[]} Blocking reasons; empty when eligible.
   */
  function blockers(drink) {
    const reasons = [];
    for (const [id, amount] of Object.entries(JSON.parse(drink.recipe))) {
      const ingredient = db.prepare('SELECT * FROM ingredients WHERE id=?').get(id);
      if (!ingredient || ingredient.level < amount || ingredient.level < ingredient.minimum) reasons.push(`${ingredient?.name || id}: insufficient stock or below minimum.`);
    }
    const waste = JSON.parse(drink.waste);
    if (!Object.keys(waste).length) reasons.push('Waste dependencies are not configured.');
    for (const [id, amount] of Object.entries(waste)) {
      const bin = db.prepare('SELECT * FROM bins WHERE id=?').get(id);
      if (!bin || bin.level + amount > bin.capacity || bin.level >= bin.capacity) reasons.push(`${bin?.name || id}: emptying required before this drink.`);
    }
    const faults = db.prepare('SELECT * FROM faults WHERE active=1').all();
    for (const fault of faults) if (fault.id === 'heater' || (fault.id === 'grinder' && drink.uses_grinder)) reasons.push(fault.message);
    return reasons;
  }

  /**
   * Read all current warning conditions. Input parameters: none.
   * @returns {string[]} Low ingredient, high waste and active fault warnings; no input.
   */
  function warnings() {
    const messages = db.prepare('SELECT message FROM faults WHERE active=1').all().map(/**
     * Extract a fault warning message.
     * @param {object} f Fault record containing message.
     * @returns {string} The fault message.
     */
    f => f.message);
    for (const i of db.prepare('SELECT * FROM ingredients').all()) {
      if (i.level <= i.capacity * 0.2 || i.level < i.minimum) messages.push(`${i.name}: ${i.level} ${i.unit} remaining (minimum ${i.minimum}).`);
    }
    for (const bin of db.prepare('SELECT * FROM bins').all()) {
      if (bin.level >= bin.capacity * 0.8) messages.push(`${bin.name}: ${bin.level >= bin.capacity ? 'full' : 'nearly full'}.`);
    }
    return messages;
  }

  /**
   * Persist a local diagnostic/maintenance event.
   * @param {string} kind Event category.
   * @param {string} message Human-readable message.
   * @returns {void} Inserts a timestamped event.
   */
  function logEvent(kind, message) { db.prepare('INSERT INTO events(kind,message) VALUES (?,?)').run(kind, message); }

  /**
   * Return one order owned by a customer.
   * @param {number} id Order ID.
   * @param {number} userId Owner ID.
   * @returns {object|undefined} Order with drink name.
   */
  function ownedOrder(id, userId) {
    return db.prepare('SELECT o.*,b.name AS beverage_name FROM orders o JOIN beverages b ON b.id=o.beverage_id WHERE o.id=? AND o.user_id=?').get(id, userId);
  }

  /** Register. Input: JSON username and 4–8 digit PIN. Output: 201 message and generated simulated linked-card ID; no automatic login. */
  app.post('/api/register', /**
   * Handle customer registration.
   * @param {import("express").Request} req JSON body with username and pin.
   * @param {import("express").Response} res Response receiving status 201 and message/cardId JSON.
   * @returns {void} Sends the registration response or throws a validation/conflict error.
   */
  (req, res) => {
    const { username, pin } = req.body || {};
    if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,24}$/.test(username) || typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) reject(400, 'Use 3–24 letters/digits/underscores for username and a 4–8 digit PIN.');
    if (username.toLowerCase() === 'admin' || db.prepare('SELECT id FROM users WHERE username=?').get(username)) reject(409, 'Username is already taken or reserved.');
    const cardId = `SB-${randomBytes(6).toString('hex').toUpperCase()}`;
    db.prepare('INSERT INTO users(username,pin_hash,card_id) VALUES (?,?,?)').run(username, hashPin(pin), cardId);
    res.status(201).json({ message: 'Account created. Log in using your username and PIN.', cardId });
  });

  /** Customer login. Input: username/PIN or simulated cardId. Output: welcome message and fresh session, or 401. */
  app.post('/api/login', /**
   * Authenticate a customer.
   * @param {import("express").Request} req JSON username/pin or simulated cardId, and previous session token if present.
   * @param {import("express").Response} res Receives a rotated session cookie and welcome message.
   * @returns {void} Sends confirmation or throws an authentication error.
   */
  (req, res) => {
    const { username, pin, cardId } = req.body || {};
    let user;
    if (typeof cardId === 'string' && /^SB-[A-F0-9]{12}$/.test(cardId)) user = db.prepare('SELECT * FROM users WHERE card_id=?').get(cardId);
    else if (typeof username === 'string' && typeof pin === 'string' && /^\d{4,8}$/.test(pin)) {
      user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
      if (user && !verifyPin(pin, user.pin_hash)) user = undefined;
    }
    if (!user) reject(401, 'Invalid credentials or simulated card ID.');
    startSession(req, res, 'customer', user.id);
    res.json({ message: `Welcome, ${user.username}.` });
  });

  /** Admin login. Input: separate technician PIN. Output: admin-only session or 401; normal credentials grant no privilege. */
  app.post('/api/admin/login', /**
   * Authenticate a maintenance technician separately from customers.
   * @param {import("express").Request} req JSON body containing the technician pin.
   * @param {import("express").Response} res Receives an admin session cookie and confirmation JSON.
   * @returns {void} Sends confirmation or throws on invalid credentials.
   */
  (req, res) => {
    const { pin } = req.body || {};
    const stored = db.prepare("SELECT value FROM settings WHERE key='admin_pin'").get().value;
    if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin) || !verifyPin(pin, stored)) reject(401, 'Invalid technician PIN.');
    startSession(req, res, 'admin');
    res.json({ message: 'Maintenance access granted.' });
  });

  /** Logout. Input: current session cookie. Output: session revocation, cleared cookie and confirmation. */
  app.post('/api/logout', /**
   * End the current authenticated session.
   * @param {import("express").Request} req Request containing the current session token when present.
   * @param {import("express").Response} res Receives a cleared cookie and logout confirmation.
   * @returns {void} Revokes the stored session and sends JSON.
   */
  (req, res) => {
    if (req.token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(req.token));
    res.clearCookie('smartbrew', { httpOnly: true, sameSite: 'strict', path: '/' });
    res.json({ message: 'Logged out.' });
  });
  /** Session inspection. Input: cookie. Output: public identity or null, without PIN hashes/tokens. */
  app.get('/api/me', /**
   * Return the safe current session identity.
   * @param {import("express").Request} req Request with optional authenticated identity.
   * @param {import("express").Response} res Response receiving identity or null as JSON.
   * @returns {import("express").Response} The response after sending JSON.
   */
  (req, res) => res.json({ identity: req.identity || null }));

  /** Menu browsing. Input: none. Output: names, prices, categories, ingredient quantities, nutrition and live availability. */
  app.get('/api/menu', /**
   * Return the public menu and supported simulated payment methods.
   * @param {import("express").Request} req Public request; no query/body inputs are required.
   * @param {import("express").Response} res Receives menu, nutrition, ingredients, blockers and method names.
   * @returns {void} Sends the menu JSON response.
   */
  (req, res) => {
    const menu = db.prepare('SELECT * FROM beverages ORDER BY id').all().map(/**
     * Convert one stored beverage into the public menu representation.
     * @param {object} drink SQLite beverage with encoded recipe/nutrition and server price.
     * @returns {object} Public drink data with decoded nutrition, ingredient labels and availability blockers.
     */
    drink => ({
      id: drink.id, name: drink.name, category: drink.category, price_cents: drink.price_cents,
      nutrition: JSON.parse(drink.nutrition),
      ingredients: Object.entries(JSON.parse(drink.recipe)).map(/**
       * Resolve an ingredient quantity to its public label and unit.
       * @param {[string, number]} ingredientEntry Destructured tuple [id, amount] from the recipe.
       * @returns {object} Ingredient name, unit and required amount.
       */
      ([id, amount]) => ({ ...db.prepare('SELECT name,unit FROM ingredients WHERE id=?').get(id), amount })),
      blockers: blockers(drink)
    }));
    res.json({ menu, paymentMethods: PAYMENT_METHODS });
  });

  /** Place a confirmed order. Input: customer session, beverageId and confirmed:true. Output: 201 server-priced pending order or guard failure. */
  app.post('/api/orders', requireRole('customer'), /**
   * Create a confirmed, server-priced pending customer order.
   * @param {import("express").Request} req Customer identity and JSON beverageId/confirmed:true.
   * @param {import("express").Response} res Receives status 201 and the owned order.
   * @returns {void} Sends the new order or throws on invalid confirmation/availability.
   */
  (req, res) => {
    const { beverageId, confirmed } = req.body || {};
    if (!Number.isSafeInteger(beverageId) || confirmed !== true) reject(400, 'Choose a beverage and explicitly confirm the order.');
    const drink = db.prepare('SELECT * FROM beverages WHERE id=?').get(beverageId);
    if (!drink) reject(404, 'Beverage not found.');
    const reasons = blockers(drink);
    if (reasons.length) reject(409, reasons.join(' '));
    const inserted = db.prepare('INSERT INTO orders(user_id,beverage_id,price_cents,recipe_snapshot) VALUES (?,?,?,?)').run(req.identity.user_id, drink.id, drink.price_cents, drink.recipe);
    res.status(201).json({ order: ownedOrder(Number(inserted.lastInsertRowid), req.identity.user_id) });
  });

  /** Pending checkout. Input: customer session. Output: owned unpaid orders only, surviving reload/login. */
  app.get('/api/orders', requireRole('customer'), /**
   * Return pending orders for the authenticated customer only.
   * @param {import("express").Request} req Request containing the customer identity.
   * @param {import("express").Response} res Receives the owned pending orders as JSON.
   * @returns {void} Sends the pending checkout response.
   */
  (req, res) => {
    const orders = db.prepare(`SELECT o.*,b.name AS beverage_name FROM orders o JOIN beverages b ON b.id=o.beverage_id
      WHERE o.user_id=? AND o.status='pending' ORDER BY o.id DESC`).all(req.identity.user_id);
    res.json({ orders });
  });

  /** Simulate cashless payment and immediate preparation atomically.
   * Input: customer session, owned order ID, payment method and accepted/declined outcome.
   * Output: paid order and stock/waste updates once, or a failure without partial consumption.
   */
  app.post('/api/orders/:id/pay', requireRole('customer'), /**
   * Process a simulated payment and prepare the owned order atomically.
   * @param {import("express").Request} req Customer identity, params.id, and JSON method/outcome.
   * @param {import("express").Response} res Receives the paid order and preparation confirmation.
   * @returns {void} Commits stock/bin/order changes once, or rolls back and throws a rejection.
   */
  (req, res) => {
    const id = Number(req.params.id);
    const { method, outcome } = req.body || {};
    if (!Number.isSafeInteger(id) || id < 1 || !PAYMENT_METHODS.includes(method) || !['accepted', 'declined'].includes(outcome)) reject(400, 'Choose a valid order, payment method and simulated outcome.');
    db.exec('BEGIN IMMEDIATE');
    try {
      const order = ownedOrder(id, req.identity.user_id);
      if (!order) reject(404, 'Order not found.');
      if (order.status === 'paid') reject(409, 'This order is already paid.');
      if (outcome === 'declined') reject(402, 'Simulated payment declined. No stock was consumed; you can retry.');
      const drink = db.prepare('SELECT * FROM beverages WHERE id=?').get(order.beverage_id);
      const reasons = blockers(drink);
      if (reasons.length) reject(409, reasons.join(' '));
      const before = new Set(warnings());
      for (const [ingredient, amount] of Object.entries(JSON.parse(order.recipe_snapshot))) db.prepare('UPDATE ingredients SET level=level-? WHERE id=?').run(amount, ingredient);
      for (const [bin, amount] of Object.entries(JSON.parse(drink.waste))) db.prepare('UPDATE bins SET level=level+? WHERE id=?').run(amount, bin);
      db.prepare("UPDATE orders SET status='paid',payment_method=?,paid_at=CURRENT_TIMESTAMP WHERE id=?").run(method, id);
      for (const warning of warnings()) if (!before.has(warning)) logEvent('warning', warning);
      db.exec('COMMIT');
      res.json({ order: ownedOrder(id, req.identity.user_id), message: 'Payment accepted. Your beverage is prepared and ready to collect.' });
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  });

  /** Machine monitoring. Input: admin session. Output: persistent readings, healthy/fault state, warnings and recent diagnostic events. */
  app.get('/api/admin/status', requireRole('admin'), /**
   * Return protected machine readings and recent diagnostic events.
   * @param {import("express").Request} req Authenticated admin request; no additional inputs required.
   * @param {import("express").Response} res Receives status, levels, faults, warnings and events.
   * @returns {void} Sends the current dashboard JSON.
   */
  (req, res) => {
    const drinks = db.prepare('SELECT * FROM beverages').all();
    const ready = drinks.filter(/**
     * Determine whether a beverage can currently be prepared.
     * @param {object} drink Stored beverage passed to the shared readiness guards.
     * @returns {boolean} True when no ingredient, waste or hardware blocker exists.
     */
    drink => blockers(drink).length === 0).length;
    res.json({ status: ready === 0 ? 'Blocked' : ready < drinks.length ? 'Limited' : 'Ready',
      ingredients: db.prepare('SELECT * FROM ingredients ORDER BY name').all(), bins: db.prepare('SELECT * FROM bins ORDER BY id').all(),
      faults: db.prepare('SELECT * FROM faults').all(), warnings: warnings(),
      events: db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 20').all() });
  });

  /** Register disposal of exactly one bin. Input: admin session, bin ID and emptied:true. Output: selected counter reset, others unchanged. */
  app.post('/api/admin/bins/:id/dispose', requireRole('admin'), /**
   * Register physical disposal of one selected waste bin.
   * @param {import("express").Request} req Admin identity, params.id and JSON emptied:true.
   * @param {import("express").Response} res Receives disposal confirmation.
   * @returns {void} Resets only the selected bin and records an event, or throws.
   */
  (req, res) => {
    if (req.body?.emptied !== true) reject(400, 'Confirm that this bin has been physically emptied.');
    const bin = db.prepare('SELECT * FROM bins WHERE id=?').get(req.params.id);
    if (!bin) reject(404, 'Waste bin not found.');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE bins SET level=0 WHERE id=?').run(bin.id);
      logEvent('maintenance', `${bin.name}: disposal registered; counter reset to zero.`);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.json({ message: `${bin.name} disposal registered.` });
  });

  /** Register one full refill. Input: admin session, ingredient ID and refilled:true. Output: selected level restored to configured maximum. */
  app.post('/api/admin/ingredients/:id/refill', requireRole('admin'), /**
   * Register a physical full refill for one ingredient.
   * @param {import("express").Request} req Admin identity, params.id and JSON refilled:true.
   * @param {import("express").Response} res Receives refill confirmation.
   * @returns {void} Restores only the selected ingredient and records an event, or throws.
   */
  (req, res) => {
    if (req.body?.refilled !== true) reject(400, 'Confirm that this ingredient has been fully refilled.');
    const ingredient = db.prepare('SELECT * FROM ingredients WHERE id=?').get(req.params.id);
    if (!ingredient) reject(404, 'Ingredient not found.');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE ingredients SET level=capacity WHERE id=?').run(ingredient.id);
      logEvent('maintenance', `${ingredient.name}: full refill registered.`);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.json({ message: `${ingredient.name} refilled to maximum.` });
  });

  /** Set a simulated hardware fault for demonstrating monitoring.
   * Input: admin session, known fault ID and active boolean. Output: updated fault and diagnostic event.
   */
  app.post('/api/admin/faults/:id', requireRole('admin'), /**
   * Apply or clear one local simulated hardware fault.
   * @param {import("express").Request} req Admin identity, known params.id and JSON active boolean.
   * @param {import("express").Response} res Receives the resulting fault-state confirmation.
   * @returns {void} Updates the fault and diagnostic event atomically, or throws.
   */
  (req, res) => {
    if (typeof req.body?.active !== 'boolean') reject(400, 'Supply an active boolean.');
    const fault = db.prepare('SELECT * FROM faults WHERE id=?').get(req.params.id);
    if (!fault) reject(404, 'Fault simulator not found.');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE faults SET active=? WHERE id=?').run(Number(req.body.active), fault.id);
      logEvent('hardware', `${fault.message}: ${req.body.active ? 'simulated fault detected' : 'fault cleared'}.`);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.json({ message: `${fault.message}: ${req.body.active ? 'active' : 'cleared'}.` });
  });

  /** Serve protected maintenance HTML. Input: admin cookie. Output: HTML or authentication error. */
  app.get('/admin', requireRole('admin'), /**
   * Serve the maintenance dashboard after the admin role guard.
   * @param {import("express").Request} req Authenticated administrator request.
   * @param {import("express").Response} res Sends the protected HTML file.
   * @returns {void} Starts delivery of admin.html; sendFile has no return value.
   */
  (req, res) => res.sendFile(path.join(__dirname, '..', 'views', 'admin.html')));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  /** Handle missing resources. Input: unmatched request. Output: 404 JSON. */
  app.use(/**
   * Respond to an unmatched route.
   * @param {import("express").Request} req Request that matched no page or endpoint.
   * @param {import("express").Response} res Receives status 404 and an error object.
   * @returns {import("express").Response} The response after sending the error JSON.
   */
  (req, res) => res.status(404).json({ error: 'Page or endpoint not found.' }));
  /**
   * Handle rejected requests and unexpected failures.
   * @param {Error} error Failure.
   * @param {object} req Request.
   * @param {object} res Response.
   * @param {Function} next Required Express error signature.
   * @returns {void} Sends readable JSON; logs unexpected failures locally.
   */
  function handleError(error, req, res, next) {
    const status = error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : error.status || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? 'Unexpected server error.' : error.type === 'entity.parse.failed' ? 'Invalid JSON.' : error.message });
  }
  app.use(handleError);
  return app;
}

module.exports = { createApp, PAYMENT_METHODS };
