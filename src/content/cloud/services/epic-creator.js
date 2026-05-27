import { CloudJiraAPI } from './jira-api.js';
import { CLOUD_CUSTOM_FIELDS } from '../../../shared/constants.js';

let modal = null;
let epicContext = null;
let cachedMembers = null;
let cachedFinCategories = null;
let selectedMode = 'story'; // 'story' | 'task' | 'both'

async function fetchEpicContext(issueKey) {
  const project = issueKey.split('-')[0];
  try {
    const r = await CloudJiraAPI.getIssue(issueKey);
    if (!r) return { key: issueKey, summary: '', project, programKey: null, programName: null };
    const f = r.fields;
    let programKey = f.parent?.key || f[CLOUD_CUSTOM_FIELDS.PARENT_LINK_ALT] || null;
    let programName = null;
    if (programKey) {
      const pr = await CloudJiraAPI.getIssue(programKey);
      if (pr) programName = pr.fields?.summary || programKey;
    }
    return {
      key: issueKey,
      summary: f.summary || '',
      project,
      financialCategory: f[CLOUD_CUSTOM_FIELDS.FINANCIAL_CATEGORY] || null,
      programKey,
      programName
    };
  } catch { return { key: issueKey, summary: '', project, programKey: null, programName: null }; }
}

async function fetchProjectMembers(projectKey) {
  if (cachedMembers) return cachedMembers;
  try {
    const ur = await fetch(`/rest/api/3/user/assignable/search?project=${projectKey}&maxResults=200`);
    if (!ur.ok) return [];
    const users = await ur.json();
    const seen = new Set();
    cachedMembers = (Array.isArray(users) ? users : []).filter(u => {
      if (!u.accountId || seen.has(u.accountId) || u.active === false) return false;
      seen.add(u.accountId); return true;
    }).map(u => ({ accountId: u.accountId, displayName: u.displayName || u.emailAddress }));
    return cachedMembers;
  } catch { return []; }
}

async function fetchEpicStories(epicKey) {
  try {
    const r = await fetch('/rest/api/3/search/jql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql: `issuetype = Story AND parent = ${epicKey}`,
        fields: ['summary', 'issuetype', 'status'],
        maxResults: 500
      })
    });
    if (!r.ok) return [];
    const data = await r.json();
    console.log('JCP fetchEpicStories found:', data.issues?.length, data.issues?.map(s => s.key));
    return (data.issues || []).map(s => ({ key: s.key, summary: s.fields?.summary || s.key }));
  } catch (e) {
    console.warn('JCP fetchEpicStories error:', e);
    return [];
  }
}

async function fetchActiveSprints(projectKey) {
  try {
    const boards = await CloudJiraAPI.getBoards(projectKey);
    if (!boards.length) return [];
    const sprints = await CloudJiraAPI.getSprints(boards[0].id);
    return sprints.map(sp => ({ id: sp.id, name: sp.name, state: sp.state }));
  } catch { return []; }
}

async function fetchFinancialCategories(issueKey) {
  if (cachedFinCategories) return cachedFinCategories;
  try {
    const r = await fetch(`/rest/api/3/issue/${issueKey}/editmeta`);
    if (r.ok) {
      const meta = await r.json();
      const fc = meta.fields?.[CLOUD_CUSTOM_FIELDS.FINANCIAL_CATEGORY];
      if (fc?.allowedValues) { cachedFinCategories = fc.allowedValues; return cachedFinCategories; }
    }
  } catch {}
  return [];
}

async function createIssue(row, ctx, issueTypeName, parentStoryKey = null) {
  const fields = {
    project: { key: ctx.project },
    issuetype: { name: issueTypeName },
    summary: row.title
  };
  if (row.description) fields.description = { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: row.description }] }] };
  if (row.estimate) fields.timetracking = { originalEstimate: row.estimate, remainingEstimate: row.remaining || row.estimate };
  if (row.storyPoints) fields[CLOUD_CUSTOM_FIELDS.STORY_POINTS] = parseFloat(row.storyPoints);
  if (row.financialCategory) fields[CLOUD_CUSTOM_FIELDS.FINANCIAL_CATEGORY] = { id: row.financialCategory };
  if (row.assignee) fields.assignee = { accountId: row.assignee };
  fields[CLOUD_CUSTOM_FIELDS.EPIC_LINK] = ctx.key;

  const r = await fetch('/rest/api/3/issue', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.errorMessages?.join(', ') || Object.entries(err.errors || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || `HTTP ${r.status}`);
  }
  const created = await r.json();

  // Link to Epic or parent Story
  const parentKey = parentStoryKey || ctx.key;
  await fetch('/rest/api/3/issueLink', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: { name: 'multi-level hierarchy [GANTT]' },
      inwardIssue: { key: parentKey },
      outwardIssue: { key: created.key }
    })
  });

  return created.key;
}

