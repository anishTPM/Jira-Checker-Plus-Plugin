import { CloudJiraAPI } from './jira-api.js';
import { CLOUD_CUSTOM_FIELDS } from '../../../shared/constants.js';

let modal = null;
let storyContext = null;
let cachedMembers = null;
let cachedFinCategories = null;

async function fetchStoryContext(issueKey, fields) {
  const project = issueKey.split('-')[0];
  try {
    const r = await CloudJiraAPI.getIssue(issueKey);
    if (!r) return { key: issueKey, summary: '', project, epicKey: null, epicName: null, programName: null };

    const f = r.fields;
    let epicKey = f[CLOUD_CUSTOM_FIELDS.EPIC_LINK] || f[CLOUD_CUSTOM_FIELDS.EPIC_LINK_ALT] || f.parent?.key || null;
    let epicName = null;
    let programName = null;

    if (epicKey) {
      try {
        const er = await CloudJiraAPI.getIssue(epicKey);
        if (er) {
          epicName = er.fields.summary || epicKey;
          const programKey = er.fields.parent?.key || er.fields[CLOUD_CUSTOM_FIELDS.PARENT_LINK_ALT] || null;
          if (programKey) {
            const pr = await CloudJiraAPI.getIssue(programKey);
            if (pr) programName = pr.fields.summary || programKey;
          }
        }
      } catch {}
    }

    return {
      key: issueKey,
      summary: f.summary || '',
      project,
      epicKey,
      epicName,
      programName,
      financialCategory: f[CLOUD_CUSTOM_FIELDS.FINANCIAL_CATEGORY] || null
    };
  } catch {
    return { key: issueKey, summary: '', project, epicKey: null, epicName: null, programName: null };
  }
}

async function fetchProjectMembers(projectKey) {
  if (cachedMembers) return cachedMembers;
  try {
    const r = await CloudJiraAPI.search(`project=${projectKey}`, 'assignee', 1);
    const allUsers = [];
    const seen = new Set();

    // Fetch assignable users via API v3
    const ur = await fetch(`/rest/api/3/users/search?project=${projectKey}&maxResults=200`);
    if (ur.ok) {
      const users = await ur.json();
      (Array.isArray(users) ? users : []).forEach(u => {
        const key = u.accountId;
        if (key && !seen.has(key)) {
          seen.add(key);
          allUsers.push({
            accountId: u.accountId,
            displayName: u.displayName,
            emailAddress: u.emailAddress,
            avatarUrls: u.avatarUrls || {}
          });
        }
      });
    }

    cachedMembers = allUsers;
    return cachedMembers;
  } catch {
    return [];
  }
}

async function fetchFinancialCategories() {
  if (cachedFinCategories) return cachedFinCategories;
  try {
    const issueKey = CloudJiraAPI.getIssueKeyFromURL();
    const r = await fetch(`/rest/api/3/issue/${issueKey}/editmeta`);
    if (r.ok) {
      const meta = await r.json();
      const fcField = meta.fields?.[CLOUD_CUSTOM_FIELDS.FINANCIAL_CATEGORY];
      if (fcField?.allowedValues) {
        cachedFinCategories = fcField.allowedValues;
        return cachedFinCategories;
      }
    }
  } catch {}
  return [];
}

async function createTask(row, ctx) {
  const fields = {
    project: { key: ctx.project },
    issuetype: { name: 'Task' },
    summary: row.title
  };

  if (row.description) fields.description = { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: row.description }] }] };
  if (row.estimate) fields.timetracking = { originalEstimate: row.estimate, remainingEstimate: row.remaining || row.estimate };
  if (row.financialCategory) fields[CLOUD_CUSTOM_FIELDS.FINANCIAL_CATEGORY] = { id: row.financialCategory };
  if (row.assignee) fields.assignee = { id: row.assignee };
  if (ctx.epicKey) fields[CLOUD_CUSTOM_FIELDS.EPIC_LINK] = ctx.epicKey;

  const payload = { fields };

  const r = await fetch('/rest/api/3/issues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.errorMessages?.join(', ') || `HTTP ${r.status}`);
  }

  const created = await r.json();
  return created.key;
}

