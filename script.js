/* ===========================================================================
   GLENWOOD CONFIGURATION — replace these placeholders before production use.
   Never commit a real webhook URL to a public repository. A tiny serverless
   proxy is recommended for production so the webhook remains private.
   ========================================================================== */
const CONFIG = {
  DISCORD_CLIENT_ID: '1545198908026658908',
  DISCORD_REDIRECT_URI: 'https://glenwoodsheriffs.github.io/glenwood-sheriffs-paperwork-portal/dashboard.html',
  INCIDENT_WEBHOOK_URL: 'PASTE_INCIDENT_WEBHOOK_URL_HERE',
  ADMIN_DISCORD_USER_IDS: ['1463057608276705280'], // Grizzly
  SERVER_STATUS_ENDPOINT: '', // Optional HTTPS endpoint returning { online, players, maxPlayers }.
};

const STORAGE = {
  submissions: 'gsd_public_submissions_v2',
  adminProfile: 'gsd_discord_admin_profile_v2',
  oauthState: 'gsd_discord_oauth_state_v2',
  oauthToken: 'gsd_discord_oauth_token_v2',
  oauthReturn: 'gsd_discord_oauth_return_v2',
  calls: 'gsd_dispatch_calls_v1',
  bolos: 'gsd_bolo_records_v1',
  activity: 'gsd_activity_log_v1',
  arrestDraft: 'gsd_arrest_report_draft_v1',
};

const FORM_LABELS = {
  caseNumber: 'Case Number', date: 'Date', arrestingOfficer: 'Arresting Officer', badgeNumber: 'Badge Number',
  department: 'Department', arresteeName: 'Arrestee’s Name', gamertag: 'Arrestee’s Gamertag',
  gangAffiliation: 'Gang Affiliation', charges: 'Criminal Charges', jailSentence: 'Jail Sentence', fine: 'Fine',
  incidentSummary: 'Incident Summary', reportStatus: 'Report Status',
};

const page = document.body.dataset.page;
const toast = document.querySelector('.toast');

function showToast(message, tone = 'default') {
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function readSubmissions() {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE.submissions) || '[]');
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function writeSubmissions(records) {
  localStorage.setItem(STORAGE.submissions, JSON.stringify(records));
}

function readCollection(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function writeCollection(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function startClock(selector) {
  const element = document.querySelector(selector);
  if (!element) return;
  const tick = () => { element.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
  tick();
  setInterval(tick, 1000);
}

function logActivity(action, detail) {
  const items = readCollection(STORAGE.activity);
  items.unshift({ id: makeId('LOG'), action, detail, at: new Date().toISOString(), by: readAdminProfile()?.username || 'System' });
  writeCollection(STORAGE.activity, items.slice(0, 100));
}

function makeId(prefix) {
  const random = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${random.toUpperCase()}`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function cleanDiscordValue(value, max = 1000) {
  return String(value || 'Not provided').replace(/@/g, '@\u200b').slice(0, max);
}

function isConfigured(value) {
  return Boolean(value && !value.startsWith('PASTE_'));
}

function configuredAdminIds() {
  return CONFIG.ADMIN_DISCORD_USER_IDS.filter((id) => isConfigured(id));
}

function beginDiscordLogin() {
  if (!isConfigured(CONFIG.DISCORD_CLIENT_ID) || !isConfigured(CONFIG.DISCORD_REDIRECT_URI)) {
    showToast('Add your Discord Client ID and redirect URL in script.js first.', 'warning');
    return;
  }
  const state = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  sessionStorage.setItem(STORAGE.oauthState, state);
  sessionStorage.setItem(STORAGE.oauthReturn, page === 'public' ? 'public' : 'dashboard');
  const params = new URLSearchParams({
    response_type: 'token', client_id: CONFIG.DISCORD_CLIENT_ID, redirect_uri: CONFIG.DISCORD_REDIRECT_URI,
    scope: 'identify', state, prompt: 'consent',
  });
  window.location.assign(`https://discord.com/oauth2/authorize?${params}`);
}

function bindStaffLogin() {
  const profile = readAdminProfile();
  document.querySelectorAll('.staff-login').forEach((button) => {
    if (profile && page === 'public') {
      button.innerHTML = '<span>▣</span> Open MDT';
      button.addEventListener('click', () => location.assign('dashboard.html'));
    } else button.addEventListener('click', beginDiscordLogin);
  });
}

function initPublicPage() {
  bindStaffLogin();
  initTacticalCursor();
  const profile = readAdminProfile();
  const gate = document.querySelector('#site-login-gate');
  if (!profile) {
    document.body.classList.remove('auth-pending');
    document.body.classList.add('auth-locked');
    if (gate) gate.hidden = false;
    return;
  }
  if (gate) gate.hidden = true;
  document.body.classList.remove('auth-pending', 'auth-locked');
  document.body.classList.add('auth-ready');
  const portalAvatar = document.querySelector('#portal-avatar');
  if (portalAvatar) portalAvatar.src = profile.avatarUrl;
  const portalUsername = document.querySelector('#portal-username');
  if (portalUsername) portalUsername.textContent = profile.username;
  startClock('#portal-clock');
  prepareArrestForm();
  const toggle = document.querySelector('.mobile-toggle');
  const nav = document.querySelector('.main-nav');
  toggle?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    nav.classList.remove('open');
    toggle?.setAttribute('aria-expanded', 'false');
  }));

  document.querySelectorAll('[data-form-tab]').forEach((tab) => tab.addEventListener('click', () => {
    const target = tab.dataset.formTab;
    document.querySelectorAll('[data-form-tab]').forEach((item) => {
      const selected = item.dataset.formTab === target;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-selected', String(selected));
    });
    document.querySelectorAll('.public-form').forEach((form) => form.classList.toggle('active', form.dataset.submissionType === target));
  }));

  document.querySelectorAll('.public-form').forEach((form) => form.addEventListener('submit', submitPublicForm));
  updateServerStatus();
}