const STYLES = `
#jcp-epic-creator-modal {
  position:fixed;top:0;left:0;width:100%;height:100%;
  background:rgba(9,30,66,0.54);z-index:99999;
  display:flex;align-items:center;justify-content:center;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
}
.jcp-ec-dialog {
  background:#fff;border-radius:10px;width:92vw;max-width:1400px;max-height:90vh;
  box-shadow:0 12px 40px rgba(0,0,0,0.22);display:flex;flex-direction:column;
}
.jcp-ec-header { padding:14px 24px;border-bottom:1px solid #dfe1e6;display:flex;align-items:center;gap:16px; }
.jcp-ec-header h2 { margin:0;font-size:18px;font-weight:700;color:#172b4d;white-space:nowrap; }
.jcp-ec-close { background:none;border:none;font-size:22px;cursor:pointer;color:#6b778c;padding:4px 8px;border-radius:4px; }
.jcp-ec-close:hover { background:#f4f5f7;color:#172b4d; }
.jcp-ec-body { padding:20px 24px;overflow-y:auto;flex:1; }
.jcp-ec-meta { display:flex;gap:12px;margin-bottom:16px;font-size:12px;color:#5e6c84;flex-wrap:wrap; }
.jcp-ec-meta span { background:#f4f5f7;padding:5px 14px;border-radius:20px; }
.jcp-ec-type-selector { display:flex;gap:6px;flex:1;justify-content:center; }
.jcp-ec-type-btn {
  padding:6px 16px;border:1px solid #dfe1e6;border-radius:20px;background:#fff;
  cursor:pointer;font-size:13px;font-weight:500;color:#5e6c84;transition:all 0.15s;
}
.jcp-ec-type-btn:hover { border-color:#0052cc;color:#0052cc; }
.jcp-ec-type-btn.active { border-color:#0052cc;background:#0052cc;color:#fff; }
.jcp-ec-section { margin-bottom:20px; }
.jcp-ec-section-title {
  font-size:12px;font-weight:700;color:#0052cc;text-transform:uppercase;letter-spacing:0.05em;
  padding:6px 10px;background:#e9f0ff;border-radius:4px;margin-bottom:10px;display:flex;align-items:center;gap:6px;
}
.jcp-ec-row {
  display:grid;grid-template-columns:2fr 2.5fr 90px 90px 1.6fr 1.6fr 36px;
  gap:10px;margin-bottom:10px;align-items:start;
}
@media (max-width:900px) { .jcp-ec-row { grid-template-columns:1fr 1fr; } .jcp-ec-row-header { display:none; } }
.jcp-ec-row-header { font-size:11px;font-weight:700;color:#5e6c84;text-transform:uppercase;letter-spacing:0.04em;padding-bottom:6px;border-bottom:2px solid #dfe1e6;margin-bottom:6px; }
.jcp-ec-row input,.jcp-ec-row textarea,.jcp-ec-row select {
  width:100%;padding:9px 12px;border:1.5px solid #dfe1e6;border-radius:5px;
  font-size:13.5px;color:#172b4d;box-sizing:border-box;background:#fafbfc;transition:border-color 0.15s;
}
.jcp-ec-row input:focus,.jcp-ec-row textarea:focus,.jcp-ec-row select:focus { outline:none;border-color:#0052cc;background:#fff; }
.jcp-ec-row textarea { resize:vertical;min-height:38px; }
.jcp-ec-remove { background:none;border:none;cursor:pointer;color:#de350b;font-size:18px;padding:6px;border-radius:4px; }
.jcp-ec-remove:hover { background:#ffebe6; }
.jcp-ec-footer { padding:14px 24px;border-top:1px solid #dfe1e6;display:flex;align-items:center;justify-content:space-between; }
.jcp-ec-btn { padding:9px 20px;border:none;border-radius:5px;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.2s; }
.jcp-ec-btn-primary { background:#0052cc;color:#fff; }
.jcp-ec-btn-primary:hover { background:#0747a6; }
.jcp-ec-btn-primary:disabled { background:#b3d4ff;cursor:not-allowed; }
.jcp-ec-btn-secondary { background:#f4f5f7;color:#42526e; }
.jcp-ec-btn-secondary:hover { background:#dfe1e6; }
.jcp-ec-status { font-size:13px;padding:8px 0; }
.jcp-ec-status.success { color:#36b37e;font-weight:600; }
.jcp-ec-status.error { color:#de350b;font-weight:600; }
.jcp-ec-task-indent { border-left:3px solid #e9f0ff;padding-left:12px;margin-left:4px; }
.jcp-ec-story-card { border:1px solid #dfe1e6;border-radius:8px;margin-bottom:12px;overflow:hidden; }
.jcp-ec-story-card-header { background:#f4f5f7;padding:10px 12px;display:flex;align-items:center;gap:8px; }
.jcp-ec-story-card-header .jcp-ec-row { margin-bottom:0;flex:1; }
.jcp-ec-story-card-header .jcp-ec-remove { margin-left:8px; }
.jcp-ec-story-card-body { padding:10px 12px;background:#fafbfc;border-top:1px solid #dfe1e6; }
.jcp-ec-story-card-body .jcp-ec-row { margin-bottom:8px; }
.jcp-ec-story-card-body .jcp-ec-row:last-child { margin-bottom:0; }
.jcp-ec-add-task-link { color:#0052cc;cursor:pointer;font-size:12px;font-weight:500;display:inline-flex;align-items:center;gap:4px;margin-top:6px; }
.jcp-ec-add-task-link:hover { text-decoration:underline; }
.jcp-ec-selector-row { display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap; }
.jcp-ec-selector-row select { flex:1;min-width:180px;padding:8px 12px;border:1px solid #dfe1e6;border-radius:5px;font-size:13px;background:#fff; }
.jcp-ec-desc-required { color:#de350b;font-size:11px;margin-top:2px; }
`;

