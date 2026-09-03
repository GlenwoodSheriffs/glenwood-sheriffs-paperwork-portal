const templates = {
  incident: {
    icon: '◆', nav: 'Incident Report', title: 'General Incident Report',
    description: 'Document an event clearly and completely.',
    fields: [
      ['caseNumber', 'Case number', 'text', 'GSD-2026-0001'], ['date', 'Date', 'date', ''], ['time', 'Time', 'time', ''],
      ['officer', 'Reporting officer', 'text', 'Name and badge number'], ['incidentType', 'Incident type', 'select', ['Traffic incident', 'Property crime', 'Disturbance', 'Suspicious activity', 'Other']],
      ['location', 'Location', 'text', 'Street address or area'], ['involved', 'Involved parties', 'textarea', 'Names, contact details, and roles'],
      ['narrative', 'Incident narrative', 'textarea', 'On the above date and time, I responded to…'],
    ],
  },
  arrest: {
    icon: '⌁', nav: 'Arrest Report', title: 'Arrest Report',
    description: 'Record arrest circumstances, charges, and disposition.',
    fields: [
      ['caseNumber', 'Case number', 'text', 'GSD-2026-0001'], ['date', 'Arrest date', 'date', ''], ['time', 'Arrest time', 'time', ''],
      ['officer', 'Arresting officer', 'text', 'Name and badge number'], ['subject', 'Subject name', 'text', 'Full legal name'], ['dob', 'Date of birth', 'date', ''],
      ['charges', 'Charges', 'textarea', 'List each charge and statute'], ['location', 'Arrest location', 'text', 'Address or coordinates'],
      ['property', 'Property / evidence seized', 'textarea', 'Item, quantity, and evidence tag'], ['narrative', 'Probable cause narrative', 'textarea', 'Describe the facts supporting the arrest…'],
    ],
  },
  citation: {
    icon: '▤', nav: 'Traffic Citation', title: 'Traffic Citation',
    description: 'Prepare a clear record of a traffic stop and violation.',
    fields: [
      ['citationNumber', 'Citation number', 'text', 'GSD-CIT-0001'], ['date', 'Date', 'date', ''], ['time', 'Time', 'time', ''],
      ['officer', 'Issuing officer', 'text', 'Name and badge number'], ['driver', 'Driver name', 'text', 'Full legal name'], ['license', 'License number', 'text', 'State and number'],
      ['vehicle', 'Vehicle', 'text', 'Year, make, model, color'], ['plate', 'License plate', 'text', 'Plate and state'], ['location', 'Stop location', 'text', 'Roadway or address'],
      ['violation', 'Violation(s)', 'textarea', 'Violation and statute'], ['notes', 'Officer notes', 'textarea', 'Additional observations…'],
    ],
  },
  bolo: {
    icon: '!', nav: 'BOLO', title: 'Be On the Lookout',
    description: 'Share actionable person or vehicle information.',
    fields: [
      ['reference', 'Reference number', 'text', 'GSD-BOLO-0001'], ['date', 'Issued date', 'date', ''], ['time', 'Issued time', 'time', ''],
      ['officer', 'Issuing officer', 'text', 'Name and badge number'], ['priority', 'Priority', 'select', ['Routine', 'Urgent', 'Officer safety']],
      ['subject', 'Subject / vehicle', 'text', 'Name, plate, or primary identifier'], ['description', 'Description', 'textarea', 'Physical, clothing, or vehicle description'],
      ['lastSeen', 'Last known location', 'text', 'Location and direction of travel'], ['instructions', 'Officer instructions', 'textarea', 'Use caution, contact dispatch, etc.'],
    ],
  },
  evidence: {
    icon: '⬡', nav: 'Evidence Log', title: 'Evidence & Property Log',
    description: 'Track collected property and chain of custody.',
    fields: [
      ['caseNumber', 'Case number', 'text', 'GSD-2026-0001'], ['itemNumber', 'Item number', 'text', '001'], ['date', 'Collection date', 'date', ''],
      ['time', 'Collection time', 'time', ''], ['officer', 'Collecting officer', 'text', 'Name and badge number'], ['location', 'Collection location', 'text', 'Where the item was found'],
      ['description', 'Item description', 'textarea', 'Type, condition, serial number, quantity'], ['packaging', 'Packaging / seal', 'text', 'Container and seal number'],
      ['custody', 'Chain of custody notes', 'textarea', 'Date, time, released by, received by, purpose'],
    ],
  },
};

const storageKey = 'glenwood-paperwork-drafts-v1';
let currentView = 'dashboard';
let currentTemplate = 'incident';
let currentDraftId = null;

const content = document.querySelector('#content');
const pageTitle = document.querySelector('#page-title');
const breadcrumb = document.querySelector('#breadcrumb');
const saveButton = document.querySelector('#save-button');
const printButton = document.querySelector('#print-button');
const searchInput = document.querySelector('#search');
const sidebar = document.querySelector('#sidebar');
const toast = document.querySelector('#toast');