const STYLES = `
#jcp-cloud-bulk-modal {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(9,30,66,0.54); z-index: 99999;
  display: flex; align-items: center; justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.jcp-cloud-bulk-dialog {
  background: #fff; border-radius: 8px; width: 95vw; max-width: 1200px; max-height: 85vh;
  box-shadow: 0 8px 32px rgba(0,0,0,0.25); display: flex; flex-direction: column;
}
.jcp-cloud-bulk-header {
  padding: 16px 20px; border-bottom: 1px solid #dfe1e6;
  display: flex; align-items: center; justify-content: space-between;
}
.jcp-cloud-bulk-header h2 { margin: 0; font-size: 16px; color: #172b4d; }
.jcp-cloud-bulk-close { background: none; border: none; font-size: 20px; cursor: pointer; color: #6b778c; padding: 4px 8px; }
.jcp-cloud-bulk-close:hover { color: #172b4d; }
.jcp-cloud-bulk-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
.jcp-cloud-bulk-meta { display: flex; gap: 12px; margin-bottom: 16px; font-size: 12px; color: #5e6c84; flex-wrap: wrap; }
.jcp-cloud-bulk-meta span { background: #f4f5f7; padding: 5px 12px; border-radius: 4px; }
.jcp-cloud-bulk-row {
  display: grid; grid-template-columns: 2fr 2fr 100px 100px 140px 140px 32px;
  gap: 10px; margin-bottom: 10px; align-items: start;
}
.jcp-cloud-bulk-row-header { font-size: 11px; font-weight: 600; color: #5e6c84; text-transform: uppercase; padding-bottom: 4px; border-bottom: 1px solid #dfe1e6; margin-bottom: 8px; }
.jcp-cloud-bulk-row input, .jcp-cloud-bulk-row textarea, .jcp-cloud-bulk-row select {
  width: 100%; padding: 8px 10px; border: 1px solid #dfe1e6; border-radius: 4px;
  font-size: 13px; color: #172b4d; box-sizing: border-box;
}
.jcp-cloud-bulk-row input:focus, .jcp-cloud-bulk-row textarea:focus, .jcp-cloud-bulk-row select:focus {
  outline: none; border-color: #0052cc;
}
.jcp-cloud-bulk-row textarea { resize: vertical; min-height: 36px; }
.jcp-cloud-bulk-remove { background: none; border: none; cursor: pointer; color: #de350b; font-size: 16px; padding: 6px; }
.jcp-cloud-bulk-remove:hover { background: #ffebe6; border-radius: 3px; }
.jcp-cloud-bulk-footer {
  padding: 12px 20px; border-top: 1px solid #dfe1e6;
  display: flex; align-items: center; justify-content: space-between;
}
.jcp-cloud-bulk-btn {
  padding: 8px 16px; border: none; border-radius: 4px; font-size: 13px;
  font-weight: 600; cursor: pointer; transition: background 0.2s;
}
.jcp-cloud-bulk-btn-primary { background: #0052cc; color: #fff; }
.jcp-cloud-bulk-btn-primary:hover { background: #0747a6; }
.jcp-cloud-bulk-btn-primary:disabled { background: #b3d4ff; cursor: not-allowed; }
.jcp-cloud-bulk-btn-secondary { background: #f4f5f7; color: #42526e; }
.jcp-cloud-bulk-btn-secondary:hover { background: #dfe1e6; }
.jcp-cloud-bulk-status { font-size: 12px; padding: 8px 0; }
.jcp-cloud-bulk-status.success { color: #36b37e; }
.jcp-cloud-bulk-status.error { color: #de350b; }
`;

function injectStyles() {
  if (document.getElementById('jcp-cloud-bulk-styles')) return;
  const style = document.createElement('style');
  style.id = 'jcp-cloud-bulk-styles';
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function buildRow(index, members, finCategories, ctx, defaults = {}) {
  const div = document.createElement('div');
  div.className = 'jcp-cloud-bulk-row';
  div.dataset.index = index;

  div.innerHTML = `
    <input type="text" placeholder="Task title *" data-field="title" required>
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
    <button class="jcp-cloud-bulk-remove" title="Remove">×</button>
  `;

  const estInput = div.querySelector('[data-field="estimate"]');
  const remInput = div.querySelector('[data-field="remaining"]');
  estInput.addEventListener('input', () => {
    if (!remInput.dataset.touched) remInput.value = estInput.value;
  });
  remInput.addEventListener('input', () => { remInput.dataset.touched = '1'; });

  div.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', () => { el.style.borderColor = ''; });
    el.addEventListener('change', () => { el.style.borderColor = ''; });
  });

  div.querySelector('.jcp-cloud-bulk-remove').addEventListener('click', () => { div.remove(); });
  return div;
}