function injectStyles() {
  if (document.getElementById('jcp-ec-styles')) return;
  const s = document.createElement('style');
  s.id = 'jcp-ec-styles';
  s.textContent = STYLES;
  document.head.appendChild(s);
}

function buildStoryCard(members, finCategories, defaults, storyIndex) {
  const card = document.createElement('div');
  card.className = 'jcp-ec-story-card';
  card.dataset.storyIndex = storyIndex;

  // Story header row
  const header = document.createElement('div');
  header.className = 'jcp-ec-story-card-header';
  header.innerHTML = `
    <div class="jcp-ec-row" style="grid-template-columns:2fr 3fr 80px 1.4fr 1.4fr 36px;">
      <input type="text" placeholder="Story title *" data-field="title" required>
      <textarea placeholder="Description *" rows="2" data-field="description" required style="min-height:50px;"></textarea>
      <input type="number" placeholder="Story Pts" data-field="storyPoints" min="0" disabled style="background:#f4f5f7;color:#5e6c84;cursor:not-allowed;">
      <select data-field="financialCategory" required>
        <option value="">-- Financial Cat *--</option>
        ${finCategories.map(fc => `<option value="${fc.id}" ${fc.id == defaults.financialCategory ? 'selected' : ''}>${fc.value || fc.name}</option>`).join('')}
      </select>
      <select data-field="assignee" required>
        <option value="">-- Assignee *--</option>
        ${members.map(m => `<option value="${m.accountId}" ${m.accountId == defaults.assignee ? 'selected' : ''}>${m.displayName}</option>`).join('')}
      </select>
      <button class="jcp-ec-remove" title="Remove Story">×</button>
    </div>
  `;
  card.appendChild(header);

  // Task container (initially hidden)
  const taskBody = document.createElement('div');
  taskBody.className = 'jcp-ec-story-card-body';
  taskBody.style.display = 'none';
  taskBody.innerHTML = `<div class="jcp-ec-task-list"></div>`;
  card.appendChild(taskBody);

  // Add task link
  const addTaskLink = document.createElement('div');
  addTaskLink.className = 'jcp-ec-add-task-link';
  addTaskLink.innerHTML = `+ Add Task to this Story`;
  addTaskLink.style.cssText = 'padding:8px 12px;background:#fff;border-top:1px solid #dfe1e6;cursor:pointer;';
  addTaskLink.addEventListener('click', () => {
    taskBody.style.display = 'block';
    const taskList = taskBody.querySelector('.jcp-ec-task-list');
    const content = modal?.querySelector('#jcp-ec-content');
    taskList.appendChild(buildTaskRow(members, finCategories, defaults, content?._sprints || []));
  });
  card.appendChild(addTaskLink);

  const row = header.querySelector('.jcp-ec-row');
  row.querySelectorAll('input:not([disabled]),textarea,select').forEach(el => {
    el.addEventListener('input', () => { el.style.borderColor = ''; });
    el.addEventListener('change', () => { el.style.borderColor = ''; });
  });
  row.querySelector('.jcp-ec-remove').addEventListener('click', () => card.remove());

  return card;
}

