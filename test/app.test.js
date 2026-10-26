/** @file Verifies the ten selected functions over HTTP using isolated SQLite state and explicit cleanup. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { createApp, PAYMENT_METHODS } = require('../src/app');

/**
 * Start an isolated application for a test.
 * @param {object} t Test context.
 * @param {string} [dbPath] Optional SQLite filename.
 * @returns {Promise<object>} App, URL and idempotent stop function; cleanup registered automatically.
 */
async function fixture(t, dbPath = ':memory:') {
  const app = createApp({ dbPath });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  let stopped = false;
  /**
   * Release this fixture. Input: none. Input parameters: none.
   * @returns {Promise<void>} Stops HTTP and SQLite once.
   */
  async function stop() {
    if (stopped) return;
    stopped = true;
    await new Promise(/**
     * Stop the test HTTP server before SQLite is closed.
     * @param {Function} resolve Completes cleanup when the listener closes.
     * @param {Function} reject Reports a listener-close failure.
     * @returns {import("node:http").Server} The server returned by server.close(); promise settlement happens in its callback.
     */
    (resolve, reject) => server.close(/**
     * Settle fixture cleanup after the HTTP listener closes.
     * @param {Error|undefined} error Optional close error from Node.
     * @returns {void} Rejects or resolves the enclosing cleanup promise.
     */
    error => error ? reject(error) : resolve()));
    app.locals.db.close();
  }
  t.after(stop);
  return { app, url: `http://127.0.0.1:${server.address().port}`, stop };
}

/**
 * Create a browser-like request helper with its own cookie jar.
 * @param {string} url Server origin.
 * @returns {Function} Async request(route, optional body, optional headers) yielding status/body/headers.
 */
function browser(url) {
  let cookie = '';
  /**
   * Issue a browser-like HTTP request and maintain its private session cookie.
   * @param {string} route Relative endpoint path.
   * @param {object} [body] JSON POST data; absent for GET.
   * @param {object} [headers={}] Additional HTTP headers.
   * @returns {Promise<object>} Result containing status, headers and parsed JSON or text body.
   */
  return async (route, body, headers = {}) => {
    const response = await fetch(url + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, headers: response.headers, body: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text() };
  };
}

/**
 * Register and authenticate a test customer.
 * @param {Function} request Browser helper.
 * @param {string} [username] Unique username.
 * @returns {Promise<object>} Registration result containing simulated linked-card ID.
 */
async function customer(request, username = 'student') {
  const registration = await request('/api/register', { username, pin: '1234' });
  assert.equal(registration.status, 201);
  assert.equal((await request('/api/login', { username, pin: '1234' })).status, 200);
  return registration.body;
}

/**
 * Authenticate a maintenance browser.
 * @param {Function} request Browser helper.
 * @returns {Promise<void>} Asserts separate technician access.
 */
async function admin(request) { assert.equal((await request('/api/admin/login', { pin: '2468' })).status, 200); }

/**
 * Create one confirmed pending order.
 * @param {Function} request Authenticated browser.
 * @param {number} [beverageId] Drink ID.
 * @returns {Promise<number>} Inserted order ID, asserting success.
 */
async function order(request, beverageId = 1) {
  const result = await request('/api/orders', { beverageId, confirmed: true });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.order.id;
}

/**
 * Pay using the local simulator.
 * @param {Function} request Browser.
 * @param {number} id Order ID.
 * @param {string} [outcome] accepted/declined.
 * @returns {Promise<object>} HTTP result from payment endpoint.
 */
function pay(request, id, outcome = 'accepted') { return request(`/api/orders/${id}/pay`, { method: 'Contactless card', outcome }); }

test('registration validates input, rejects duplicate names and stores salted hashes', /**
 * Verify that registration validates input, rejects duplicate names and stores salted hashes.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves when HTTP/database assertions pass; rejects on any failed assertion.
 */
async t => {
  const { app, url } = await fixture(t);
  const request = browser(url);
  assert.equal((await request('/api/register', { username: 'ab', pin: '1234' })).status, 400);
  assert.equal((await request('/api/register', { username: 'student', pin: 'abcd' })).status, 400);
  const first = await request('/api/register', { username: 'student', pin: '1234', role: 'admin' });
  assert.equal(first.status, 201);
  assert.match(first.body.cardId, /^SB-[A-F0-9]{12}$/);
  assert.equal((await request('/api/me')).body.identity, null);
  assert.equal((await request('/api/register', { username: 'STUDENT', pin: '5678' })).status, 409);
  assert.equal((await request('/api/register', { username: 'admin', pin: '5678' })).status, 409);
  assert.notEqual(app.locals.db.prepare("SELECT pin_hash FROM users WHERE username='student'").get().pin_hash, '1234');
});