function generateCaseNumber() {
  const now = new Date();
  const dateCode = `${now.getMonth() + 1}${String(now.getDate()).padStart(2, '0')}${String(now.getFullYear()).slice(-2)}`;
  const sequence = String(Math.floor(100 + Math.random() * 900));
  return `GSD-${dateCode}-${sequence}`;
}

function chargeRow(charge = '', count = 1) {
  return `<div class="charge-row"><label><span>Charge *</span><input name="charge" required maxlength="160" value="${escapeHtml(charge)}" placeholder="Attempted Murder of a Law Enforcement Officer"></label><label><span>Counts</span><input name="count" type="number" min="1" max="99" value="${Number(count) || 1}" required></label><button type="button" class="remove-charge" aria-label="Remove charge">×</button></div>`;
}

function collectArrestFields(form) {
  const fields = Object.fromEntries(new FormData(form).entries());
  fields.caseNumber = form.querySelector('[name="caseNumber"]').value;
  fields.charges = [...form.querySelectorAll('.charge-row')].map((row) => ({
    charge: row.querySelector('[name="charge"]').value.trim(),
    count: Number(row.querySelector('[name="count"]').value || 1),
  })).filter((item) => item.charge);
  delete fields.charge;
  delete fields.count;
  return fields;
}

function resetArrestForm(form, keepMessage = true) {
  form.reset();
  const caseNumber = generateCaseNumber();
  form.querySelector('[name="caseNumber"]').value = caseNumber;
  setText('#case-number-preview', caseNumber);
  form.querySelector('[name="date"]').value = new Date().toISOString().slice(0, 10);
  document.querySelector('#charge-builder').innerHTML = chargeRow();
  setText('#summary-count', '0');
  if (!keepMessage) form.querySelector('.form-message').textContent = '';
}

function prepareArrestForm() {
  const form = document.querySelector('#incident-form');
  if (!form) return;
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(STORAGE.arrestDraft) || 'null'); } catch { draft = null; }
  if (draft?.fields) {
    Object.entries(draft.fields).forEach(([name, value]) => {
      if (name === 'charges') return;
      const input = form.elements.namedItem(name);
      if (input && typeof value === 'string') input.value = value;
    });
    form.querySelector('[name="caseNumber"]').value = draft.fields.caseNumber || generateCaseNumber();
    document.querySelector('#charge-builder').innerHTML = (draft.fields.charges?.length ? draft.fields.charges : [{ charge: '', count: 1 }]).map((item) => chargeRow(item.charge, item.count)).join('');
  } else resetArrestForm(form);
  setText('#case-number-preview', form.querySelector('[name="caseNumber"]').value);
  setText('#summary-count', form.querySelector('[name="incidentSummary"]').value.length);
  document.querySelector('#add-charge')?.addEventListener('click', () => {
    document.querySelector('#charge-builder').insertAdjacentHTML('beforeend', chargeRow());
    document.querySelector('#charge-builder .charge-row:last-child input').focus();
  });
  document.querySelector('#charge-builder')?.addEventListener('click', (event) => {
    const remove = event.target.closest('.remove-charge');
    if (!remove) return;
    const rows = document.querySelectorAll('.charge-row');
    if (rows.length === 1) return showToast('An arrest report needs at least one charge', 'warning');
    remove.closest('.charge-row').remove();
  });
  let draftTimer;
  form.addEventListener('input', () => {
    setText('#summary-count', form.querySelector('[name="incidentSummary"]').value.length);
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => localStorage.setItem(STORAGE.arrestDraft, JSON.stringify({ fields: collectArrestFields(form), savedAt: new Date().toISOString() })), 350);
  });
}