function buildStoryOnlyRow(members, finCategories, defaults) {
  const div = document.createElement('div');
  div.className = 'jcp-ec-row';
  div.style.cssText = 'grid-template-columns:2fr 3fr 80px 1.4fr 1.4fr 36px;';
  div.innerHTML = `
    <input type="text" placeholder="Story title *" data-field="title" required>
    <textarea placeholder="Description *" rows="2" data-field="description" required style="min-height:50px;"></textarea>
    <input type="number" placeholder="Story Pts" data-field="storyPoints" min="0" disabled style="background:#f4f5f7;color:#5e6c84;cursor:not-allowed;">
    <select data-field="financialCategory" required>
      <option value="">-- Financial Cat *--</option>
      ${finCategories.map(fc => `<option value="${fc.id}" ${fc.id == defaults.financialCategory ? 'selected' : ''}>${fc.value || fc.name}</option>`).join('')}
    </select>
    <select data-field="assignee" required>
      <option value="">-- Assignee *--</option>
      ${members.map(m => `<option value="${m.accountId}" ${m.accountId == defaults.assignee ? 'selected' : ''}>${m.displayName}</option>`).join('')}
    </select>
    <button class="jcp-ec-remove" title="Remove">×</button>
  `;
  div.querySelectorAll('input:not([disabled]),textarea,select').forEach(el => {
    el.addEventListener('input', () => { el.style.borderColor = ''; });
    el.addEventListener('change', () => { el.style.borderColor = ''; });
  });
  div.querySelector('.jcp-ec-remove').addEventListener('click', () => div.remove());
  return div;
}

function buildTaskRow(members, finCategories, defaults, sprints = []) {
  const div = document.createElement('div');
  div.className = 'jcp-ec-row';
  div.style.cssText = 'grid-template-columns:2fr 2fr 80px 80px 80px 1.2fr 1.2fr 1fr 32px;';
  div.innerHTML = `
    <input type="text" placeholder="Task title *" data-field="title" required>
    <textarea placeholder="Description" rows="1" data-field="description"></textarea>
    <input type="text" placeholder="Est. *" data-field="estimate" required>
    <input type="text" placeholder="Rem. *" data-field="remaining" required>
    <input type="number" placeholder="SP" data-field="storyPoints" min="0" style="background:#f4f5f7;color:#5e6c84;cursor:not-allowed;" disabled>
    <select data-field="financialCategory" required>
      <option value="">-- Fin. Cat *--</option>
      ${finCategories.map(fc => `<option value="${fc.id}" ${fc.id == defaults.financialCategory ? 'selected' : ''}>${fc.value || fc.name}</option>`).join('')}
    </select>
    <select data-field="assignee" required>
      <option value="">-- Assignee *--</option>
      ${members.map(m => `<option value="${m.accountId}" ${m.accountId == defaults.assignee ? 'selected' : ''}>${m.displayName}</option>`).join('')}
    </select>
    <select data-field="sprint">
      <option value="">-- Sprint --</option>
      ${sprints.map(sp => `<option value="${sp.id}">${sp.state === 'active' ? '🟢' : '🔵'} ${sp.name}</option>`).join('')}
    </select>
    <button class="jcp-ec-remove" title="Remove">×</button>
  `;
  const est = div.querySelector('[data-field="estimate"]');
  const rem = div.querySelector('[data-field="remaining"]');
  const spField = div.querySelector('[data-field="storyPoints"]');
  est.addEventListener('input', () => {
    if (!rem.dataset.touched) rem.value = est.value;
    spField.value = est.value;
  });
  rem.addEventListener('input', () => { rem.dataset.touched = '1'; });
  div.querySelectorAll('input:not([disabled]),textarea,select').forEach(el => {
    el.addEventListener('input', () => { el.style.borderColor = ''; });
    el.addEventListener('change', () => { el.style.borderColor = ''; });
  });
  div.querySelector('.jcp-ec-remove').addEventListener('click', () => div.remove());
  return div;
}

function buildRow(members, finCategories, defaults = {}, extraClass = '') {
  const div = document.createElement('div');
  div.className = `jcp-ec-row${extraClass ? ' ' + extraClass : ''}`;
  div.innerHTML = `
    <input type="text" placeholder="Title *" data-field="title" required>
    <textarea placeholder="Description (optional)" rows="1" data-field="description"></textarea>
    <input type="text" placeholder="e.g. 2h, 1d *" data-field="estimate" required>
    <input type="text" placeholder="Remaining *" data-field="remaining" required>
    <select data-field="financialCategory" required>
      <option value="">-- Financial Cat *--</option>
      ${finCategories.map(fc => `<option value="${fc.id}" ${fc.id == defaults.financialCategory ? 'selected' : ''}>${fc.value || fc.name}</option>`).join('')}
    </select>
    <select data-field="assignee" required>
      <option value="">-- Assignee *--</option>
      ${members.map(m => `<option value="${m.accountId}" ${m.accountId == defaults.assignee ? 'selected' : ''}>${m.displayName}</option>`).join('')}
    </select>
    <button class="jcp-ec-remove" title="Remove">×</button>
  `;
  const est = div.querySelector('[data-field="estimate"]');
  const rem = div.querySelector('[data-field="remaining"]');
  est.addEventListener('input', () => { if (!rem.dataset.touched) rem.value = est.value; });
  rem.addEventListener('input', () => { rem.dataset.touched = '1'; });
  div.querySelectorAll('input,textarea,select').forEach(el => {
    el.addEventListener('input', () => { el.style.borderColor = ''; });
    el.addEventListener('change', () => { el.style.borderColor = ''; });
  });
  div.querySelector('.jcp-ec-remove').addEventListener('click', () => div.remove());
  return div;
}