test('username/PIN and simulated NFC login reject invalid input; logout revokes replayed sessions', /**
 * Verify that username/PIN and simulated NFC login reject invalid input; logout revokes replayed sessions.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves when HTTP/database assertions pass; rejects on any failed assertion.
 */
async t => {
  const { url } = await fixture(t);
  const request = browser(url);
  const registered = await customer(request);
  assert.equal((await request('/api/login', { username: 'student', pin: '9999' })).status, 401);
  assert.equal((await request('/api/login', { username: "' OR 1=1--", pin: '1234' })).status, 401);
  await request('/api/logout', {});
  assert.equal((await request('/api/login', { cardId: 'SB-000000000000' })).status, 401);
  const login = await request('/api/login', { cardId: registered.cardId });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal((await request('/api/me')).body.identity.username, 'student');
  await request('/api/logout', {});
  const replay = await fetch(url + '/api/orders', { headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(replay.status, 401);
});

test('public pages and five beverages expose prices, ingredients and full nutritional values', /**
 * Verify that public pages and five beverages expose prices, ingredients and full nutritional values.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves when HTTP/database assertions pass; rejects on any failed assertion.
 */
async t => {
  const { url } = await fixture(t);
  const request = browser(url);
  for (const route of ['/', '/admin-login.html', '/styles.css', '/app.js']) assert.equal((await request(route)).status, 200);
  const { menu, paymentMethods } = (await request('/api/menu')).body;
  assert.deepEqual(menu.map(/**
   * Extract a menu name for the seeded-catalogue assertion.
   * @param {object} d Public beverage.
   * @returns {string} Beverage name.
   */
  d => d.name), ['Espresso', 'Cappuccino', 'Latte', 'Tea', 'Hot Chocolate']);
  assert.equal(paymentMethods.length, 5);
  for (const drink of menu) {
    assert.ok(drink.price_cents > 0);
    assert.ok(drink.ingredients.length);
    for (const field of ['kcal', 'protein', 'carbohydrates', 'sugars', 'fat']) assert.equal(typeof drink.nutrition[field], 'number');
    assert.deepEqual(drink.blockers, []);
  }
});

test('ordering requires a customer, explicit confirmation and a server-calculated price', /**
 * Verify that ordering requires a customer, explicit confirmation and a server-calculated price.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves when HTTP/database assertions pass; rejects on any failed assertion.
 */
async t => {
  const { url } = await fixture(t);
  const request = browser(url);
  assert.equal((await request('/api/orders', { beverageId: 1, confirmed: true })).status, 401);
  await customer(request);
  assert.equal((await request('/api/orders', { beverageId: 1 })).status, 400);
  assert.equal((await request('/api/orders', { beverageId: 999, confirmed: true })).status, 404);
  const placed = await request('/api/orders', { beverageId: 1, confirmed: true, price_cents: 1 });
  assert.equal(placed.status, 201);
  assert.equal(placed.body.order.price_cents, 2000);
  assert.equal(placed.body.order.status, 'pending');
});

test('accepted payment consumes the fixed recipe and increments only dependent bins exactly once', /**
 * Verify that accepted payment consumes the fixed recipe and increments only dependent bins exactly once.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves when HTTP/database assertions pass; rejects on any failed assertion.
 */
async t => {
  const { app, url } = await fixture(t);
  const request = browser(url);
  await customer(request);
  const id = await order(request, 3);
  const paid = await pay(request, id);
  assert.equal(paid.status, 200);
  assert.equal(paid.body.order.status, 'paid');
  const levels = Object.fromEntries(app.locals.db.prepare('SELECT id,level FROM ingredients').all().map(/**
   * Convert a stock reading to a lookup entry for assertions.
   * @param {object} i Ingredient ID and level.
   * @returns {Array} Tuple [ingredient ID, level].
   */
  i => [i.id, i.level]));
  assert.deepEqual(levels, { coffee: 162, milk: 800, water: 2940, tea: 60, cocoa: 300, cups: 29 });
  assert.equal(app.locals.db.prepare("SELECT level FROM bins WHERE id='grounds'").get().level, 18);
  assert.equal(app.locals.db.prepare("SELECT level FROM bins WHERE id='liquid'").get().level, 25);
  assert.equal((await pay(request, id)).status, 409);
  assert.equal(app.locals.db.prepare("SELECT level FROM bins WHERE id='grounds'").get().level, 18);
  assert.equal((await request('/api/orders')).body.orders.length, 0);
});

test('all declared payment methods work in the local simulator', /**
 * Verify that all declared payment methods work in the local simulator.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves when HTTP/database assertions pass; rejects on any failed assertion.
 */
async t => {
  const { url } = await fixture(t);
  const request = browser(url);
  await customer(request);
  for (const method of PAYMENT_METHODS) {
    const id = await order(request, 4);
    assert.equal((await request(`/api/orders/${id}/pay`, { method, outcome: 'accepted' })).status, 200);
  }
});

test('declined and malformed payments never consume ingredients and allow valid retry', /**
 * Verify that declined and malformed payments never consume ingredients and allow valid retry.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves when HTTP/database assertions pass; rejects on any failed assertion.
 */
async t => {
  const { app, url } = await fixture(t);
  const request = browser(url);
  await customer(request);
  const id = await order(request);
  assert.equal((await pay(request, id, 'declined')).status, 402);
  assert.equal((await request(`/api/orders/${id}/pay`, { method: 'cash', outcome: 'accepted' })).status, 400);
  assert.equal(app.locals.db.prepare("SELECT level FROM ingredients WHERE id='coffee'").get().level, 180);
  assert.equal(app.locals.db.prepare("SELECT level FROM bins WHERE id='grounds'").get().level, 0);
  assert.equal((await request('/api/orders')).body.orders[0].status, 'pending');
  assert.equal((await pay(request, id)).status, 200);
});

test('admin HTML, status and all maintenance actions require separate authentication; logout revokes admin', /**
 * Verify that admin HTML, status and all maintenance actions require separate authentication; logout revokes admin.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves when HTTP/database assertions pass; rejects on any failed assertion.
 */
async t => {
  const { url } = await fixture(t);
  const request = browser(url);
  assert.equal((await request('/admin')).status, 401);
  assert.equal((await request('/views/admin.html')).status, 404);
  await customer(request);
  assert.equal((await request('/admin')).status, 403);
  assert.equal((await request('/api/admin/status')).status, 403);
  assert.equal((await request('/api/admin/bins/grounds/dispose', { emptied: true })).status, 403);
  assert.equal((await request('/api/admin/ingredients/coffee/refill', { refilled: true })).status, 403);
  assert.equal((await request('/api/admin/faults/grinder', { active: true })).status, 403);
  assert.equal((await request('/api/admin/login', { pin: '1234' })).status, 401);
  const login = await request('/api/admin/login', { pin: '2468' });
  assert.equal(login.status, 200);
  assert.equal((await request('/admin')).status, 200);
  assert.equal((await request('/api/orders', { beverageId: 1, confirmed: true })).status, 403);
  const oldCookie = login.headers.get('set-cookie').split(';')[0];
  await request('/api/logout', {});
  assert.equal((await fetch(url + '/admin', { headers: { Cookie: oldCookie } })).status, 401);
});

test('customers cannot read or pay another customer’s pending order', /**
 * Verify that customers cannot read or pay another customer’s pending order.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves when HTTP/database assertions pass; rejects on any failed assertion.
 */
async t => {
  const { url } = await fixture(t);
  const alice = browser(url), bob = browser(url);
  await customer(alice, 'alice');
  await customer(bob, 'bob');
  const id = await order(alice);
  assert.equal((await bob('/api/orders')).body.orders.length, 0);
  assert.equal((await pay(bob, id)).status, 404);
  assert.equal((await pay(alice, id)).status, 200);
});

test('below-minimum ingredients block selection and payment of a previously pending order', /**
 * Verify that below-minimum ingredients block selection and payment of a previously pending order.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves when HTTP/database assertions pass; rejects on any failed assertion.
 */
async t => {
  const { app, url } = await fixture(t);
  const request = browser(url);
  await customer(request);
  const id = await order(request);
  // Enough water for a 60 ml Espresso, but below the independently configured 100 ml minimum.
  app.locals.db.prepare("UPDATE ingredients SET level=90 WHERE id='water'").run();
  assert.equal((await request('/api/orders', { beverageId: 1, confirmed: true })).status, 409);
  assert.ok((await request('/api/menu')).body.menu.find(/**
   * Find the Espresso menu entry under an availability block.
   * @param {object} d Public beverage with numeric ID.
   * @returns {boolean} True for beverage ID 1.
   */
  d => d.id === 1).blockers.length);
  assert.equal((await pay(request, id)).status, 409);
  assert.equal(app.locals.db.prepare("SELECT level FROM ingredients WHERE id='coffee'").get().level, 180);
  assert.equal(app.locals.db.prepare("SELECT level FROM bins WHERE id='grounds'").get().level, 0);
});

test('full grounds bin blocks coffee while verified independent tea remains available; disposal resets only selected bin', /**
 * Verify that full grounds bin blocks coffee while verified independent tea remains available; disposal resets only selected bin.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves when HTTP/database assertions pass; rejects on any failed assertion.
 */
async t => {
  const { app, url } = await fixture(t);
  const request = browser(url), maintenance = browser(url);
  await customer(request);
  app.locals.db.prepare("UPDATE bins SET level=capacity WHERE id='grounds'").run();
  assert.equal((await request('/api/orders', { beverageId: 1, confirmed: true })).status, 409);
  assert.equal((await pay(request, await order(request, 4))).status, 200);
  await admin(maintenance);
  assert.equal((await maintenance('/api/admin/status')).body.status, 'Limited');
  assert.equal((await maintenance('/api/admin/bins/grounds/dispose', {})).status, 400);
  assert.equal((await maintenance('/api/admin/bins/grounds/dispose', { emptied: true })).status, 200);
  assert.equal(app.locals.db.prepare("SELECT level FROM bins WHERE id='grounds'").get().level, 0);
  assert.equal(app.locals.db.prepare("SELECT level FROM bins WHERE id='liquid'").get().level, 25);
  app.locals.db.prepare("UPDATE bins SET level=capacity WHERE id='liquid'").run();
  assert.equal((await maintenance('/api/admin/status')).body.status, 'Blocked');
  assert.equal((await request('/api/orders', { beverageId: 4, confirmed: true })).status, 409);
});

test('refill resets one ingredient to maximum and requires physical-refill confirmation', /**
 * Verify that refill resets one ingredient to maximum and requires physical-refill confirmation.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves when HTTP/database assertions pass; rejects on any failed assertion.
 */
async t => {
  const { app, url } = await fixture(t);
  const request = browser(url);
  await admin(request);
  app.locals.db.prepare("UPDATE ingredients SET level=0 WHERE id='coffee'").run();
  app.locals.db.prepare("UPDATE ingredients SET level=120 WHERE id='milk'").run();
  assert.equal((await request('/api/admin/ingredients/coffee/refill', {})).status, 400);
  assert.equal((await request('/api/admin/ingredients/unknown/refill', { refilled: true })).status, 404);
  assert.equal((await request('/api/admin/ingredients/coffee/refill', { refilled: true })).status, 200);
  assert.equal(app.locals.db.prepare("SELECT level FROM ingredients WHERE id='coffee'").get().level, 180);
  assert.equal(app.locals.db.prepare("SELECT level FROM ingredients WHERE id='milk'").get().level, 120);
});

test('monitoring shows healthy state, selective fault blocks, global heater block, warnings and diagnostic events', /**
 * Verify that monitoring shows healthy state, selective fault blocks, global heater block, warnings and diagnostic events.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves when HTTP/database assertions pass; rejects on any failed assertion.
 */
async t => {
  const { url } = await fixture(t);
  const request = browser(url);
  await admin(request);
  const initial = (await request('/api/admin/status')).body;
  assert.equal(initial.status, 'Ready');
  assert.deepEqual(initial.warnings, []);
  await request('/api/admin/faults/grinder', { active: true });
  const limited = (await request('/api/admin/status')).body;
  assert.equal(limited.status, 'Limited');
  assert.ok(limited.warnings.includes('Grinder jammed'));
  assert.ok(limited.events.some(/**
   * Detect the logged simulated grinder fault.
   * @param {object} e Diagnostic event with message.
   * @returns {boolean} True when the event mentions the grinder fault.
   */
  e => e.message.includes('Grinder jammed')));
  await request('/api/admin/faults/heater', { active: true });
  assert.equal((await request('/api/admin/status')).body.status, 'Blocked');
  await request('/api/admin/faults/grinder', { active: false });
  assert.equal((await request('/api/admin/status')).body.status, 'Blocked');
  await request('/api/admin/faults/heater', { active: false });
  assert.equal((await request('/api/admin/status')).body.status, 'Ready');
});

test('competing payments cannot oversell the last recipe worth of coffee', /**
 * Verify that competing payments cannot oversell the last recipe worth of coffee.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves when HTTP/database assertions pass; rejects on any failed assertion.
 */
async t => {
  const { app, url } = await fixture(t);
  const request = browser(url);
  await customer(request);
  app.locals.db.prepare("UPDATE ingredients SET level=18 WHERE id='coffee'").run();
  const first = await order(request), second = await order(request);
  const paid = await Promise.all([pay(request, first), pay(request, second)]);
  assert.deepEqual(paid.map(/**
   * Extract each competing payment result status.
   * @param {object} r HTTP helper result.
   * @returns {number} HTTP status for the concurrency assertion.
   */
  r => r.status).sort(), [200, 409]);
  assert.equal(app.locals.db.prepare("SELECT level FROM ingredients WHERE id='coffee'").get().level, 0);
  assert.equal(app.locals.db.prepare("SELECT level FROM bins WHERE id='grounds'").get().level, 18);
});

test('accounts, sessions, orders, supplies and events persist across database reopening', /**
 * Verify that accounts, sessions, orders, supplies and events persist across database reopening.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves when HTTP/database assertions pass; rejects on any failed assertion.
 */
async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'smartbrew-test-'));
  const dbPath = path.join(directory, 'test.sqlite');
  let first, second;
  try {
    first = await fixture(t, dbPath);
    const request = browser(first.url), maintenance = browser(first.url);
    await customer(request);
    const login = await request('/api/login', { username: 'student', pin: '1234' });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const id = await order(request);
    await pay(request, id);
    await admin(maintenance);
    await maintenance('/api/admin/faults/grinder', { active: true });
    await first.stop();
    second = await fixture(t, dbPath);
    const restored = browser(second.url);
    assert.equal((await restored('/api/me', undefined, { Cookie: cookie })).body.identity.username, 'student');
    assert.equal(second.app.locals.db.prepare("SELECT level FROM ingredients WHERE id='coffee'").get().level, 162);
    assert.equal(second.app.locals.db.prepare("SELECT level FROM bins WHERE id='grounds'").get().level, 18);
    assert.equal(second.app.locals.db.prepare('SELECT status FROM orders WHERE id=?').get(id).status, 'paid');
    assert.equal(second.app.locals.db.prepare("SELECT active FROM faults WHERE id='grinder'").get().active, 1);
    assert.ok(second.app.locals.db.prepare('SELECT COUNT(*) AS n FROM events').get().n > 0);
  } finally {
    await first?.stop(); await second?.stop();
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep + 'smartbrew-test-'));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('malformed JSON, foreign origins and unsupported content types are rejected', /**
 * Verify that malformed JSON, foreign origins and unsupported content types are rejected.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves when HTTP/database assertions pass; rejects on any failed assertion.
 */
async t => {
  const { url } = await fixture(t);
  const request = browser(url);
  assert.equal((await request('/api/register', { username: 'student', pin: '1234' }, { Origin: 'https://foreign.example' })).status, 403);
  const malformed = await fetch(url + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(malformed.status, 400);
  const form = await fetch(url + '/api/register', { method: 'POST', body: 'username=student' });
  assert.equal(form.status, 415);
  const anonymous = await request('/api/me', undefined, { Cookie: 'smartbrew=not-a-token' });
  assert.equal(anonymous.body.identity, null);
});

test('expired sessions cannot access protected endpoints', /**
 * Verify that expiration is enforced when a stored cookie is replayed, without a new login.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves if a previously valid expired session is denied; rejects on failed assertions.
 */
async t => {
  const { app, url } = await fixture(t);
  const request = browser(url);
  await customer(request);
  assert.equal((await request('/api/orders')).status, 200);
  app.locals.db.prepare('UPDATE sessions SET expires_at=?').run(Date.now() - 1000);
  assert.equal((await request('/api/orders')).status, 401);
  assert.equal((await request('/api/me')).body.identity, null);
});

test('a new login revokes the previous cookie while preserving the new session', /**
 * Verify session rotation by replaying an older cookie after a second login in the same browser.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves if the old cookie is rejected and the current session still works.
 */
async t => {
  const { url } = await fixture(t);
  const request = browser(url);
  await customer(request);
  const first = await request('/api/login', { username: 'student', pin: '1234' });
  const firstCookie = first.headers.get('set-cookie').split(';')[0];
  const second = await request('/api/login', { username: 'student', pin: '1234' });
  assert.equal(second.status, 200);
  assert.notEqual(second.headers.get('set-cookie').split(';')[0], firstCookie);
  const replay = await fetch(url + '/api/orders', { headers: { Cookie: firstCookie } });
  assert.equal(replay.status, 401);
  assert.equal((await request('/api/orders')).status, 200);
});

test('stock above minimum but below the recipe quantity blocks selection and pending payment', /**
 * Verify a 150 ml milk supply cannot prepare a 200 ml Latte even though the minimum is only 100 ml.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves if selection/payment reject without consuming ingredients or waste capacity.
 */
async t => {
  const { app, url } = await fixture(t);
  const request = browser(url);
  await customer(request);
  const pending = await order(request, 3);
  app.locals.db.prepare("UPDATE ingredients SET level=150 WHERE id='milk'").run();
  assert.equal((await request('/api/orders', { beverageId: 3, confirmed: true })).status, 409);
  assert.equal((await pay(request, pending)).status, 409);
  assert.equal(app.locals.db.prepare("SELECT level FROM ingredients WHERE id='milk'").get().level, 150);
  assert.equal(app.locals.db.prepare("SELECT level FROM ingredients WHERE id='coffee'").get().level, 180);
  assert.equal(app.locals.db.prepare("SELECT level FROM bins WHERE id='grounds'").get().level, 0);
  assert.equal(app.locals.db.prepare('SELECT status FROM orders WHERE id=?').get(pending).status, 'pending');
});

test('remaining waste capacity must fit the next drink before selection or payment', /**
 * Verify coffee is rejected at 85/90 g grounds while an independent Tea remains eligible.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves if capacity is checked before overflow, with no partial consumption.
 */
async t => {
  const { app, url } = await fixture(t);
  const request = browser(url);
  await customer(request);
  const pending = await order(request, 1);
  app.locals.db.prepare("UPDATE bins SET level=85 WHERE id='grounds'").run();
  assert.equal((await request('/api/orders', { beverageId: 1, confirmed: true })).status, 409);
  assert.equal((await pay(request, pending)).status, 409);
  assert.equal(app.locals.db.prepare("SELECT level FROM ingredients WHERE id='coffee'").get().level, 180);
  assert.equal((await pay(request, await order(request, 4))).status, 200);
  assert.equal(app.locals.db.prepare("SELECT level FROM bins WHERE id='grounds'").get().level, 85);
  assert.equal(app.locals.db.prepare("SELECT level FROM bins WHERE id='liquid'").get().level, 25);
});

test('low-stock warnings include the exact twenty-percent boundary and exclude the next unit', /**
 * Verify the documented early-warning boundary separately from the lower selection minimum.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves if coffee warns at 36 g and does not warn at 37 g.
 */
async t => {
  const { app, url } = await fixture(t);
  const request = browser(url);
  await admin(request);
  app.locals.db.prepare("UPDATE ingredients SET level=36 WHERE id='coffee'").run();
  assert.match((await request('/api/admin/status')).body.warnings.join('\n'), /Coffee beans:/);
  app.locals.db.prepare("UPDATE ingredients SET level=37 WHERE id='coffee'").run();
  assert.doesNotMatch((await request('/api/admin/status')).body.warnings.join('\n'), /Coffee beans:/);
});

test('waste warnings start at eighty percent rather than waiting for a full bin', /**
 * Verify the early grounds-bin warning at and immediately below its documented boundary.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves if 72/90 g warns and 71/90 g does not.
 */
async t => {
  const { app, url } = await fixture(t);
  const request = browser(url);
  await admin(request);
  app.locals.db.prepare("UPDATE bins SET level=72 WHERE id='grounds'").run();
  assert.match((await request('/api/admin/status')).body.warnings.join('\n'), /Coffee grounds: nearly full\./);
  app.locals.db.prepare("UPDATE bins SET level=71 WHERE id='grounds'").run();
  assert.doesNotMatch((await request('/api/admin/status')).body.warnings.join('\n'), /Coffee grounds:/);
});

test('nutritional values match the documented demo catalogue, not just numeric field types', /**
 * Verify actual per-serving seed values for every drink without copying them from the API/database under test.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves if all five nutrition objects match the approved demonstration data.
 */
async t => {
  const { url } = await fixture(t);
  const request = browser(url);
  const expected = {
    Espresso: { kcal: 3, protein: 0.2, carbohydrates: 0.5, sugars: 0, fat: 0.1 },
    Cappuccino: { kcal: 80, protein: 4, carbohydrates: 6, sugars: 6, fat: 4 },
    Latte: { kcal: 130, protein: 7, carbohydrates: 10, sugars: 10, fat: 7 },
    Tea: { kcal: 2, protein: 0, carbohydrates: 0.4, sugars: 0, fat: 0 },
    'Hot Chocolate': { kcal: 210, protein: 7, carbohydrates: 30, sugars: 25, fat: 7 }
  };
  const { menu } = (await request('/api/menu')).body;
  assert.equal(menu.length, Object.keys(expected).length);
  for (const drink of menu) assert.deepEqual(drink.nutrition, expected[drink.name], drink.name);
});

test('the published menu price matches the confirmed and paid order price', /**
 * Verify price agreement across browsing, server confirmation and successful simulated payment.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves if the same beverage amount is used throughout checkout.
 */
async t => {
  const { url } = await fixture(t);
  const request = browser(url);
  await customer(request);
  const { menu } = (await request('/api/menu')).body;
  const drink = menu[0];
  const placed = await request('/api/orders', { beverageId: drink.id, confirmed: true });
  assert.equal(placed.status, 201);
  assert.equal(placed.body.order.price_cents, drink.price_cents);
  const paid = await pay(request, placed.body.order.id);
  assert.equal(paid.status, 200);
  assert.equal(paid.body.order.price_cents, drink.price_cents);
});

test('a storage failure after ingredient updates rolls back stock, bins and payment state', /**
 * Inject a bin-write failure after stock deduction to verify real rollback rather than early rejection only.
 * @param {import("node:test").TestContext} t Isolated test context used for fixtures and cleanup.
 * @returns {Promise<void>} Resolves if every persisted value is restored and retry succeeds after removing the fault.
 */
async t => {
  const { app, url } = await fixture(t);
  const request = browser(url);
  await customer(request);
  const pending = await order(request, 3);
  const db = app.locals.db;
  const before = {
    ingredients: db.prepare('SELECT * FROM ingredients ORDER BY id').all(),
    bins: db.prepare('SELECT * FROM bins ORDER BY id').all(),
    order: db.prepare('SELECT * FROM orders WHERE id=?').get(pending)
  };
  // FAIL aborts this write without rolling back earlier statements in the transaction.
  // This forces the application's own catch/ROLLBACK path to undo the stock changes.
  db.exec("CREATE TRIGGER fail_bin_write BEFORE UPDATE ON bins BEGIN SELECT RAISE(FAIL,'Injected bin-write failure'); END;");
  t.mock.method(console, 'error', /**
   * Suppress the expected injected database error in the test output.
   * Input parameters: none; the logger arguments are intentionally unused.
   * @returns {void} No output; the HTTP result and database state are asserted separately.
   */
  () => {});
  assert.equal((await pay(request, pending)).status, 500);
  assert.deepEqual(db.prepare('SELECT * FROM ingredients ORDER BY id').all(), before.ingredients);
  assert.deepEqual(db.prepare('SELECT * FROM bins ORDER BY id').all(), before.bins);
  assert.deepEqual(db.prepare('SELECT * FROM orders WHERE id=?').get(pending), before.order);
  db.exec('DROP TRIGGER fail_bin_write');
  assert.equal((await pay(request, pending)).status, 200);
  assert.equal(db.prepare("SELECT level FROM ingredients WHERE id='milk'").get().level, 800);
});
