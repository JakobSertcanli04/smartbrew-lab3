/** @file Connects customer/admin forms and controls to the local API and renders escaped interface data. */
let identity = null;
let menu = [];
let paymentMethods = [];
let category = 'All';
let selectedDrink = null;
let polling = null;

/**
 * Fetch a local endpoint.
 * @param {string} url Relative URL.
 * @param {object} [body] Optional JSON POST data.
 * @returns {Promise<object>} Parsed result; throws a readable Error with status on failure.
 */
async function api(url, body) {
  const response = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'Request failed.'); error.status = response.status; throw error; }
  return data;
}

/**
 * Escape text before inserting it into markup.
 * @param {*} value Input value.
 * @returns {string} HTML-safe text.
 */
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, /**
 * Replace one unsafe HTML character with its entity.
 * @param {string} c Matched ampersand, bracket or quote character.
 * @returns {string} The corresponding HTML entity.
 */
c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]); }

/**
 * Format server-calculated money.
 * @param {number} cents Integer ore.
 * @returns {string} SEK amount.
 */
function money(cents) { return new Intl.NumberFormat('en-SE', { style: 'currency', currency: 'SEK' }).format(cents / 100); }

/**
 * Display accessible feedback.
 * @param {string} message Explanation.
 * @param {boolean} [error] Error appearance.
 * @returns {void} Updates notice.
 */
function notify(message, error = false) {
  const notice = document.querySelector('#notice');
  notice.textContent = message;
  notice.hidden = false;
  notice.classList.toggle('error', error);
  if (error && document.querySelector('#confirm-dialog')?.open) {
    const inlineError = document.querySelector('#confirm-error');
    inlineError.textContent = message;
    inlineError.hidden = false;
  }
}

/**
 * Prevent repeat clicks and show request failures.
 * @param {HTMLButtonElement} button Trigger.
 * @param {Function} action Async callback.
 * @returns {Promise<void>} Runs work, catches errors and restores the button.
 */
async function run(button, action) {
  button.disabled = true;
  try { await action(); } catch (error) { notify(error.message, true); }
  finally { button.disabled = false; }
}

/**
 * Render cached menu data for the current identity/category. Input: module menu/category/identity state. Input parameters: none.
 * @returns {void} Replaces beverage cards with safe markup.
 */
function renderMenu() {
  document.querySelector('#menu').innerHTML = menu.filter(/**
   * Filter menu data by the selected category.
   * @param {object} d Beverage with a category field.
   * @returns {boolean} True when the drink belongs in the current view.
   */
  d => category === 'All' || d.category === category).map(/**
   * Render one beverage card.
   * @param {object} drink Public menu item containing price, ingredients, nutrition and blockers.
   * @returns {string} Escaped card HTML reflecting current identity and availability.
   */
  drink => `
    <article class="drink"><div class="drink-number">0${drink.id} / ${escapeHtml(drink.category.toUpperCase())}</div>
      <div class="drink-top"><h3>${escapeHtml(drink.name)}</h3><span class="price">${money(drink.price_cents)}</span></div>
      <p class="ingredient-note">${drink.ingredients.map(/**
       * Format one visible ingredient quantity.
       * @param {object} i Ingredient name, amount and unit.
       * @returns {string} HTML-safe ingredient label.
       */
      i => escapeHtml(`${i.name} (${i.amount} ${i.unit})`)).join(' · ')}</p>
      <details><summary>Nutritional values</summary><p class="small muted">Per serving · approximate demo values</p><dl class="nutrition"><dt>Energy</dt><dd>${drink.nutrition.kcal} kcal</dd><dt>Protein</dt><dd>${drink.nutrition.protein} g</dd><dt>Carbohydrates</dt><dd>${drink.nutrition.carbohydrates} g</dd><dt>of which sugars</dt><dd>${drink.nutrition.sugars} g</dd><dt>Fat</dt><dd>${drink.nutrition.fat} g</dd></dl></details>
      ${drink.blockers.length ? `<p class="blocked">${escapeHtml(drink.blockers.join(' '))}</p>` : ''}
      <button data-action="choose" data-id="${drink.id}" ${drink.blockers.length || identity?.role !== 'customer' ? 'disabled' : ''}>${drink.blockers.length ? 'Currently unavailable' : identity?.role === 'customer' ? 'Place order' : 'Log in to order'}</button>
    </article>`).join('');
}