function drafts() {
  try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); }
  catch { return []; }
}

function setDrafts(value) { localStorage.setItem(storageKey, JSON.stringify(value)); }
function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}
function nowText() {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date());
}

function renderNavigation() {
  document.querySelector('#template-nav').innerHTML = Object.entries(templates).map(([key, template]) =>
    `<button class="nav-item" data-template="${key}"><span class="nav-icon">${template.icon}</span><span>${template.nav}</span></button>`
  ).join('');
  document.querySelectorAll('[data-template]').forEach((button) => button.addEventListener('click', () => openTemplate(button.dataset.template)));
  document.querySelector('[data-view="dashboard"]').addEventListener('click', renderDashboard);
}

function updateActive() {
  document.querySelectorAll('.nav-item').forEach((element) => element.classList.remove('active'));
  const active = currentView === 'dashboard'
    ? document.querySelector('[data-view="dashboard"]')
    : document.querySelector(`[data-template="${currentTemplate}"]`);
  active?.classList.add('active');
  sidebar.classList.remove('sidebar-open');
  document.querySelector('#mobile-scrim').classList.remove('show');
}

function renderDashboard() {
  currentView = 'dashboard';
  currentDraftId = null;
  updateActive();
  pageTitle.textContent = 'Paperwork dashboard';
  breadcrumb.textContent = 'Operations / Overview';
  saveButton.hidden = true;
  printButton.hidden = true;
  const all = drafts();
  const query = searchInput.value.trim().toLowerCase();
  const filtered = all.filter((draft) => `${draft.title} ${draft.reference} ${draft.officer}`.toLowerCase().includes(query));
  const resultDescription = query ? `Results for “${escapeHtml(query)}”` : 'Continue recent work stored on this device.';
  content.innerHTML = `
    <section class="dashboard-intro"><div><p class="kicker">GSD RECORDS DESK</p><h2>Write it once. Keep it organized.</h2><p>Create field-ready reports, save private drafts to this device, and print a clean copy when it is ready.</p></div><button class="gold-button large" id="new-incident">＋ Start a report</button></section>
    <div class="stats-row"><div><span>Saved drafts</span><strong>${all.length}</strong></div><div><span>Report types</span><strong>${Object.keys(templates).length}</strong></div><div><span>Storage</span><strong>Local</strong></div></div>
    <section class="quick-section"><div class="section-heading"><div><h3>Start new paperwork</h3><p>Choose a department template.</p></div></div><div class="template-grid">${Object.entries(templates).map(([key, template]) => `<button class="template-card" data-start="${key}"><span>${template.icon}</span><div><strong>${template.nav}</strong><small>${template.description}</small></div><b>→</b></button>`).join('')}</div></section>
    <section class="drafts-section"><div class="section-heading"><div><h3>Saved drafts</h3><p>${resultDescription}</p></div></div><div class="draft-list">${filtered.length ? filtered.map(draftRow).join('') : `<div class="empty-state"><span>□</span><h4>${query ? 'No matching drafts' : 'No saved drafts yet'}</h4><p>${query ? 'Try a different search.' : 'Start a report and save it to see it here.'}</p></div>`}</div></section>`;
  document.querySelector('#new-incident').addEventListener('click', () => openTemplate('incident'));
  document.querySelectorAll('[data-start]').forEach((element) => element.addEventListener('click', () => openTemplate(element.dataset.start)));
  document.querySelectorAll('[data-open]').forEach((element) => element.addEventListener('click', () => openDraft(element.dataset.open)));
  document.querySelectorAll('[data-delete]').forEach((element) => element.addEventListener('click', () => deleteDraft(element.dataset.delete)));
}

function draftRow(draft) {
  const template = templates[draft.template] || templates.incident;
  return `<article class="draft-row"><span class="draft-icon">${template.icon}</span><div class="draft-copy"><strong>${escapeHtml(draft.title)}</strong><span>${escapeHtml(draft.reference || 'No reference')} · ${escapeHtml(draft.officer || 'Officer not entered')}</span></div><time>${escapeHtml(draft.updatedLabel)}</time><button class="row-button" data-open="${draft.id}">Open</button><button class="delete-button" data-delete="${draft.id}" aria-label="Delete ${escapeHtml(draft.title)}">×</button></article>`;
}

