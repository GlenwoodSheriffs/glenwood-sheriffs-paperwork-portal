/* ===========================================================================
   GLENWOOD CONFIGURATION — replace these placeholders before production use.
   Never commit a real webhook URL to a public repository. A tiny serverless
   proxy is recommended for production so the webhook remains private.
   ========================================================================== */
const CONFIG = {
  DISCORD_CLIENT_ID: '1545198908026658908',
  DISCORD_REDIRECT_URI: 'https://shadowrp-cad.github.io/glenwood-sheriffs-paperwork-portal/dashboard.html',
  EMPLOYMENT_WEBHOOK_URL: 'PASTE_EMPLOYMENT_WEBHOOK_URL_HERE',
  INCIDENT_WEBHOOK_URL: 'PASTE_INCIDENT_WEBHOOK_URL_HERE',
  ADMIN_DISCORD_USER_IDS: ['1463057608276705280'], // Grizzly
  SERVER_STATUS_ENDPOINT: '', // Optional HTTPS endpoint returning { online, players, maxPlayers }.
};

const STORAGE = {
  submissions: 'gsd_public_submissions_v2',
  adminProfile: 'gsd_discord_admin_profile_v2',
  oauthState: 'gsd_discord_oauth_state_v2',
  oauthToken: 'gsd_discord_oauth_token_v2',
};

const FORM_LABELS = {
  discordTag: 'Discord Tag', age: 'Age', inGameName: 'In-game Name', priorExperience: 'Prior Experience',
  whyGlenwood: 'Why Glenwood?', date: 'Date', location: 'Location', incidentDescription: 'Description of Incident',
  suspectDescription: 'Suspect Description',
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
  const params = new URLSearchParams({
    response_type: 'token', client_id: CONFIG.DISCORD_CLIENT_ID, redirect_uri: CONFIG.DISCORD_REDIRECT_URI,
    scope: 'identify', state, prompt: 'consent',
  });
  window.location.assign(`https://discord.com/oauth2/authorize?${params}`);
}

function bindStaffLogin() {
  document.querySelectorAll('.staff-login').forEach((button) => button.addEventListener('click', beginDiscordLogin));
}