function getRowData(row) {
  const sprintSel = row.querySelector('[data-field="sprint"]');
  const spField = row.querySelector('[data-field="storyPoints"]');
  return {
    title: row.querySelector('[data-field="title"]').value.trim(),
    description: row.querySelector('[data-field="description"]').value.trim(),
    estimate: row.querySelector('[data-field="estimate"]')?.value.trim() || '',
    remaining: row.querySelector('[data-field="remaining"]')?.value.trim() || '',
    storyPoints: spField ? spField.value : null,
    financialCategory: row.querySelector('[data-field="financialCategory"]').value,
    assignee: row.querySelector('[data-field="assignee"]').value,
    sprint: sprintSel ? sprintSel.value : null
  };
}

function markError(row, selector, msg) {
  const el = row.querySelector(selector);
  if (el) { el.style.borderColor = '#de350b'; el.title = msg; }
}

function validateRows(rows, isStory = false) {
  let valid = true;
  for (const row of rows) {
    const d = getRowData(row);
    if (!d.title) { markError(row, '[data-field="title"]', 'Required'); valid = false; }
    if (isStory && !d.description) { markError(row, '[data-field="description"]', 'Required'); valid = false; }
    if (!isStory && !d.estimate) { markError(row, '[data-field="estimate"]', 'Required'); valid = false; }
    if (!isStory && !d.remaining) { markError(row, '[data-field="remaining"]', 'Required'); valid = false; }
    if (!d.financialCategory) { markError(row, '[data-field="financialCategory"]', 'Required'); valid = false; }
    if (!d.assignee) { markError(row, '[data-field="assignee"]', 'Required'); valid = false; }
  }
  return valid;
}

function buildSectionHTML(label, icon, containerId, addBtnId) {
  return `
    <div class="jcp-ec-section">
      <div class="jcp-ec-section-title">${icon} ${label}</div>
      <div class="jcp-ec-row jcp-ec-row-header">
        <span>Title *</span><span>Description</span><span>Estimate *</span><span>Remaining *</span><span>Financial Cat. *</span><span>Assignee *</span><span></span>
      </div>
      <div id="${containerId}"></div>
      <button class="jcp-ec-btn jcp-ec-btn-secondary" id="${addBtnId}" style="margin-top:6px">+ Add Row</button>
    </div>
  `;
}