function openTemplate(key, values = {}, id = null) {
  currentView = 'form';
  currentTemplate = key;
  currentDraftId = id;
  updateActive();
  const template = templates[key];
  pageTitle.textContent = template.nav;
  breadcrumb.textContent = 'Operations / Paperwork';
  saveButton.hidden = false;
  printButton.hidden = false;
  content.innerHTML = `<div class="report-heading"><div class="title-row"><span class="report-icon">${template.icon}</span><div><h2>${template.title}</h2><p>${template.description}</p></div></div><span class="status-badge">${id ? 'Saved draft' : 'New draft'}</span></div><form class="report-card" id="report-form"><div class="section-title"><span>01</span><div><h3>Report details</h3><p>Complete every field that applies.</p></div></div><div class="dynamic-form">${template.fields.map((field, index) => renderField(field, values[field[0]] ?? '', index)).join('')}</div><div class="certify"><label><input type="checkbox" name="certified" ${values.certified ? 'checked' : ''}> I certify that this report is accurate to the best of my knowledge.</label></div><div class="form-footer"><p id="save-status">${id ? `Saved ${escapeHtml(values.updatedLabel || '')}` : 'Not yet saved'}</p><div><button type="button" class="glass-button" id="clear-button">Clear form</button><button type="submit" class="gold-button">✓ Save draft</button></div></div></form>`;
  document.querySelector('#report-form').addEventListener('submit', (event) => { event.preventDefault(); saveCurrent(); });
  document.querySelector('#clear-button').addEventListener('click', clearForm);
}

function renderField([name, label, type, placeholder], value, index) {
  const wide = type === 'textarea' || ['location', 'charges', 'description', 'instructions', 'property', 'custody', 'notes'].includes(name);
  if (type === 'textarea') return `<label class="field ${wide ? 'wide' : ''}"><span>${label}</span><textarea name="${name}" placeholder="${placeholder}">${escapeHtml(value)}</textarea></label>`;
  if (type === 'select') return `<label class="field"><span>${label}</span><select name="${name}"><option value="">Select an option</option>${placeholder.map((option) => `<option ${value === option ? 'selected' : ''}>${option}</option>`).join('')}</select></label>`;
  return `<label class="field ${wide ? 'wide' : ''}"><span>${label}</span><input name="${name}" type="${type}" placeholder="${placeholder}" value="${escapeHtml(value)}" ${index === 0 ? 'autofocus' : ''}></label>`;
}

function formValues() {
  const values = Object.fromEntries(new FormData(document.querySelector('#report-form')).entries());
  values.certified = document.querySelector('[name="certified"]').checked;
  return values;
}

function saveCurrent() {
  if (currentView !== 'form') return;
  const values = formValues();
  const list = drafts();
  const template = templates[currentTemplate];
  const reference = values.caseNumber || values.citationNumber || values.reference || values.itemNumber || 'Untitled';
  const record = { ...values, id: currentDraftId || crypto.randomUUID(), template: currentTemplate, title: template.title, reference, officer: values.officer || '', updated: Date.now(), updatedLabel: nowText() };
  const index = list.findIndex((draft) => draft.id === record.id);
  if (index >= 0) list[index] = record; else list.unshift(record);
  setDrafts(list);
  currentDraftId = record.id;
  document.querySelector('#save-status').textContent = `Saved ${record.updatedLabel}`;
  document.querySelector('.status-badge').textContent = 'Saved draft';
  showToast('Draft saved on this device');
}

function openDraft(id) { const item = drafts().find((draft) => draft.id === id); if (item) openTemplate(item.template, item, item.id); }
function deleteDraft(id) {
  if (!confirm('Delete this saved draft from this device?')) return;
  setDrafts(drafts().filter((draft) => draft.id !== id));
  renderDashboard();
  showToast('Draft deleted');
}
function clearForm() {
  if (!confirm('Clear every field in this report?')) return;
  document.querySelector('#report-form').reset();
  currentDraftId = null;
  document.querySelector('.status-badge').textContent = 'New draft';
  document.querySelector('#save-status').textContent = 'Not yet saved';
}

saveButton.addEventListener('click', saveCurrent);
printButton.addEventListener('click', () => window.print());
searchInput.addEventListener('input', renderDashboard);
document.querySelector('#menu-button').addEventListener('click', () => {
  sidebar.classList.toggle('sidebar-open');
  document.querySelector('#mobile-scrim').classList.toggle('show');
});
document.querySelector('#mobile-scrim').addEventListener('click', () => {
  sidebar.classList.remove('sidebar-open');
  document.querySelector('#mobile-scrim').classList.remove('show');
});

function registerWebMCP() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  context.registerTool({
    name: 'list_saved_reports', title: 'List saved reports',
    description: 'List drafts saved in this paperwork portal on this device.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: ({ query = '' }) => drafts().filter((draft) => `${draft.title} ${draft.reference} ${draft.officer}`.toLowerCase().includes(query.toLowerCase())).map((draft) => ({ id: draft.id, type: draft.title, reference: draft.reference, officer: draft.officer, updated: draft.updatedLabel })),
  });
  context.registerTool({
    name: 'start_department_report', title: 'Start department report',
    description: 'Open a new department report form of the requested type.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: Object.keys(templates) } }, required: ['type'], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: ({ type }) => { if (!templates[type]) throw new Error('Unsupported report type'); openTemplate(type); return { status: 'opened', type, title: templates[type].title }; },
  });
}

renderNavigation();
renderDashboard();
registerWebMCP();