/**
 * Refresh stock-aware menu data. Input: current session. Input parameters: none.
 * @returns {Promise<void>} Updates module menu/payment methods and cards.
 */
async function loadMenu() { const data = await api('/api/menu'); menu = data.menu; paymentMethods = data.paymentMethods; renderMenu(); }

/**
 * Restore unpaid orders after login/refresh. Input: module identity. Input parameters: none.
 * @returns {Promise<void>} Renders owned pending orders and payment controls.
 */
async function loadOrders() {
  const container = document.querySelector('#orders');
  if (identity?.role !== 'customer') { container.textContent = identity ? 'Use a customer login to place orders.' : 'Log in and choose a beverage to begin.'; return; }
  const { orders } = await api('/api/orders');
  container.innerHTML = orders.length ? orders.map(/**
   * Render one pending order in checkout.
   * @param {object} order Owned order containing its ID, beverage name and server price.
   * @returns {string} Escaped order markup with method and outcome controls.
   */
  order => `
    <div class="order"><strong>${escapeHtml(order.beverage_name)}</strong><p class="small">Order #${order.id} · Confirmed · ${money(order.price_cents)}</p>
      <label for="method-${order.id}">Simulated payment method</label><select id="method-${order.id}">${paymentMethods.map(/**
       * Render one simulated payment method option.
       * @param {string} method Server-provided payment method name.
       * @returns {string} An escaped option element.
       */
      method => `<option>${escapeHtml(method)}</option>`).join('')}</select>
      <button data-action="pay" data-id="${order.id}" data-outcome="accepted">Simulate accepted payment</button><button class="secondary" data-action="pay" data-id="${order.id}" data-outcome="declined">Simulate declined payment</button></div>`).join('') : '<p class="small">Choose a beverage to place an order.</p>';
}

/**
 * Refresh customer account, menu and checkout. Input: browser cookie. Input parameters: none.
 * @returns {Promise<void>} Updates identity, account controls and orderable menu.
 */
async function loadCustomer() {
  ({ identity } = await api('/api/me'));
  document.querySelector('#account-forms').hidden = Boolean(identity);
  document.querySelector('#customer-info').hidden = !identity;
  document.querySelector('#identity-name').textContent = identity ? identity.role === 'admin' ? 'Signed in as maintenance technician.' : `Signed in as ${identity.username}.` : '';
  document.querySelector('#identity-card').textContent = identity?.card_id ? `Your simulated NFC card: ${identity.card_id}` : '';
  document.querySelector('#dashboard-link').hidden = identity?.role !== 'admin';
  await loadMenu();
  await loadOrders();
}

/**
 * Load protected live machine readings. Input: administrator session. Input parameters: none.
 * @returns {Promise<void>} Updates stock, bins, warnings, faults and event log; redirects on session expiry.
 */