function initPublicPage() {
  bindStaffLogin();
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
  const fields = Object.fromEntries(new FormData(form).entries());
  const record = {
    id: makeId(type === 'employment' ? 'APP' : 'CIR'), type, fields, status: 'pending',
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

  const webhookUrl = type === 'employment' ? CONFIG.EMPLOYMENT_WEBHOOK_URL : CONFIG.INCIDENT_WEBHOOK_URL;
  try {
    if (!isConfigured(webhookUrl)) {
      message.textContent = 'Saved locally. Configure the Discord webhook in script.js to deliver staff copies.';
      message.className = 'form-message success';
      showToast('Paperwork saved to this browser');
    } else {
      await sendToDiscord(record, webhookUrl);
      message.textContent = 'Submission received. A staff copy was delivered to Discord.';
      message.className = 'form-message success';
      showToast('Paperwork submitted successfully');
    }
    form.reset();
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
  const isEmployment = record.type === 'employment';
  const fields = Object.entries(record.fields).map(([name, value]) => ({
    name: FORM_LABELS[name] || name,
    value: cleanDiscordValue(value),
    inline: ['discordTag', 'age', 'inGameName', 'date', 'location'].includes(name),
  }));
  const payload = {
    username: "Glenwood Sheriff's Department",
    allowed_mentions: { parse: [] },
    embeds: [{
      title: isEmployment ? 'New Deputy Application' : 'New Civilian Incident Report',
      description: `Submission ID: **${record.id}**`,
      color: isEmployment ? 14191957 : 2266879,
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
  const loginMessage = document.querySelector('#login-message');
  const authResult = await consumeDiscordOAuth();
  if (authResult.error) loginMessage.textContent = authResult.error;
  const profile = authResult.profile || readAdminProfile();
  if (profile) showDashboard(profile);

  document.querySelector('#logout-button')?.addEventListener('click', logoutAdmin);
  document.querySelector('.mdt-mobile-toggle')?.addEventListener('click', () => document.querySelector('.mdt-sidebar').classList.toggle('open'));
  document.querySelectorAll('.mdt-nav[data-panel]').forEach((button) => button.addEventListener('click', () => switchAdminPanel(button.dataset.panel)));
  document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach((item) => item.classList.toggle('active', item === button));
    renderSubmissions(button.dataset.filter, document.querySelector('#submission-search').value);
  }));
  document.querySelector('#submission-search')?.addEventListener('input', (event) => renderSubmissions(document.querySelector('.filter.active').dataset.filter, event.target.value));
  document.querySelector('#submission-list')?.addEventListener('click', handleSubmissionAction);
  document.querySelector('.dialog-close')?.addEventListener('click', () => document.querySelector('#submission-dialog').close());
  document.querySelector('#export-records')?.addEventListener('click', exportRecords);
  document.querySelector('#import-records')?.addEventListener('change', importRecords);
  document.querySelector('#clear-records')?.addEventListener('click', clearRecords);
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
  updateMetrics();
}

function logoutAdmin() {
  localStorage.removeItem(STORAGE.adminProfile);
  sessionStorage.removeItem(STORAGE.oauthToken);
  location.reload();
}

function switchAdminPanel(panel) {
  document.querySelector('#review-panel').hidden = panel !== 'review';
  document.querySelector('#analytics-panel').hidden = panel !== 'analytics';
  document.querySelectorAll('.mdt-nav[data-panel]').forEach((button) => button.classList.toggle('active', button.dataset.panel === panel));
  document.querySelector('.mdt-sidebar').classList.remove('open');
  if (panel === 'review') renderSubmissions();
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
  const title = record.type === 'employment' ? 'Deputy Application' : 'Civilian Incident Report';
  const summary = record.type === 'employment' ? record.fields.inGameName : record.fields.location;
  return `<article class="submission-card"><span class="submission-type">${record.type === 'employment' ? '★' : '!'}</span><div class="submission-copy"><strong>${escapeHtml(title)} · ${escapeHtml(record.id)}</strong><span>${escapeHtml(summary || 'No summary')} · ${new Date(record.submittedAt).toLocaleString()}</span></div><div class="submission-actions"><span class="status-tag ${record.status}">${record.status}</span><button class="small-action view" data-action="view" data-id="${record.id}">View</button><button class="small-action approve" data-action="approved" data-id="${record.id}">Approve</button><button class="small-action deny" data-action="denied" data-id="${record.id}">Deny</button></div></article>`;
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
  renderSubmissions(document.querySelector('.filter.active').dataset.filter, document.querySelector('#submission-search').value);
  showToast(`Paperwork marked ${record.status}`);
}

function openSubmission(id) {
  const record = readSubmissions().find((item) => item.id === id);
  if (!record) return;
  const title = record.type === 'employment' ? 'Deputy Application' : 'Civilian Incident Report';
  document.querySelector('#dialog-content').innerHTML = `<div class="dialog-title"><p class="eyebrow">${escapeHtml(record.id)}</p><h2>${title}</h2><p>Submitted ${new Date(record.submittedAt).toLocaleString()} · Status: ${escapeHtml(record.status)}</p></div><div class="dialog-fields">${Object.entries(record.fields).map(([key, value]) => `<div class="dialog-field ${String(value).length > 80 ? 'wide' : ''}"><span>${escapeHtml(FORM_LABELS[key] || key)}</span><p>${escapeHtml(value)}</p></div>`).join('')}</div>`;
  document.querySelector('#submission-dialog').showModal();
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
    writeSubmissions(backup.submissions.filter((record) => record?.id && ['employment', 'incident'].includes(record.type)));
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

function registerWebMCP() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  context.registerTool({
    name: 'list_public_submissions', title: 'List public submissions',
    description: 'List locally cached Glenwood deputy applications and civilian incident reports.',
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