export const CloudEpicCreator = {
  async open(issueKey, fields) {
    injectStyles();
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'jcp-epic-creator-modal';
    modal.innerHTML = `
      <div class="jcp-ec-dialog">
        <div class="jcp-ec-header">
          <h2>➕ Add Items to ${issueKey}</h2>
          <div class="jcp-ec-type-selector">
            <button class="jcp-ec-type-btn active" data-mode="story">Stories</button>
            <button class="jcp-ec-type-btn" data-mode="task">Tasks</button>
            <button class="jcp-ec-type-btn" data-mode="both">Stories & Tasks</button>
          </div>
          <button class="jcp-ec-close">×</button>
        </div>
        <div class="jcp-ec-body">
          <div style="text-align:center;padding:40px;color:#5e6c84;font-size:14px">Loading...</div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.jcp-ec-close').addEventListener('click', () => this.close());
    modal.addEventListener('click', (e) => { if (e.target === modal) this.close(); });

    epicContext = await fetchEpicContext(issueKey);
    const [members, finCategories, me, epicStories, activeSprints] = await Promise.all([
      fetchProjectMembers(epicContext.project),
      fetchFinancialCategories(issueKey),
      CloudJiraAPI.getCurrentUser(),
      fetchEpicStories(issueKey),
      fetchActiveSprints(epicContext.project)
    ]);

    const defaults = {
      assignee: me?.accountId || '',
      financialCategory: epicContext.financialCategory?.id || ''
    };

    const body = modal.querySelector('.jcp-ec-body');
    body.innerHTML = `
      <div id="jcp-ec-content"></div>
      <div class="jcp-ec-status" id="jcp-ec-status"></div>
    `;

    const footer = document.createElement('div');
    footer.className = 'jcp-ec-footer';
    footer.innerHTML = `
      <div></div>
      <div style="display:flex;gap:8px">
        <button class="jcp-ec-btn jcp-ec-btn-secondary" id="jcp-ec-cancel">Cancel</button>
        <button class="jcp-ec-btn jcp-ec-btn-primary" id="jcp-ec-create">Create All</button>
      </div>
    `;
    modal.querySelector('.jcp-ec-dialog').appendChild(footer);
    modal.querySelector('#jcp-ec-cancel').addEventListener('click', () => this.close());
    modal.querySelector('#jcp-ec-create').addEventListener('click', () => this._createAll(members, finCategories, defaults, epicStories, activeSprints));

    // Type selector
    selectedMode = 'story';
    const renderContent = () => {
      const content = modal.querySelector('#jcp-ec-content');
      content.innerHTML = '';

      if (selectedMode === 'story') {
        const metaDiv = document.createElement('div');
        metaDiv.className = 'jcp-ec-meta';
        metaDiv.innerHTML = `
          <span>🏷️ Epic: <strong>${epicContext.key}</strong>${epicContext.summary ? ` — ${epicContext.summary}` : ''}</span>
          ${epicContext.programName ? `<span>📁 Program: <strong>${epicContext.programName}</strong></span>` : ''}
        `;
        content.appendChild(metaDiv);
        content.insertAdjacentHTML('beforeend', buildSectionHTML('Stories — linked to Epic', '📖', 'jcp-ec-story-rows', 'jcp-ec-add-story'));
        const storyRows = content.querySelector('#jcp-ec-story-rows');
        storyRows.appendChild(buildStoryOnlyRow(members, finCategories, defaults));
        content.querySelector('#jcp-ec-add-story').addEventListener('click', () => storyRows.appendChild(buildStoryOnlyRow(members, finCategories, defaults)));
      }

      if (selectedMode === 'task') {
        // Meta bar: story selector + board selector
        const metaDiv = document.createElement('div');
        metaDiv.className = 'jcp-ec-meta';
        metaDiv.style.cssText = 'align-items:center;gap:10px;';
        metaDiv.innerHTML = `
          <span style="background:#f4f5f7;padding:5px 14px;border-radius:20px;">🏷️ Epic: <strong>${epicContext.key}</strong></span>
          ${epicContext.programName ? `<span style="background:#f4f5f7;padding:5px 14px;border-radius:20px;">📁 Program: <strong>${epicContext.programName}</strong></span>` : ''}
          <select id="jcp-ec-task-story-selector" style="padding:5px 10px;border:1px solid #dfe1e6;border-radius:20px;font-size:12px;background:#f4f5f7;color:#172b4d;">
            <option value="">-- Link to Story (optional) --</option>
          </select>
          <select id="jcp-ec-task-board-selector" style="padding:5px 10px;border:1px solid #dfe1e6;border-radius:20px;font-size:12px;background:#f4f5f7;color:#172b4d;">
            <option value="">-- Select Board for Sprints --</option>
          </select>
        `;
        content.appendChild(metaDiv);

        // Populate story dropdown
        const storySel = metaDiv.querySelector('#jcp-ec-task-story-selector');
        if (epicStories && epicStories.length) {
          epicStories.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.key;
            opt.textContent = `${s.key} - ${s.summary}`;
            storySel.appendChild(opt);
          });
        }

        // Load boards async and populate
        (async () => {
          const boards = await CloudJiraAPI.getBoards(epicContext.project);
          const boardSel = metaDiv.querySelector('#jcp-ec-task-board-selector');
          boards.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id; opt.textContent = b.name;
            boardSel.appendChild(opt);
          });
          boardSel.addEventListener('change', async () => {
            const sprints = boardSel.value ? await CloudJiraAPI.getSprints(boardSel.value) : [];
            content.querySelectorAll('[data-field="sprint"]').forEach(sprintSel => {
              sprintSel.innerHTML = '<option value="">-- Sprint --</option>' +
                sprints.map(sp => `<option value="${sp.id}">${sp.state === 'active' ? '🟢' : '🔵'} ${sp.name}</option>`).join('');
            });
            // Store sprints for new rows
            content._sprints = sprints;
          });
        })();

        content.insertAdjacentHTML('beforeend', buildSectionHTML('Tasks', '✅', 'jcp-ec-task-rows', 'jcp-ec-add-task'));
        const taskRows = content.querySelector('#jcp-ec-task-rows');
        taskRows.appendChild(buildTaskRow(members, finCategories, defaults, []));
        content.querySelector('#jcp-ec-add-task').addEventListener('click', () =>
          taskRows.appendChild(buildTaskRow(members, finCategories, defaults, content._sprints || []))
        );
      }

      if (selectedMode === 'both') {
        // Meta bar with Epic, Program, Board selector
        const metaDiv = document.createElement('div');
        metaDiv.className = 'jcp-ec-meta';
        metaDiv.style.cssText = 'align-items:center;';
        metaDiv.innerHTML = `
          <span style="background:#f4f5f7;padding:5px 14px;border-radius:20px;">🏷️ Epic: <strong>${epicContext.key}</strong></span>
          ${epicContext.programName ? `<span style="background:#f4f5f7;padding:5px 14px;border-radius:20px;">📁 Program: <strong>${epicContext.programName}</strong></span>` : ''}
          <select id="jcp-ec-both-board-selector" style="padding:5px 10px;border:1px solid #dfe1e6;border-radius:20px;font-size:12px;background:#f4f5f7;color:#172b4d;">
            <option value="">-- Select Board for Sprints --</option>
          </select>
        `;
        content.appendChild(metaDiv);

        // Load boards async
        (async () => {
          const boards = await CloudJiraAPI.getBoards(epicContext.project);
          const boardSel = metaDiv.querySelector('#jcp-ec-both-board-selector');
          boards.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id; opt.textContent = b.name;
            boardSel.appendChild(opt);
          });
          boardSel.addEventListener('change', async () => {
            const sprints = boardSel.value ? await CloudJiraAPI.getSprints(boardSel.value) : [];
            content._sprints = sprints;
            // Update all existing task row sprint dropdowns
            content.querySelectorAll('[data-field="sprint"]').forEach(sprintSel => {
              sprintSel.innerHTML = '<option value="">-- Sprint --</option>' +
                sprints.map(sp => `<option value="${sp.id}">${sp.state === 'active' ? '🟢' : '🔵'} ${sp.name}</option>`).join('');
            });
          });
        })();

        const container = document.createElement('div');
        container.id = 'jcp-ec-story-cards';
        content.appendChild(container);
        container.appendChild(buildStoryCard(members, finCategories, defaults, 0));

        const addStoryBtn = document.createElement('button');
        addStoryBtn.className = 'jcp-ec-btn jcp-ec-btn-secondary';
        addStoryBtn.textContent = '+ Add Story';
        addStoryBtn.style.marginTop = '8px';
        addStoryBtn.addEventListener('click', () => {
          const cards = container.querySelectorAll('.jcp-ec-story-card');
          container.appendChild(buildStoryCard(members, finCategories, defaults, cards.length));
        });
        content.appendChild(addStoryBtn);
      }
    };

    renderContent();

    modal.querySelectorAll('.jcp-ec-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.jcp-ec-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedMode = btn.dataset.mode;
        renderContent();
      });
    });
  },

  async _createAll(members, finCategories, defaults, epicStories, activeSprints) {
    const statusEl = modal.querySelector('#jcp-ec-status');
    const createBtn = modal.querySelector('#jcp-ec-create');

    // Gather rows based on mode
    let storyRows = [];
    let taskRows = [];
    let storyCards = [];

    if (selectedMode === 'story') {
      storyRows = [...(modal.querySelectorAll('#jcp-ec-story-rows .jcp-ec-row') || [])];
      if (!validateRows(storyRows, true)) {
        statusEl.className = 'jcp-ec-status error';
        statusEl.textContent = 'Please fill all required fields including Description for Stories.';
        return;
      }
    }

    if (selectedMode === 'task') {
      taskRows = [...(modal.querySelectorAll('#jcp-ec-task-rows .jcp-ec-row') || [])];
      if (!validateRows(taskRows, false)) {
        statusEl.className = 'jcp-ec-status error';
        statusEl.textContent = 'Please fill all required fields (highlighted in red).';
        return;
      }
    }

    if (selectedMode === 'both') {
      storyCards = [...(modal.querySelectorAll('.jcp-ec-story-card') || [])];
      // Validate each story card
      for (const card of storyCards) {
        const storyRow = card.querySelector('.jcp-ec-story-card-header .jcp-ec-row');
        if (!validateRows([storyRow], true)) {
          statusEl.className = 'jcp-ec-status error';
          statusEl.textContent = 'Please fill all required fields including Description for Stories.';
          return;
        }
        const taskRowEls = [...(card.querySelectorAll('.jcp-ec-story-card-body .jcp-ec-row') || [])];
        if (taskRowEls.length && !validateRows(taskRowEls, false)) {
          statusEl.className = 'jcp-ec-status error';
          statusEl.textContent = 'Please fill all required fields for Tasks.';
          return;
        }
      }
    }

    const totalItems = selectedMode === 'both'
      ? storyCards.reduce((sum, c) => sum + 1 + c.querySelectorAll('.jcp-ec-story-card-body .jcp-ec-row').length, 0)
      : storyRows.length + taskRows.length;

    if (!totalItems) {
      statusEl.className = 'jcp-ec-status error';
      statusEl.textContent = 'Please add at least one item.';
      return;
    }

    createBtn.disabled = true;
    createBtn.textContent = 'Creating...';
    statusEl.className = 'jcp-ec-status';
    statusEl.textContent = '';

    let created = 0;
    const errors = [];

    // Get selected story and sprint for Tasks only mode
    const selectedStoryKey = modal.querySelector('#jcp-ec-task-story-selector')?.value || null;
    const selectedSprintId = modal.querySelector('#jcp-ec-task-sprint-selector')?.value || null;

    // Mode: Stories only
    if (selectedMode === 'story') {
      for (const row of storyRows) {
        try {
          statusEl.textContent = `Creating Story ${created + 1}/${totalItems}: ${getRowData(row).title}...`;
          const key = await createIssue(getRowData(row), epicContext, 'Story');
          created++;
          row.style.opacity = '0.4'; row.style.pointerEvents = 'none';
          const t = row.querySelector('[data-field="title"]');
          t.value = `✓ ${key}`; t.style.color = '#36b37e';
        } catch (e) {
          errors.push(`Story "${getRowData(row).title}": ${e.message}`);
          row.querySelector('[data-field="title"]').style.borderColor = '#de350b';
        }
      }
    }

    // Mode: Tasks only
    if (selectedMode === 'task') {
      for (const row of taskRows) {
        try {
          const data = getRowData(row);
          statusEl.textContent = `Creating Task ${created + 1}/${totalItems}: ${data.title}...`;
          const key = await createIssue(data, epicContext, 'Task', selectedStoryKey);
          // Add to sprint via Agile API
          if (data.sprint) {
            await fetch(`/rest/agile/1.0/sprint/${data.sprint}/issue`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ issues: [key] })
            });
          }
          created++;
          row.style.opacity = '0.4'; row.style.pointerEvents = 'none';
          const t = row.querySelector('[data-field="title"]');
          t.value = `✓ ${key}`; t.style.color = '#36b37e';
        } catch (e) {
          errors.push(`Task "${getRowData(row).title}": ${e.message}`);
          row.querySelector('[data-field="title"]').style.borderColor = '#de350b';
        }
      }
    }

    // Mode: Stories & Tasks
    if (selectedMode === 'both') {
      for (const card of storyCards) {
        const storyRow = card.querySelector('.jcp-ec-story-card-header .jcp-ec-row');
        const storyData = getRowData(storyRow);
        let storyKey = null;

        try {
          statusEl.textContent = `Creating Story ${created + 1}/${totalItems}: ${storyData.title}...`;
          storyKey = await createIssue(storyData, epicContext, 'Story');
          created++;
          storyRow.style.opacity = '0.4'; storyRow.style.pointerEvents = 'none';
          const t = storyRow.querySelector('[data-field="title"]');
          t.value = `✓ ${storyKey}`; t.style.color = '#36b37e';
        } catch (e) {
          errors.push(`Story "${storyData.title}": ${e.message}`);
          storyRow.querySelector('[data-field="title"]').style.borderColor = '#de350b';
          continue; // Skip tasks for this story
        }

        // Create tasks under this story
        const taskRowEls = [...(card.querySelectorAll('.jcp-ec-story-card-body .jcp-ec-row') || [])];
        for (const taskRow of taskRowEls) {
          try {
            statusEl.textContent = `Creating Task ${created + 1}/${totalItems}: ${getRowData(taskRow).title}...`;
            const key = await createIssue(getRowData(taskRow), epicContext, 'Task', storyKey);
            // Add to sprint via Agile API
            const taskData = getRowData(taskRow);
            if (taskData.sprint) {
              await fetch(`/rest/agile/1.0/sprint/${taskData.sprint}/issue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ issues: [key] })
              });
            }
            created++;
            taskRow.style.opacity = '0.4'; taskRow.style.pointerEvents = 'none';
            const t = taskRow.querySelector('[data-field="title"]');
            t.value = `✓ ${key}`; t.style.color = '#36b37e';
          } catch (e) {
            errors.push(`Task "${getRowData(taskRow).title}": ${e.message}`);
            taskRow.querySelector('[data-field="title"]').style.borderColor = '#de350b';
          }
        }
      }
    }

    createBtn.disabled = false;
    createBtn.textContent = 'Create All';

    if (errors.length) {
      statusEl.className = 'jcp-ec-status error';
      statusEl.textContent = `Created ${created}/${totalItems}. Errors: ${errors.join('; ')}`;
    } else {
      statusEl.className = 'jcp-ec-status success';
      statusEl.textContent = `✓ All ${created} items created successfully!`;
      setTimeout(() => this.close(), 2000);
    }
  },

  close() {
    if (modal) { modal.remove(); modal = null; }
  },

  addButton(issueKey, fields) {
    const issueType = fields.issuetype?.name?.toLowerCase() || '';
    document.getElementById('jcp-epic-creator-btn-wrap')?.remove();
    if (!issueType.includes('epic')) return;

    const actionGroup = document.querySelector('[role="group"][aria-label="Action items"]');
    if (!actionGroup) return;

    const wrap = document.createElement('div');
    wrap.id = 'jcp-epic-creator-btn-wrap';
    wrap.style.cssText = 'display:inline-flex;align-items:center;';
    wrap.innerHTML = `<button id="jcp-epic-add-btn" style="padding:8px 12px;background:#f4f5f7;color:#42526e;border:1px solid #dfe1e6;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">➕ Add Items</button>`;
    actionGroup.insertBefore(wrap, actionGroup.firstChild);
    wrap.querySelector('#jcp-epic-add-btn').addEventListener('click', () => this.open(issueKey, fields));
  }
};