async function submitPublicForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = form.querySelector('.form-message');
  if (!form.checkValidity()) {
    form.reportValidity();
    message.textContent = 'Please complete every required field.';
    message.className = 'form-message error';
    return;
  }

  const type = form.dataset.submissionType;
  const fields = collectArrestFields(form);
  const record = {
    id: fields.caseNumber, type, fields, status: 'pending',
    submittedAt: new Date().toISOString(), reviewedAt: null, reviewedBy: null,
  };
  const records = readSubmissions();
  records.unshift(record);
  writeSubmissions(records);

  const button = form.querySelector('.submit-button');
  const originalText = button.innerHTML;
  button.disabled = true;
  button.textContent = 'Transmitting…';
  message.textContent = 'Saving local copy and contacting Discord…';
  message.className = 'form-message';

  const webhookUrl = CONFIG.INCIDENT_WEBHOOK_URL;
  try {
    if (!isConfigured(webhookUrl)) {
      message.textContent = 'Saved locally. Configure the Discord webhook in script.js to deliver staff copies.';
      message.className = 'form-message success';
      showToast('Paperwork saved to this browser');
    } else {
      await sendToDiscord(record, webhookUrl);
      message.textContent = `Arrest report ${record.id} filed. A staff copy was delivered to Discord.`;
      message.className = 'form-message success';
      showToast(`Arrest report ${record.id} filed`);
    }
    localStorage.removeItem(STORAGE.arrestDraft);
    resetArrestForm(form);
  } catch (error) {
    console.error('Discord webhook delivery failed:', error);
    message.textContent = 'Saved locally, but Discord delivery failed. Staff can still review it on this device.';
    message.className = 'form-message error';
    showToast('Saved locally; Discord delivery failed', 'warning');
  } finally {
    button.disabled = false;
    button.innerHTML = originalText;
  }
}