async function loadStatus() {
  let state;
  try { state = await api('/api/admin/status'); }
  catch (error) { if ([401, 403].includes(error.status)) { clearInterval(polling); window.location.replace('/admin-login.html'); return; } throw error; }
  document.querySelector('#machine-status').textContent = state.status;
  document.querySelector('#last-reading').textContent = new Date().toLocaleTimeString();
  document.querySelector('#ingredient-rows').innerHTML = state.ingredients.map(/**
   * Render one maintenance ingredient reading.
   * @param {object} i Ingredient identity, current level, unit, minimum and capacity.
   * @returns {string} Escaped table-row HTML with its refill control.
   */
  i => `<tr><th scope="row">${escapeHtml(i.name)}</th><td>${i.level} ${escapeHtml(i.unit)}</td><td>${i.minimum}</td><td>${i.capacity}</td><td><button class="secondary compact" data-action="refill" data-id="${escapeHtml(i.id)}" aria-label="Register full refill of ${escapeHtml(i.name)}">Refill to max</button></td></tr>`).join('');
  document.querySelector('#bins').innerHTML = state.bins.map(/**
   * Render one independent waste-bin reading.
   * @param {object} bin Bin identity, level, unit and capacity.
   * @returns {string} Escaped bin markup with meter and disposal control.
   */
  bin => `<div class="bin"><strong>${escapeHtml(bin.name)}</strong><p class="small">${bin.level} / ${bin.capacity} ${escapeHtml(bin.unit)}</p><meter min="0" max="${bin.capacity}" value="${bin.level}" aria-label="${escapeHtml(bin.name)} level"></meter><button class="secondary compact" data-action="dispose" data-id="${escapeHtml(bin.id)}">Register emptying</button></div>`).join('');
  document.querySelector('#warnings').innerHTML = state.warnings.length ? `<ul>${state.warnings.map(/**
   * Render one current machine warning.
   * @param {string} w Human-readable warning text.
   * @returns {string} An escaped list item.
   */
  w => `<li class="small">${escapeHtml(w)}</li>`).join('')}</ul>` : '<p class="small muted">No warnings. Machine levels and hardware are healthy.</p>';
  document.querySelector('#faults').innerHTML = state.faults.map(/**
   * Render one simulated hardware indicator and its control.
   * @param {object} f Fault identity, message and active state.
   * @returns {string} Escaped fault-control HTML.
   */
  f => `<div class="fault"><p><strong>${escapeHtml(f.message)}</strong> · ${f.active ? 'Fault active' : 'Healthy'}</p><button class="secondary compact" data-action="fault" data-id="${escapeHtml(f.id)}" data-active="${!f.active}">${f.active ? 'Clear simulated fault' : 'Simulate fault'}</button></div>`).join('');
  document.querySelector('#events').innerHTML = state.events.length ? state.events.map(/**
   * Render one diagnostic event.
   * @param {object} e Event timestamp and message.
   * @returns {string} Escaped event markup with its UTC timestamp.
   */
  e => `<div class="event"><time>${escapeHtml(e.created_at)} UTC</time><span>${escapeHtml(e.message)}</span></div>`).join('') : '<p class="small muted">No diagnostic events yet.</p>';
}

/**
 * Submit account forms with explicit input validation supplied by HTML and server.
 * @param {SubmitEvent} event Form submit.
 * @returns {void} Starts async registration/login with feedback.
 */
function handleSubmit(event) {
  const form = event.target;
  if (!['login', 'card-login', 'register', 'admin-login'].includes(form.id)) return;
  event.preventDefault();
  run(form.querySelector('button'), /**
   * Submit the selected registration or login form and update the interface.
   * Input parameters: none; any captured state is described below.
   * @returns {Promise<void>} Resolves after authentication/registration feedback or navigation; rejects on request failure. Uses the enclosing form DOM state.
   */
  async () => {
    const fields = Object.fromEntries(new FormData(form));
    if (form.id === 'admin-login') { await api('/api/admin/login', fields); window.location.assign('/admin'); return; }
    if (form.id === 'card-login') fields.cardId = fields.cardId.trim().toUpperCase();
    const result = await api(form.id === 'register' ? '/api/register' : '/api/login', fields);
    form.reset();
    if (form.id === 'register') {
      document.querySelector('#username').value = fields.username;
      document.querySelector('#pin').focus();
      notify(`${result.message} Your simulated NFC card is ${result.cardId}. It will also appear after login.`);
    } else { await loadCustomer(); notify(result.message); }
  });
}

/**
 * Dispatch interface controls without inline scripts.
 * @param {MouseEvent} event Click event.
 * @returns {void} Runs the selected feature action and renders feedback.
 */
function handleClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const { action, id } = button.dataset;
  if (action === 'filter') {
    category = button.dataset.category;
    for (const filter of document.querySelectorAll('[data-action="filter"]')) { const selected = filter === button; filter.classList.toggle('selected', selected); filter.setAttribute('aria-pressed', String(selected)); }
    renderMenu(); return;
  }
  if (action === 'choose') {
    selectedDrink = menu.find(/**
     * Locate the drink selected by its order button.
     * @param {object} drink Public menu item with numeric ID.
     * @returns {boolean} True when the item matches the enclosing button ID.
     */
    drink => drink.id === Number(id));
    document.querySelector('#confirm-error').hidden = true;
    document.querySelector('#confirm-description').textContent = `${selectedDrink.name} · ${money(selectedDrink.price_cents)}`;
    document.querySelector('#confirm-dialog').showModal(); return;
  }
  if (action === 'close-dialog') { document.querySelector('#confirm-dialog').close(); return; }
  if (action === 'refill' && !window.confirm('Have you physically refilled this ingredient to maximum capacity?')) return;
  if (action === 'dispose' && !window.confirm('Have you physically emptied this selected waste bin?')) return;
  run(button, /**
   * Execute the selected customer or maintenance action.
   * Input parameters: none; any captured state is described below.
   * @returns {Promise<void>} Resolves after mutation/refresh/navigation or rejects for run() to display. Reads the enclosing button action, ID and DOM fields.
   */
  async () => {
    if (action === 'logout') {
      await api('/api/logout', {});
      if (document.body.dataset.page === 'admin') window.location.replace('/admin-login.html');
      else { await loadCustomer(); notify('Logged out.'); }
    } else if (action === 'confirm-order') {
      const { order } = await api('/api/orders', { beverageId: selectedDrink.id, confirmed: true });
      document.querySelector('#confirm-dialog').close();
      await loadOrders(); notify(`Order #${order.id} confirmed. Choose a payment method in checkout.`);
      document.querySelector('#checkout-title').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else if (action === 'pay') {
      try { const result = await api(`/api/orders/${id}/pay`, { method: document.querySelector(`#method-${id}`).value, outcome: button.dataset.outcome }); notify(result.message); }
      finally { await loadMenu(); await loadOrders(); }
    } else if (action === 'refresh') await loadStatus();
    else if (action === 'refresh-menu') await loadMenu();
    else if (action === 'refill' || action === 'dispose' || action === 'fault') {
      const url = action === 'refill' ? `/api/admin/ingredients/${id}/refill` : action === 'dispose' ? `/api/admin/bins/${id}/dispose` : `/api/admin/faults/${id}`;
      const data = action === 'refill' ? { refilled: true } : action === 'dispose' ? { emptied: true } : { active: button.dataset.active === 'true' };
      const result = await api(url, data); await loadStatus(); notify(result.message);
    }
  });
}

/**
 * Refresh the admin dashboard on its polling interval. Input: none. Input parameters: none.
 * @returns {void} Starts a reading refresh and displays any connection error.
 */
function pollStatus() { loadStatus().catch(/**
 * Display a failed dashboard polling request.
 * @param {Error} error Failed request or rendering error.
 * @returns {void} Shows its message as error feedback.
 */
error => notify(error.message, true)); }

/**
 * Initialize the current page. Input: document.body page marker. Input parameters: none.
 * @returns {Promise<void>} Binds event listeners and loads applicable state.
 */
async function initialize() {
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('click', handleClick);
  if (document.body.dataset.page === 'menu') await loadCustomer();
  if (document.body.dataset.page === 'admin') { await loadStatus(); polling = setInterval(pollStatus, 5000); }
}
initialize().catch(/**
 * Display an initialization failure.
 * @param {Error} error Failure while loading the current page.
 * @returns {void} Shows its message as error feedback.
 */
error => notify(error.message, true));