function getRowData(row) {
  const fcSelect = row.querySelector('[data-field="financialCategory"]');
  return {
    title: row.querySelector('[data-field="title"]').value.trim(),
    description: row.querySelector('[data-field="description"]').value.trim(),
    estimate: row.querySelector('[data-field="estimate"]').value.trim(),
    remaining: row.querySelector('[data-field="remaining"]').value.trim(),
    financialCategory: fcSelect.value,
    assignee: row.querySelector('[data-field="assignee"]').value
  };
}

function markError(row, selector, title) {
  const el = row.querySelector(selector);
  if (el) { el.style.borderColor = '#de350b'; el.title = title; }
}

export const CloudBulkTaskCreator = {
  async open(issueKey, fields) {
    injectStyles();

    const issueType = fields.issuetype?.name?.toLowerCase() || '';
    if (!issueType.includes('story')) return;

    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'jcp-cloud-bulk-modal';
    modal.innerHTML = `
      <div class="jcp-cloud-bulk-dialog">
        <div class="jcp-cloud-bulk-header">
          <h2>➕ Bulk Create Tasks for ${issueKey}</h2>
          <button class="jcp-cloud-bulk-close">×</button>
        </div>
        <div class="jcp-cloud-bulk-body">
          <div style="text-align:center;padding:40px;color:#5e6c84">
            <div style="font-size:14px">Loading story context and team members...</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.jcp-cloud-bulk-close').addEventListener('click', () => this.close());
    modal.addEventListener('click', (e) => { if (e.target === modal) this.close(); });

    storyContext = await fetchStoryContext(issueKey, fields);
    const [members, finCategories, me] = await Promise.all([
      fetchProjectMembers(storyContext.project),
      fetchFinancialCategories(),
      CloudJiraAPI.getCurrentUser()
    ]);

    const selfDefaults = {
      assignee: me?.accountId || '',
      financialCategory: storyContext.financialCategory?.id || ''
    };

    const body = modal.querySelector('.jcp-cloud-bulk-body');

    if (!storyContext.epicKey) {
      body.innerHTML = `
        <div style="background:#ffebe6;border:1px solid #de350b;border-radius:6px;padding:16px">
          <div style="font-size:13px;color:#de350b;font-weight:600">⚠️ This Story has no Epic Link</div>
          <div style="font-size:12px;color:#de350b;margin-top:6px">Please link an Epic before creating Tasks.</div>
        </div>
      `;
      const footer = document.createElement('div');
      footer.className = 'jcp-cloud-bulk-footer';
      footer.innerHTML = `<div></div><button class="jcp-cloud-bulk-btn jcp-cloud-bulk-btn-secondary" id="jcp-close">Close</button>`;
      modal.querySelector('.jcp-cloud-bulk-dialog').appendChild(footer);
      modal.querySelector('#jcp-close').addEventListener('click', () => this.close());
      return;
    }

    body.innerHTML = `
      <div class="jcp-cloud-bulk-meta">
        <span>📋 Story: <strong>${issueKey}</strong></span>
        <span>🏷️ Epic: <strong>${storyContext.epicKey}</strong>${storyContext.epicName ? ` — ${storyContext.epicName}` : ''}</span>
        ${storyContext.programName ? `<span>📁 Program: <strong>${storyContext.programName}</strong></span>` : ''}
      </div>
      <div class="jcp-cloud-bulk-row jcp-cloud-bulk-row-header">
        <span>Title *</span><span>Description</span><span>Estimate *</span><span>Remaining *</span><span>Financial Cat. *</span><span>Assignee *</span><span></span>
      </div>
      <div id="jcp-cloud-bulk-rows"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="jcp-cloud-bulk-btn jcp-cloud-bulk-btn-secondary" id="jcp-cloud-bulk-add-row">+ Add Task</button>
      </div>
      <div class="jcp-cloud-bulk-status" id="jcp-cloud-bulk-status"></div>
    `;

    const dialog = modal.querySelector('.jcp-cloud-bulk-dialog');
    const footer = document.createElement('div');
    footer.className = 'jcp-cloud-bulk-footer';
    footer.innerHTML = `
      <div></div>
      <div style="display:flex;gap:8px">
        <button class="jcp-cloud-bulk-btn jcp-cloud-bulk-btn-secondary" id="jcp-cloud-bulk-cancel">Cancel</button>
        <button class="jcp-cloud-bulk-btn jcp-cloud-bulk-btn-primary" id="jcp-cloud-bulk-create">Create All</button>
      </div>
    `;
    dialog.appendChild(footer);

    const rowsContainer = modal.querySelector('#jcp-cloud-bulk-rows');
    rowsContainer.appendChild(buildRow(0, members, finCategories, storyContext, selfDefaults));

    modal.querySelector('#jcp-cloud-bulk-add-row').addEventListener('click', () => {
      const rows = rowsContainer.querySelectorAll('.jcp-cloud-bulk-row');
      rowsContainer.appendChild(buildRow(rows.length, members, finCategories, storyContext, selfDefaults));
    });

    modal.querySelector('#jcp-cloud-bulk-cancel').addEventListener('click', () => this.close());
    modal.querySelector('#jcp-cloud-bulk-create').addEventListener('click', () => this._createAll(rowsContainer));
  },

  async _createAll(rowsContainer) {
    const rows = rowsContainer.querySelectorAll('.jcp-cloud-bulk-row');
    const statusEl = modal.querySelector('#jcp-cloud-bulk-status');
    const createBtn = modal.querySelector('#jcp-cloud-bulk-create');

    const tasks = [];
    const validationErrors = [];

    for (const row of rows) {
      const data = getRowData(row);
      if (!data.title) { markError(row, '[data-field="title"]', 'Title required'); validationErrors.push('Title'); continue; }
      if (!data.estimate) { markError(row, '[data-field="estimate"]', 'Estimate required'); validationErrors.push('Estimate'); continue; }
      if (!data.remaining) { markError(row, '[data-field="remaining"]', 'Remaining required'); validationErrors.push('Remaining'); continue; }
      if (!data.financialCategory) { markError(row, '[data-field="financialCategory"]', 'Financial Category required'); validationErrors.push('Financial Category'); continue; }
      if (!data.assignee) { markError(row, '[data-field="assignee"]', 'Assignee required'); validationErrors.push('Assignee'); continue; }
      tasks.push({ data, row });
    }

    if (validationErrors.length) {
      statusEl.className = 'jcp-cloud-bulk-status error';
      statusEl.textContent = 'Please fill all required fields (highlighted in red).';
      return;
    }

    if (!tasks.length) {
      statusEl.className = 'jcp-cloud-bulk-status error';
      statusEl.textContent = 'Please add at least one task.';
      return;
    }

    createBtn.disabled = true;
    createBtn.textContent = 'Creating...';
    statusEl.className = 'jcp-cloud-bulk-status';
    statusEl.textContent = '';

    let created = 0;
    const errors = [];

    for (const { data, row } of tasks) {
      try {
        statusEl.textContent = `Creating ${created + 1}/${tasks.length}: ${data.title}...`;
        const taskKey = await createTask(data, storyContext);
        created++;
        row.style.opacity = '0.4';
        row.style.pointerEvents = 'none';
        const titleInput = row.querySelector('[data-field="title"]');
        titleInput.value = `✓ ${taskKey}`;
        titleInput.style.color = '#36b37e';
      } catch (e) {
        errors.push(`${data.title}: ${e.message}`);
        row.querySelector('[data-field="title"]').style.borderColor = '#de350b';
      }
    }

    createBtn.disabled = false;
    createBtn.textContent = 'Create All';

    if (errors.length) {
      statusEl.className = 'jcp-cloud-bulk-status error';
      statusEl.textContent = `Created ${created}/${tasks.length}. Errors: ${errors.join('; ')}`;
    } else {
      statusEl.className = 'jcp-cloud-bulk-status success';
      statusEl.textContent = `✓ All ${created} tasks created!`;
      setTimeout(() => this.close(), 2000);
    }
  },

  close() {
    if (modal) { modal.remove(); modal = null; }
  },

  addButton(issueKey, fields) {
    const issueType = fields.issuetype?.name?.toLowerCase() || '';
    document.getElementById('jcp-cloud-bulk-btn-wrap')?.remove();
    if (!issueType.includes('story')) return;

    const wrap = document.createElement('div');
    wrap.id = 'jcp-cloud-bulk-btn-wrap';
    wrap.style.cssText = 'display:inline-flex;align-items:center;margin-left:8px;';
    wrap.innerHTML = `<button id="jcp-cloud-bulk-trigger" style="padding:8px 12px;background:#f4f5f7;color:#42526e;border:1px solid #dfe1e6;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer">➕ Add Tasks</button>`;

    // Try to find toolbar area
    const toolbar = document.querySelector('[data-testid="issue-view-foundation.ui.header"]')?.parentElement
      || document.querySelector('[data-testid="issue.views.issue-base.foundation.breadcrumbs.breadcrumb-current-issue-container"]')?.parentElement
      || document.body;

    toolbar.appendChild(wrap);
    wrap.querySelector('#jcp-cloud-bulk-trigger').addEventListener('click', () => this.open(issueKey, fields));
  }
};