async function sendToDiscord(record, webhookUrl) {
  const fields = Object.entries(record.fields).map(([name, value]) => ({
    name: FORM_LABELS[name] || name,
    value: cleanDiscordValue(name === 'charges' ? value.map((item) => `• ${item.charge}${item.count > 1 ? ` — ${item.count} Counts` : ''}`).join('\n') : value),
    inline: ['caseNumber', 'date', 'arrestingOfficer', 'badgeNumber', 'arresteeName', 'gamertag', 'jailSentence', 'fine', 'reportStatus'].includes(name),
  }));
  const payload = {
    username: "Glenwood Sheriff's Department",
    allowed_mentions: { parse: [] },
    embeds: [{
      title: 'New Glenwood Arrest Report',
      description: `Case Number: **${record.id}**`,
      color: 2266879,
      fields,
      footer: { text: "Glenwood Sheriff's Department · Public Records" },
      timestamp: record.submittedAt,
    }],
  };
  const separator = webhookUrl.includes('?') ? '&' : '?';
  const response = await fetch(`${webhookUrl}${separator}wait=true`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Discord returned HTTP ${response.status}`);
}

async function updateServerStatus() {
  const label = document.querySelector('#server-label');
  const count = document.querySelector('#player-count');
  const updated = document.querySelector('#status-updated');
  if (!label || !count || !updated) return;
  if (!CONFIG.SERVER_STATUS_ENDPOINT) {
    label.textContent = 'SERVER ONLINE';
    count.textContent = '-- / --';
    updated.textContent = 'Add a status endpoint in script.js for live player counts';
    return;
  }
  try {
    const response = await fetch(CONFIG.SERVER_STATUS_ENDPOINT, { cache: 'no-store' });
    if (!response.ok) throw new Error('Status endpoint unavailable');
    const status = await response.json();
    label.textContent = status.online ? 'SERVER ONLINE' : 'SERVER OFFLINE';
    count.textContent = `${status.players ?? '--'} / ${status.maxPlayers ?? '--'}`;
    updated.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } catch {
    label.textContent = 'STATUS UNAVAILABLE';
    count.textContent = '-- / --';
    updated.textContent = 'Could not reach the configured status endpoint';
  }
}

async function initDashboard() {
  bindStaffLogin();
  initTacticalCursor();
  const loginMessage = document.querySelector('#login-message');
  const authResult = await consumeDiscordOAuth();
  if (authResult.error) loginMessage.textContent = authResult.error;
  if (authResult.profile && sessionStorage.getItem(STORAGE.oauthReturn) === 'public') {
    sessionStorage.removeItem(STORAGE.oauthReturn);
    location.replace('index.html');
    return;
  }
  sessionStorage.removeItem(STORAGE.oauthReturn);
  const profile = authResult.profile || readAdminProfile();
  if (profile) showDashboard(profile);

  document.querySelector('#logout-button')?.addEventListener('click', logoutAdmin);
  startClock('#mdt-clock');
  document.querySelector('.mdt-mobile-toggle')?.addEventListener('click', () => document.querySelector('.mdt-sidebar').classList.toggle('open'));
  document.querySelectorAll('.mdt-nav[data-panel]').forEach((button) => button.addEventListener('click', () => switchAdminPanel(button.dataset.panel)));
  document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach((item) => item.classList.toggle('active', item === button));
    renderSubmissions(button.dataset.filter, document.querySelector('#submission-search').value);
  }));
  document.querySelector('#submission-search')?.addEventListener('input', (event) => renderSubmissions(document.querySelector('.filter.active').dataset.filter, event.target.value));
  document.querySelector('#submission-list')?.addEventListener('click', handleSubmissionAction);
  document.querySelector('.dialog-close')?.addEventListener('click', () => document.querySelector('#submission-dialog').close());
  document.querySelector('#submission-dialog')?.addEventListener('click', handleReportDialogAction);
  document.querySelector('#export-records')?.addEventListener('click', exportRecords);
  document.querySelector('#import-records')?.addEventListener('change', importRecords);
  document.querySelector('#clear-records')?.addEventListener('click', clearRecords);
  document.querySelectorAll('[data-open-composer]').forEach((button) => button.addEventListener('click', () => openComposer(button.dataset.openComposer)));
  document.querySelector('.composer-close')?.addEventListener('click', () => document.querySelector('#composer-dialog').close());
  document.querySelector('#composer-form')?.addEventListener('submit', saveComposerRecord);
  document.querySelector('#dispatch-list')?.addEventListener('click', handleDispatchAction);
  document.querySelector('#bolo-list')?.addEventListener('click', handleBoloAction);
  const requestedPanel = location.hash.slice(1);
  if (['dispatch', 'bolo', 'analytics'].includes(requestedPanel)) switchAdminPanel(requestedPanel);
}

async function consumeDiscordOAuth() {
  if (!location.hash.includes('access_token=')) return {};
  const params = new URLSearchParams(location.hash.slice(1));
  const expectedState = sessionStorage.getItem(STORAGE.oauthState);
  history.replaceState(null, '', location.pathname + location.search);
  if (!expectedState || params.get('state') !== expectedState) return { error: 'Discord login state validation failed. Please try again.' };
  sessionStorage.removeItem(STORAGE.oauthState);
  const token = params.get('access_token');
  if (!token) return { error: 'Discord did not return an access token.' };
  try {
    const response = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Could not load Discord profile');
    const user = await response.json();
    const admins = configuredAdminIds();
    if (!admins.length) return { error: `Grizzly's Discord user ID has not been added yet. Your signed-in Discord user ID is ${user.id}.` };
    if (!admins.includes(user.id)) return { error: 'This Discord account is not authorized for the Glenwood MDT.' };
    const avatarUrl = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : 'assets/crest.png';
    const profile = { id: user.id, username: user.global_name || user.username, avatarUrl, role: 'Administrator', demo: false, expiresAt: Date.now() + Number(params.get('expires_in') || 3600) * 1000 };
    localStorage.setItem(STORAGE.adminProfile, JSON.stringify(profile));
    sessionStorage.setItem(STORAGE.oauthToken, token);
    return { profile };
  } catch (error) {
    return { error: error.message || 'Discord login failed.' };
  }
}

function readAdminProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(STORAGE.adminProfile) || 'null');
    if (!profile || profile.expiresAt < Date.now()) {
      localStorage.removeItem(STORAGE.adminProfile);
      return null;
    }
    return profile;
  } catch {
    return null;
  }
}

function showDashboard(profile) {
  document.querySelector('#login-gate').hidden = true;
  document.querySelector('#mdt-app').hidden = false;
  document.querySelector('#admin-name').textContent = profile.username;
  document.querySelector('#welcome-name').textContent = profile.username;
  document.querySelector('#admin-avatar').src = profile.avatarUrl;
  renderSubmissions();
  renderDispatch();
  renderBolos();
  updateMetrics();
}

function logoutAdmin() {
  localStorage.removeItem(STORAGE.adminProfile);
  sessionStorage.removeItem(STORAGE.oauthToken);
  location.reload();
}

function initTacticalCursor() {
  if (!matchMedia('(pointer: fine)').matches) return;
  const dot = document.createElement('span');
  const ring = document.createElement('span');
  dot.className = 'tactical-cursor-dot';
  ring.className = 'tactical-cursor-ring';
  document.body.append(dot, ring);
  document.body.classList.add('cursor-ready');
  let mouseX = innerWidth / 2, mouseY = innerHeight / 2, ringX = mouseX, ringY = mouseY;
  addEventListener('pointermove', (event) => {
    mouseX = event.clientX; mouseY = event.clientY;
    dot.style.transform = `translate3d(${mouseX}px,${mouseY}px,0)`;
  }, { passive: true });
  addEventListener('pointerover', (event) => {
    ring.classList.toggle('targeting', Boolean(event.target.closest('a,button,input,textarea,label')));
  });
  const animate = () => {
    ringX += (mouseX - ringX) * .16; ringY += (mouseY - ringY) * .16;
    ring.style.transform = `translate3d(${ringX}px,${ringY}px,0)`;
    requestAnimationFrame(animate);
  };
  animate();
}

function switchAdminPanel(panel) {
  ['review', 'dispatch', 'bolo', 'analytics'].forEach((name) => {
    const element = document.querySelector(`#${name}-panel`);
    if (element) element.hidden = name !== panel;
  });
  document.querySelectorAll('.mdt-nav[data-panel]').forEach((button) => button.classList.toggle('active', button.dataset.panel === panel));
  const titles = { review: 'Records Desk', dispatch: 'Dispatch Board', bolo: 'BOLO Network', analytics: 'Administration' };
  const panelTitle = document.querySelector('#mdt-panel-title');
  if (panelTitle) panelTitle.textContent = titles[panel] || 'Command Center';
  history.replaceState(null, '', panel === 'review' ? location.pathname : `#${panel}`);
  document.querySelector('.mdt-sidebar').classList.remove('open');
  if (panel === 'review') renderSubmissions();
  if (panel === 'dispatch') renderDispatch();
  if (panel === 'bolo') renderBolos();
}

function updateMetrics() {
  const records = readSubmissions();
  document.querySelector('#metric-total').textContent = records.length;
  ['pending', 'approved', 'denied'].forEach((status) => {
    document.querySelector(`#metric-${status}`).textContent = records.filter((record) => record.status === status).length;
  });
}

function renderSubmissions(filter = 'all', query = '') {
  const list = document.querySelector('#submission-list');
  if (!list) return;
  const normalized = query.trim().toLowerCase();
  const records = readSubmissions().filter((record) => {
    const statusMatch = filter === 'all' || record.status === filter;
    const text = `${record.id} ${record.type} ${Object.values(record.fields).join(' ')}`.toLowerCase();
    return statusMatch && (!normalized || text.includes(normalized));
  });
  list.innerHTML = records.length ? records.map(submissionCard).join('') : `<div class="empty-review"><b>No matching paperwork</b><p>Public submissions saved in this browser will appear here.</p></div>`;
  updateMetrics();
}

function submissionCard(record) {
  const title = record.type === 'arrest' ? 'Arrest Report' : 'Sheriff Incident Report';
  const summary = record.fields.arresteeName || record.fields.location;
  return `<article class="submission-card"><span class="submission-type">${record.type === 'arrest' ? 'AR' : '!'}</span><div class="submission-copy"><strong>${escapeHtml(title)} · ${escapeHtml(record.id)}</strong><span>${escapeHtml(summary || 'No summary')} · ${new Date(record.submittedAt).toLocaleString()}</span></div><div class="submission-actions"><span class="status-tag ${record.status}">${record.status}</span><button class="small-action view" data-action="view" data-id="${record.id}">View</button><button class="small-action approve" data-action="approved" data-id="${record.id}">Approve</button><button class="small-action deny" data-action="denied" data-id="${record.id}">Deny</button></div></article>`;
}

function handleSubmissionAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  if (button.dataset.action === 'view') return openSubmission(button.dataset.id);
  const records = readSubmissions();
  const record = records.find((item) => item.id === button.dataset.id);
  if (!record) return;
  const profile = readAdminProfile();
  record.status = button.dataset.action;
  record.reviewedAt = new Date().toISOString();
  record.reviewedBy = profile?.username || 'Grizzly';
  writeSubmissions(records);
  logActivity('Report reviewed', `${record.id} marked ${record.status}`);
  renderSubmissions(document.querySelector('.filter.active').dataset.filter, document.querySelector('#submission-search').value);
  showToast(`Paperwork marked ${record.status}`);
}

function openSubmission(id) {
  const record = readSubmissions().find((item) => item.id === id);
  if (!record) return;
  if (record.type === 'arrest') {
    const f = record.fields;
    const charges = Array.isArray(f.charges) ? f.charges : [];
    document.querySelector('#dialog-content').innerHTML = `<article class="official-report" data-report-id="${escapeHtml(record.id)}"><header><img src="assets/crest.png" alt=""><div><small>GLENWOOD SHERIFF’S DEPARTMENT</small><h2>ARREST REPORT</h2></div><span class="report-review-state ${record.status}">${escapeHtml(record.status)}</span></header><div class="report-id-grid"><p><span>CASE NUMBER</span><b>${escapeHtml(record.id)}</b></p><p><span>DATE</span><b>${escapeHtml(formatReportDate(f.date))}</b></p><p><span>ARRESTING OFFICER</span><b>${escapeHtml(f.arrestingOfficer)}</b></p></div>${reportSection('SUSPECT INFORMATION', [['Arrestee’s Name', f.arresteeName], ['Arrestee’s Gamertag', f.gamertag], ['Gang Affiliation', f.gangAffiliation || 'None known']])}<section class="report-section"><h3>CRIMINAL CHARGES</h3><ul class="charge-list">${charges.map((item) => `<li>${escapeHtml(item.charge)}${Number(item.count) > 1 ? ` <b>— ${Number(item.count)} Counts</b>` : ''}</li>`).join('')}</ul></section>${reportSection('SENTENCING', [['Jail Sentence', `${f.jailSentence} Minutes`], ['Fine', f.fine]])}<section class="report-section report-summary"><h3>INCIDENT SUMMARY</h3><p>${escapeHtml(f.incidentSummary)}</p></section>${reportSection('OFFICER INFORMATION', [['Arresting Officer', f.arrestingOfficer], ['Badge Number', f.badgeNumber], ['Department', f.department]])}<footer><span>REPORT STATUS</span><b>${escapeHtml(f.reportStatus)}</b></footer></article><div class="report-actions"><button class="button ghost" type="button" data-report-action="copy" data-id="${escapeHtml(record.id)}">Copy report text</button><button class="button gold" type="button" data-report-action="print">Print report</button></div>`;
  } else {
    document.querySelector('#dialog-content').innerHTML = `<div class="dialog-title"><p class="eyebrow">${escapeHtml(record.id)}</p><h2>Sheriff Incident Report</h2><p>Submitted ${new Date(record.submittedAt).toLocaleString()} · Status: ${escapeHtml(record.status)}</p></div><div class="dialog-fields">${Object.entries(record.fields).map(([key, value]) => `<div class="dialog-field ${String(value).length > 80 ? 'wide' : ''}"><span>${escapeHtml(FORM_LABELS[key] || key)}</span><p>${escapeHtml(value)}</p></div>`).join('')}</div>`;
  }
  document.querySelector('#submission-dialog').showModal();
}

function reportSection(title, rows) {
  return `<section class="report-section"><h3>${title}</h3><div class="report-detail-grid">${rows.map(([label, value]) => `<p><span>${escapeHtml(label)}</span><b>${escapeHtml(value || 'Not provided')}</b></p>`).join('')}</div></section>`;
}

function formatReportDate(value) {
  if (!value) return 'Not provided';
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US');
}

function reportAsText(record) {
  const f = record.fields;
  const charges = (f.charges || []).map((item) => `- ${item.charge}${Number(item.count) > 1 ? ` — ${item.count} Counts` : ''}`).join('\n');
  return `GLENWOOD SHERIFF’S DEPARTMENT\n\nARREST REPORT\n\nCase Number: ${record.id}\nDate: ${formatReportDate(f.date)}\nArresting Officer: ${f.arrestingOfficer}\n\nSUSPECT INFORMATION\n\nArrestee’s Name: ${f.arresteeName}\nArrestee’s Gamertag: ${f.gamertag}\nGang Affiliation: ${f.gangAffiliation || 'None known'}\n\nCRIMINAL CHARGES\n\n${charges}\n\nSENTENCING\n\nJail Sentence: ${f.jailSentence} Minutes\nFine: ${f.fine}\n\nINCIDENT SUMMARY\n\n${f.incidentSummary}\n\nOFFICER INFORMATION\n\nArresting Officer: ${f.arrestingOfficer}\nBadge Number: ${f.badgeNumber}\nDepartment: ${f.department}\n\nReport Status: ${f.reportStatus}`;
}

async function handleReportDialogAction(event) {
  const button = event.target.closest('[data-report-action]');
  if (!button) return;
  if (button.dataset.reportAction === 'print') return window.print();
  const record = readSubmissions().find((item) => item.id === button.dataset.id);
  if (!record) return;
  try { await navigator.clipboard.writeText(reportAsText(record)); showToast('Arrest report copied'); }
  catch { showToast('Could not access the clipboard', 'warning'); }
}

function exportRecords() {
  const payload = JSON.stringify({ version: 2, exportedBy: readAdminProfile()?.username || 'Grizzly', exportedAt: new Date().toISOString(), submissions: readSubmissions() }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `glenwood-public-records-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('Records backup exported');
}

async function importRecords(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (!Array.isArray(backup.submissions)) throw new Error('Invalid backup');
    writeSubmissions(backup.submissions.filter((record) => record?.id && ['incident', 'arrest'].includes(record.type)));
    updateMetrics();
    showToast('Records backup imported');
  } catch {
    showToast('That file is not a valid Glenwood backup', 'warning');
  }
}

function clearRecords() {
  if (!confirm('Administrator action: permanently clear every local public submission from this browser?')) return;
  writeSubmissions([]);
  updateMetrics();
  showToast('Local records archive cleared');
}

const COMPOSERS = {
  call: {
    title: 'Create dispatch call', eyebrow: 'COMPUTER-AIDED DISPATCH',
    fields: `<div class="composer-grid"><label><span>Call Type</span><input name="title" required maxlength="80" placeholder="Traffic collision, disturbance…"></label><label><span>Priority</span><select name="priority" required><option>Priority 3</option><option>Priority 2</option><option>Priority 1</option></select></label><label class="wide"><span>Location</span><input name="location" required maxlength="140" placeholder="Road, town, grid, or landmark"></label><label><span>Assigned Unit</span><input name="unit" maxlength="40" placeholder="Unassigned"></label><label><span>Caller / Source</span><input name="source" maxlength="80" placeholder="Dispatch, civilian, unit…"></label><label class="wide"><span>Call Notes</span><textarea name="notes" required maxlength="1200" placeholder="Known facts and officer-safety information"></textarea></label></div>`,
  },
  bolo: {
    title: 'Publish BOLO', eyebrow: 'COUNTY-WIDE ALERT NETWORK',
    fields: `<div class="composer-grid"><label><span>Subject / Vehicle</span><input name="subject" required maxlength="100" placeholder="Name, plate, or identifying label"></label><label><span>Alert Type</span><select name="kind" required><option>Wanted Person</option><option>Vehicle</option><option>Missing Person</option><option>Officer Safety</option></select></label><label class="wide"><span>Last Known Location</span><input name="location" required maxlength="140" placeholder="Last seen location"></label><label class="wide"><span>Description</span><textarea name="description" required maxlength="1400" placeholder="Appearance, clothing, vehicle, direction, charges, and cautions"></textarea></label><label><span>Risk Level</span><select name="risk" required><option>Use Caution</option><option>High Risk</option><option>Information Only</option></select></label><label><span>Issuing Unit</span><input name="unit" required maxlength="50" placeholder="GSD-01"></label></div>`,
  },
};

function openComposer(type) {
  const config = COMPOSERS[type];
  if (!config) return;
  const form = document.querySelector('#composer-form');
  form.dataset.type = type;
  form.reset();
  document.querySelector('#composer-title').textContent = config.title;
  document.querySelector('#composer-eyebrow').textContent = config.eyebrow;
  document.querySelector('#composer-fields').innerHTML = config.fields;
  document.querySelector('#composer-dialog').showModal();
}

function saveComposerRecord(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) return form.reportValidity();
  const type = form.dataset.type;
  const fields = Object.fromEntries(new FormData(form).entries());
  const key = type === 'call' ? STORAGE.calls : STORAGE.bolos;
  const records = readCollection(key);
  records.unshift({ id: makeId(type === 'call' ? 'CAD' : 'BOLO'), ...fields, status: 'active', createdAt: new Date().toISOString(), createdBy: readAdminProfile()?.username || 'Grizzly' });
  writeCollection(key, records);
  logActivity(type === 'call' ? 'Dispatch call created' : 'BOLO published', type === 'call' ? fields.title : fields.subject);
  document.querySelector('#composer-dialog').close();
  type === 'call' ? renderDispatch() : renderBolos();
  showToast(type === 'call' ? 'Call added to dispatch board' : 'BOLO published to network');
}

function renderDispatch() {
  const list = document.querySelector('#dispatch-list');
  const calls = readCollection(STORAGE.calls);
  const active = calls.filter((call) => call.status === 'active');
  if (list) list.innerHTML = active.length ? active.map((call) => `<article class="dispatch-call priority-${escapeHtml(call.priority.slice(-1))}"><div class="call-priority"><small>${escapeHtml(call.priority)}</small><b>${escapeHtml(call.id)}</b></div><div class="call-main"><span>${escapeHtml(call.location)}</span><h3>${escapeHtml(call.title)}</h3><p>${escapeHtml(call.notes)}</p><small>Source: ${escapeHtml(call.source || 'Unknown')} · Created ${new Date(call.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></div><div class="call-unit"><small>ASSIGNED UNIT</small><b>${escapeHtml(call.unit || 'UNASSIGNED')}</b><button data-call-action="clear" data-id="${call.id}">Clear call</button></div></article>`).join('') : `<div class="empty-review"><b>No active calls</b><p>Dispatch is clear. Create a call when service is requested.</p></div>`;
  const today = new Date().toDateString();
  setText('#calls-active', active.length);
  setText('#calls-unassigned', active.filter((call) => !call.unit).length);
  setText('#calls-cleared', calls.filter((call) => call.status === 'cleared' && new Date(call.clearedAt).toDateString() === today).length);
  setText('#nav-call-count', active.length);
}

function handleDispatchAction(event) {
  const button = event.target.closest('[data-call-action]');
  if (!button) return;
  const calls = readCollection(STORAGE.calls);
  const call = calls.find((item) => item.id === button.dataset.id);
  if (!call) return;
  call.status = 'cleared'; call.clearedAt = new Date().toISOString();
  writeCollection(STORAGE.calls, calls);
  logActivity('Dispatch call cleared', call.id);
  renderDispatch(); showToast(`${call.id} cleared`);
}

function renderBolos() {
  const list = document.querySelector('#bolo-list');
  const bolos = readCollection(STORAGE.bolos).filter((bolo) => bolo.status === 'active');
  if (list) list.innerHTML = bolos.length ? bolos.map((bolo) => `<article class="bolo-card"><div class="bolo-alert"><span>BOLO</span><b>${escapeHtml(bolo.kind)}</b></div><div><small>${escapeHtml(bolo.id)} · ISSUED BY ${escapeHtml(bolo.unit)}</small><h3>${escapeHtml(bolo.subject)}</h3><p>${escapeHtml(bolo.description)}</p><div class="bolo-meta"><span>⌖ ${escapeHtml(bolo.location)}</span><strong>${escapeHtml(bolo.risk)}</strong></div></div><button data-bolo-action="resolve" data-id="${bolo.id}">Mark located</button></article>`).join('') : `<div class="empty-review"><b>No active BOLOs</b><p>The county-wide alert network is currently clear.</p></div>`;
  setText('#nav-bolo-count', bolos.length);
}

function handleBoloAction(event) {
  const button = event.target.closest('[data-bolo-action]');
  if (!button) return;
  const bolos = readCollection(STORAGE.bolos);
  const bolo = bolos.find((item) => item.id === button.dataset.id);
  if (!bolo) return;
  bolo.status = 'resolved'; bolo.resolvedAt = new Date().toISOString();
  writeCollection(STORAGE.bolos, bolos);
  logActivity('BOLO resolved', bolo.id);
  renderBolos(); showToast(`${bolo.id} marked located`);
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function registerWebMCP() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  context.registerTool({
    name: 'list_public_submissions', title: 'List public submissions',
    description: 'List locally cached Glenwood sheriff arrest and incident reports.',
    inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['all', 'pending', 'approved', 'denied'] } }, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: ({ status = 'all' }) => {
      if (!['all', 'pending', 'approved', 'denied'].includes(status)) throw new Error('Invalid submission status');
      return readSubmissions().filter((record) => status === 'all' || record.status === status).map(({ id, type, status: recordStatus, submittedAt }) => ({ id, type, status: recordStatus, submittedAt }));
    },
  });
}

if (page === 'public') initPublicPage();
if (page === 'dashboard') initDashboard();
registerWebMCP();
