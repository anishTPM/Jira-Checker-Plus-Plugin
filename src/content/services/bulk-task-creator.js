import { JiraAPI } from './jira-api.js';
import { CUSTOM_FIELDS } from '../../shared/constants.js';

let modal = null;
let storyContext = null;
let cachedMembers = null;
let cachedFinCategories = null;
let cachedLinkType = null;
let cachedSprints = null;
let canManageSprints = false;
let currentUser = null;

// ============================================================================
// API HELPERS
// ============================================================================
async function fetchStoryContext(issueKey, fields, isEpicPage = false) {
  const project = issueKey.split('-')[0];
  if (isEpicPage) {
    // On Epic page: epic IS the current issue, fetch its program
    let programName = null;
    try {
      const er = await fetch(`/rest/api/2/issue/${issueKey}?fields=summary,customfield_16400,parent`);
      if (er.ok) {
        const ed = await er.json();
        const programKey = ed.fields.customfield_16400 || ed.fields.parent?.key || null;
        if (programKey) {
          const pr = await fetch(`/rest/api/2/issue/${programKey}?fields=summary`);
          if (pr.ok) programName = (await pr.json()).fields.summary || programKey;
        }
      }
    } catch {}
    return { key: issueKey, summary: fields.summary || '', project, epicKey: issueKey, epicName: fields.summary || issueKey, programName, financialCategory: fields["customfield_10350"] || null, sprintId: null, sprintName: null, isEpicPage: true };
  }

  try {
    // Fetch story with all possible epic link fields
    const r = await fetch(`/rest/api/2/issue/${issueKey}?fields=summary,parent,customfield_10000,customfield_10002,customfield_10014,customfield_10008,${CUSTOM_FIELDS.FINANCIAL_CATEGORY},${CUSTOM_FIELDS.SPRINT_FIELDS.join(',')},issuelinks`);
    if (r.ok) {
      const data = await r.json();
      const f = data.fields;

      // Find Epic Link — customfield_10000 is Epic Link, customfield_10002 is Epic Name
      let epicKey = f.customfield_10000 || f.customfield_10014 || f.customfield_10008 || null;
      let epicNameFromField = f.customfield_10002 || null;

      // Check parent field
      if (!epicKey && f.parent?.key) {
        epicKey = f.parent.key;
      }

      // Check issue links for Epic relationship
      if (!epicKey && f.issuelinks) {
        for (const link of f.issuelinks) {
          const outType = link.outwardIssue?.fields?.issuetype?.name?.toLowerCase() || '';
          const inType = link.inwardIssue?.fields?.issuetype?.name?.toLowerCase() || '';
          if (outType.includes('epic')) { epicKey = link.outwardIssue.key; break; }
          if (inType.includes('epic')) { epicKey = link.inwardIssue.key; break; }
        }
      }

      console.log('JCP Bulk: Story context — epicKey:', epicKey, 'cf10000:', f.customfield_10000, 'cf10002:', f.customfield_10002, 'parent:', f.parent?.key);

      const sprint = f.sprint || f.customfield_10020?.[0] || f.customfield_10004?.[0] || null;
      const activeSprint = Array.isArray(f.customfield_10020)
        ? f.customfield_10020.find(s => s.state === 'active') || f.customfield_10020[0]
        : sprint;

      // Fetch Epic details (name + parent/program)
      let epicName = null;
      let programName = null;
      let programKey = null;
      if (epicKey) {
        try {
          const er = await fetch(`/rest/api/2/issue/${epicKey}?fields=summary,parent,customfield_16400,issuelinks`);
          if (er.ok) {
            const ed = await er.json();
            epicName = epicNameFromField || ed.fields.summary || epicKey;
            // Program = customfield_16400 (Parent Link) or parent field
            programKey = ed.fields.customfield_16400 || ed.fields.parent?.key || null;

            // Also check Epic's links for parent
            if (!programKey && ed.fields.issuelinks) {
              for (const link of ed.fields.issuelinks) {
                const linkInward = (link.type?.inward || '').toLowerCase();
                if (linkInward.includes('child of') && link.outwardIssue) {
                  programKey = link.outwardIssue.key;
                  break;
                }
              }
            }

            if (programKey) {
              try {
                const pr = await fetch(`/rest/api/2/issue/${programKey}?fields=summary`);
                if (pr.ok) programName = (await pr.json()).fields.summary || programKey;
              } catch {}
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
        financialCategory: f[CUSTOM_FIELDS.FINANCIAL_CATEGORY],
        sprintId: activeSprint?.id || null,
        sprintName: activeSprint?.name || null
      };
    }
  } catch {}
  return { key: issueKey, summary: '', project, epicKey: null, epicName: null, programName: null, financialCategory: null, sprintId: null, sprintName: null };
}

async function fetchProjectMembers(projectKey) {
  if (cachedMembers) return cachedMembers;

  const seen = new Set();
  const allUsers = [];

  const addUsers = (users) => {
    (users || []).forEach(u => {
      const key = u.accountId || u.name;
      if (key && !seen.has(key)) { seen.add(key); allUsers.push(u); }
    });
  };

  const fetchPage = async (url) => {
    const results = [];
    let startAt = 0;
    while (true) {
      try {
        const sep = url.includes('?') ? '&' : '?';
        const r = await fetch(`${url}${sep}maxResults=200&startAt=${startAt}`);
        if (!r.ok) break;
        const page = await r.json();
        const items = Array.isArray(page) ? page : (page.values || page.users || []);
        if (!items.length) break;
        results.push(...items);
        if (items.length < 200) break;
        startAt += 200;
      } catch { break; }
    }
    return results;
  };

  // 1. Project assignable users
  addUsers(await fetchPage(`/rest/api/2/user/assignable/search?project=${projectKey}`));

  // 2. All active users (Jira Server: username=. returns all)
  addUsers(await fetchPage(`/rest/api/2/user/search?username=.`));

  // 3. Broader user search
  addUsers(await fetchPage(`/rest/api/2/user/search?query=`));

  // 4. Project role actors
  try {
    const rolesRes = await fetch(`/rest/api/2/project/${projectKey}/role`);
    if (rolesRes.ok) {
      const roles = await rolesRes.json();
      for (const roleUrl of Object.values(roles).slice(0, 10)) {
        try {
          const rr = await fetch(roleUrl);
          if (!rr.ok) continue;
          const role = await rr.json();
          (role.actors || []).forEach(actor => {
            if (actor.type === 'atlassian-user-role-actor') {
              const key = actor.actorUser?.accountId || actor.name;
              if (key && !seen.has(key)) {
                seen.add(key);
                allUsers.push({ name: actor.name, displayName: actor.displayName, accountId: actor.actorUser?.accountId, avatarUrls: {} });
              }
            }
          });
        } catch {}
      }
    }
  } catch {}

  cachedMembers = allUsers.filter(u => u.displayName && u.active !== false);
  console.log('JCP Bulk: Total assignable users:', cachedMembers.length, cachedMembers.map(u => u.displayName));
  return cachedMembers;
}

async function fetchCurrentUser() {
  if (currentUser) return currentUser;
  try {
    const r = await fetch('/rest/api/2/myself');
    if (r.ok) { currentUser = await r.json(); return currentUser; }
  } catch {}
  return null;
}

async function fetchSprintsAndPermission(projectKey, storyKey) {
  if (cachedSprints !== null) return { sprints: cachedSprints, canManage: canManageSprints };

  // Check sprint permission
  try {
    const r = await fetch(`/rest/api/2/mypermissions?projectKey=${projectKey}&permissions=MANAGE_SPRINTS_PERMISSION,EDIT_ISSUES`);
    if (r.ok) {
      const data = await r.json();
      console.log('JCP Bulk: Permissions:', JSON.stringify(data.permissions));
      canManageSprints = data.permissions?.MANAGE_SPRINTS_PERMISSION?.havePermission ||
                         data.permissions?.EDIT_ISSUES?.havePermission || false;
      console.log('JCP Bulk: canManageSprints =', canManageSprints);
    }
  } catch (e) {
    console.log('JCP Bulk: Permission check failed:', e);
  }

  cachedSprints = [];
  return { sprints: [], canManage: canManageSprints };
}

async function fetchBoards(projectKey) {
  try {
    const r = await fetch(`/rest/agile/1.0/board?projectKeyOrId=${projectKey}&maxResults=50`);
    if (r.ok) {
      const data = await r.json();
      return data.values || [];
    }
  } catch {}
  return [];
}

async function fetchSprintsForBoard(boardId) {
  try {
    const r = await fetch(`/rest/agile/1.0/board/${boardId}/sprint?maxResults=50`);
    if (r.ok) {
      const all = (await r.json()).values || [];
      return all.filter(s => s.state === 'active' || s.state === 'future');
    }
  } catch {}
  return [];
}

async function fetchFinancialCategories() {
  if (cachedFinCategories) return cachedFinCategories;
  // Try edit meta first (most reliable)
  try {
    const issueKey = JiraAPI.getIssueKeyFromURL();
    const r = await fetch(`/rest/api/2/issue/${issueKey}/editmeta`);
    if (r.ok) {
      const meta = await r.json();
      const fcField = meta.fields?.[CUSTOM_FIELDS.FINANCIAL_CATEGORY];
      if (fcField?.allowedValues) { cachedFinCategories = fcField.allowedValues; return cachedFinCategories; }
    }
  } catch {}
  return [];
}

async function fetchLinkType() {
  if (cachedLinkType) return cachedLinkType;
  try {
    const r = await fetch('/rest/api/2/issueLinkType');
    if (!r.ok) return null;
    const data = await r.json();
    const types = data.issueLinkTypes || [];
    console.log('JCP Bulk: Link types:', types.map(t => `${t.name} ("${t.inward}" / "${t.outward}")`));
    // Find the one where outward = "is parent of" or similar
    const match = types.find(t =>
      t.outward?.toLowerCase().includes('is parent of') ||
      t.inward?.toLowerCase().includes('is child of')
    ) || types.find(t =>
      t.name?.toLowerCase().includes('hierarch') ||
      t.name?.toLowerCase().includes('parent')
    );
    if (match) {
      cachedLinkType = match;
      console.log('JCP Bulk: Using link type:', match.name, `(inward: "${match.inward}", outward: "${match.outward}")`);
    }
    return cachedLinkType;
  } catch { return null; }
}

function parseTimeToSeconds(str) {
  if (!str) return null;
  str = str.trim().toLowerCase();
  let total = 0;
  const w = str.match(/([\d.]+)\s*w/), d = str.match(/([\d.]+)\s*d/);
  const h = str.match(/([\d.]+)\s*h/), m = str.match(/([\d.]+)\s*m(?!o)/);
  if (w) total += parseFloat(w[1]) * 5 * 8 * 3600;
  if (d) total += parseFloat(d[1]) * 8 * 3600;
  if (h) total += parseFloat(h[1]) * 3600;
  if (m) total += parseFloat(m[1]) * 60;
  if (!w && !d && !h && !m && !isNaN(parseFloat(str))) total = parseFloat(str) * 3600;
  return total > 0 ? total : null;
}

async function createTask(row, ctx) {
  const fields = {
    project: { key: ctx.project },
    issuetype: { name: 'Task' },
    summary: row.title,
  };

  if (row.description) fields.description = row.description;
  if (row.estimate) {
    fields.timetracking = { originalEstimate: row.estimate, remainingEstimate: row.remaining || row.estimate };
    const seconds = parseTimeToSeconds(row.estimate);
    if (seconds) fields[CUSTOM_FIELDS.STORY_POINTS] = Math.round((seconds / 3600) * 10) / 10;
  }
  if (row.financialCategory) {
    fields[CUSTOM_FIELDS.FINANCIAL_CATEGORY] = { id: row.financialCategory, name: row.financialCategoryName };
  }
  if (row.assignee) {
    fields.assignee = { name: row.assignee };
  }

  // Epic link in fields (customfield_10000 = Epic Link)
  if (ctx.epicKey) {
    fields.customfield_10000 = ctx.epicKey;
  }

  // Deliverable Link = Story key - Story summary (set via PUT after creation)
  // Note: customfield_15401 is not on create screen, set separately
  const deliverableLink = `${ctx.key} - ${ctx.summary}`;

  // Build payload — link to Story only if not on Epic page
  const payload = { fields };
  if (!ctx.isEpicPage) {
    const linkType = await fetchLinkType();
    if (linkType) {
      payload.update = {
        issuelinks: [{
          add: {
            type: { name: linkType.name },
            inwardIssue: { key: ctx.key }
          }
        }]
      };
    }
  }

  console.log('JCP Bulk: Payload:', JSON.stringify(payload, null, 2));

  const r = await fetch('/rest/api/2/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    console.log('JCP Bulk: Error:', JSON.stringify(err, null, 2));

    // If epic link field rejected, retry without it and set via PUT
    if (err.errors?.customfield_10000 || err.errors?.customfield_10014) {
      delete fields.customfield_10000;
      delete fields.customfield_10014;
      const r2 = await fetch('/rest/api/2/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r2.ok) {
        const err2 = await r2.json().catch(() => ({}));
        throw new Error(err2.errors ? Object.values(err2.errors).join(', ') : err2.errorMessages?.join(', ') || `HTTP ${r2.status}`);
      }
      const created = await r2.json();
      // Set epic and deliverable link via PUT
      if (ctx.epicKey) {
        await fetch(`/rest/api/2/issue/${created.key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { customfield_10000: ctx.epicKey } })
        }).catch(() => {});
      }
      if (addToSprint && ctx.sprintId) await addToSprintAPI(created.key, ctx.sprintId);
      return created.key;
    }

    throw new Error(err.errors ? Object.values(err.errors).join(', ') : err.errorMessages?.join(', ') || `HTTP ${r.status}`);
  }

  const created = await r.json();
  console.log('JCP Bulk: Created', created.key, '→ Story:', ctx.key, '→ Epic:', ctx.epicKey);

  // Note: customfield_15401 (Deliverable Link) requires Jira admin to add it
  // to the Task edit screen before it can be set via API.

  // Add to sprint if selected on this row
  if (row.sprintId) await addToSprintAPI(created.key, row.sprintId);
  return created.key;
}

async function addToSprintAPI(taskKey, sprintId) {
  await fetch(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ issues: [taskKey] })
  }).catch(() => {});
}

// ============================================================================
// UI
// ============================================================================
const STYLES = `
#jcp-bulk-modal {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(9,30,66,0.54); z-index: 99999;
  display: flex; align-items: center; justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.jcp-bulk-dialog {
  background: #fff; border-radius: 8px; width: 95vw; max-width: 1400px; max-height: 90vh;
  box-shadow: 0 8px 32px rgba(0,0,0,0.25); display: flex; flex-direction: column;
}
.jcp-bulk-header {
  padding: 16px 20px; border-bottom: 1px solid #dfe1e6;
  display: flex; align-items: center; justify-content: space-between;
}
.jcp-bulk-header h2 { margin: 0; font-size: 16px; color: #172b4d; }
.jcp-bulk-close { background: none; border: none; font-size: 20px; cursor: pointer; color: #6b778c; padding: 4px 8px; }
.jcp-bulk-close:hover { color: #172b4d; }
.jcp-bulk-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
.jcp-bulk-meta { display: flex; gap: 12px; margin-bottom: 16px; font-size: 12px; color: #5e6c84; flex-wrap: wrap; }
.jcp-bulk-meta span { background: #f4f5f7; padding: 5px 12px; border-radius: 4px; line-height: 1.4; }
.jcp-bulk-meta strong { color: #172b4d; }
.jcp-bulk-row {
  display: grid; grid-template-columns: 3fr 3fr 100px 100px 160px 160px 160px 32px;
  gap: 10px; margin-bottom: 10px; align-items: start;
}
.jcp-bulk-row-header { font-size: 11px; font-weight: 600; color: #5e6c84; text-transform: uppercase; padding-bottom: 4px; border-bottom: 1px solid #dfe1e6; margin-bottom: 8px; }
.jcp-bulk-row input, .jcp-bulk-row textarea, .jcp-bulk-row select {
  width: 100%; padding: 8px 10px; border: 1px solid #dfe1e6; border-radius: 4px;
  font-size: 13px; color: #172b4d; box-sizing: border-box;
}
.jcp-bulk-row input:focus, .jcp-bulk-row textarea:focus, .jcp-bulk-row select:focus {
  outline: none; border-color: #0052cc;
}
.jcp-bulk-row textarea { resize: vertical; min-height: 36px; max-height: 120px; }
.jcp-bulk-remove { background: none; border: none; cursor: pointer; color: #de350b; font-size: 16px; padding: 6px; }
.jcp-bulk-remove:hover { background: #ffebe6; border-radius: 3px; }
.jcp-bulk-footer {
  padding: 12px 20px; border-top: 1px solid #dfe1e6;
  display: flex; align-items: center; justify-content: space-between;
}
.jcp-bulk-footer-left { display: flex; align-items: center; gap: 12px; }
.jcp-bulk-btn {
  padding: 8px 16px; border: none; border-radius: 4px; font-size: 13px;
  font-weight: 600; cursor: pointer; transition: background 0.2s;
}
.jcp-bulk-btn-primary { background: #0052cc; color: #fff; }
.jcp-bulk-btn-primary:hover { background: #0747a6; }
.jcp-bulk-btn-primary:disabled { background: #b3d4ff; cursor: not-allowed; }
.jcp-bulk-btn-secondary { background: #f4f5f7; color: #42526e; }
.jcp-bulk-btn-secondary:hover { background: #dfe1e6; }
.jcp-bulk-sprint-check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #172b4d; }
.jcp-bulk-sprint-check input { width: 14px; height: 14px; }
.jcp-bulk-status { font-size: 12px; padding: 8px 0; }
.jcp-bulk-status.success { color: #36b37e; }
.jcp-bulk-status.error { color: #de350b; }
.jcp-bulk-assignee-wrap { position: relative; }
.jcp-bulk-assignee-dropdown {
  position: absolute; top: 100%; left: 0; right: 0; max-height: 150px;
  overflow-y: auto; background: #fff; border: 1px solid #dfe1e6;
  border-radius: 3px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); z-index: 10;
}
.jcp-bulk-assignee-option {
  padding: 6px 8px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px;
}
.jcp-bulk-assignee-option:hover { background: #f4f5f7; }
.jcp-bulk-assignee-avatar { width: 20px; height: 20px; border-radius: 50%; }
.jcp-bulk-loading {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 20px; color: #5e6c84;
}
@keyframes jcp-spin { to { transform: rotate(360deg); } }
.jcp-bulk-spinner {
  width: 32px; height: 32px; border: 3px solid #dfe1e6; border-top-color: #0052cc;
  border-radius: 50%; animation: jcp-spin 0.8s linear infinite; margin-bottom: 12px;
}
`;

function injectStyles() {
  if (document.getElementById('jcp-bulk-styles')) return;
  const style = document.createElement('style');
  style.id = 'jcp-bulk-styles';
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function buildRow(index, members, finCategories, ctx, defaults = {}, sprints = []) {
  const fcDefault = defaults.financialCategory || ctx.financialCategory?.id || '';
  const assigneeDefault = defaults.assigneeDisplay || '';
  const assigneeValueDefault = defaults.assignee || '';
  const sprintDefault = defaults.sprintId || ctx.sprintId || '';
  const div = document.createElement('div');
  div.className = 'jcp-bulk-row';
  div.dataset.index = index;

  const sprintOptions = sprints.length
    ? `<select data-field="sprint">
        <option value="">-- No Sprint --</option>
        ${sprints.map(s => `<option value="${s.id}" ${s.id == sprintDefault ? 'selected' : ''}>${s.state === 'active' ? '🟢 ' : '🔵 '}${s.name}</option>`).join('')}
       </select>`
    : `<input type="text" placeholder="No sprint access" disabled style="background:#f4f5f7;color:#6b778c;cursor:not-allowed">`;

  div.innerHTML = `
    <input type="text" placeholder="Task title *" data-field="title" required>
    <textarea placeholder="Description (optional)" rows="1" data-field="description"></textarea>
    <input type="text" placeholder="e.g. 2h, 1d *" data-field="estimate" required>
    <input type="text" placeholder="Remaining *" data-field="remaining" required>
    <select data-field="financialCategory" required>
      <option value="">-- Financial Cat *--</option>
      ${finCategories.map(fc => `<option value="${fc.id}" ${fc.id == fcDefault ? 'selected' : ''}>${fc.value || fc.name}</option>`).join('')}
    </select>
    <div class="jcp-bulk-assignee-wrap">
      <input type="text" placeholder="Search assignee..." data-field="assigneeSearch" autocomplete="off" value="${assigneeDefault}">
      <input type="hidden" data-field="assignee" value="${assigneeValueDefault}">
    </div>
    ${sprintOptions}
    <button class="jcp-bulk-remove" title="Remove">×</button>
  `;

  const estInput = div.querySelector('[data-field="estimate"]');
  const remInput = div.querySelector('[data-field="remaining"]');
  estInput.addEventListener('input', () => {
    estInput.style.borderColor = '';
    if (!remInput.dataset.touched) remInput.value = estInput.value;
  });
  remInput.addEventListener('input', () => { remInput.style.borderColor = ''; remInput.dataset.touched = '1'; });

  // Clear error on input for all fields
  div.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', () => { el.style.borderColor = ''; });
    el.addEventListener('change', () => { el.style.borderColor = ''; });
  });

  const searchInput = div.querySelector('[data-field="assigneeSearch"]');
  const hiddenInput = div.querySelector('[data-field="assignee"]');
  const wrap = div.querySelector('.jcp-bulk-assignee-wrap');
  searchInput.addEventListener('focus', () => showAssigneeDropdown(wrap, searchInput, hiddenInput, members));
  searchInput.addEventListener('input', () => showAssigneeDropdown(wrap, searchInput, hiddenInput, members));

  div.querySelector('.jcp-bulk-remove').addEventListener('click', () => { div.remove(); });
  return div;
}

function showAssigneeDropdown(wrap, searchInput, hiddenInput, members) {
  let dropdown = wrap.querySelector('.jcp-bulk-assignee-dropdown');
  if (dropdown) dropdown.remove();

  const query = searchInput.value.toLowerCase();
  const filtered = members.filter(m => m.displayName?.toLowerCase().includes(query) || m.emailAddress?.toLowerCase().includes(query)).slice(0, 20);
  if (!filtered.length) return;

  dropdown = document.createElement('div');
  dropdown.className = 'jcp-bulk-assignee-dropdown';
  filtered.forEach(m => {
    const opt = document.createElement('div');
    opt.className = 'jcp-bulk-assignee-option';
    opt.innerHTML = `${m.avatarUrls?.['16x16'] ? `<img class="jcp-bulk-assignee-avatar" src="${m.avatarUrls['16x16']}">` : ''}<span>${m.displayName}</span>`;
    opt.addEventListener('mousedown', (e) => {
      e.preventDefault();
      searchInput.value = m.displayName;
      hiddenInput.value = m.name || m.accountId;
      dropdown.remove();
    });
    dropdown.appendChild(opt);
  });
  wrap.appendChild(dropdown);

  const close = (e) => { if (!wrap.contains(e.target)) { dropdown?.remove(); document.removeEventListener('mousedown', close); } };
  setTimeout(() => document.addEventListener('mousedown', close), 0);
}

function getRowData(row) {
  const fcSelect = row.querySelector('[data-field="financialCategory"]');
  const sprintEl = row.querySelector('[data-field="sprint"]');
  return {
    title: row.querySelector('[data-field="title"]').value.trim(),
    description: row.querySelector('[data-field="description"]').value.trim(),
    estimate: row.querySelector('[data-field="estimate"]').value.trim(),
    remaining: row.querySelector('[data-field="remaining"]').value.trim(),
    financialCategory: fcSelect.value,
    financialCategoryName: fcSelect.selectedOptions[0]?.textContent?.trim() || '',
    assignee: row.querySelector('[data-field="assignee"]').value,
    sprintId: sprintEl?.value || null,
  };
}

function markError(row, selector, title) {
  const el = row.querySelector(selector);
  if (el) { el.style.borderColor = '#de350b'; el.title = title; }
}

// ============================================================================
// CSV HELPERS
// ============================================================================
function downloadSampleCSV(finCategories, sprints) {
  const rows = [
    ['Title', 'Description', 'Estimate', 'Financial Category', 'Assignee', 'Sprint'],
    ['Implement login page', 'Create the login UI with validation', '4h', 'Build-CapEx', 'john.doe', ''],
    ['Write unit tests', 'Cover all edge cases for auth module', '2h', 'Testing-CapEx', 'jane.smith', ''],
  ];
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'jcp-tasks-template.csv';
  a.click();
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  // Parse header
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
  return lines.slice(1).map(line => {
    // Handle quoted fields with commas inside
    const values = [];
    let current = '', inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { values.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    values.push(current.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  }).filter(r => r.title || r['title']);
}

function importCSVRows(csvRows, members, finCategories, sprints, rowsContainer, selfDefaults) {
  // Clear existing rows
  rowsContainer.innerHTML = '';
  let imported = 0;
  csvRows.forEach((csvRow, i) => {
    const title = csvRow['title'] || '';
    if (!title) return;

    // Match financial category by name (case-insensitive)
    const fcName = (csvRow['financial category'] || '').toLowerCase();
    const fc = finCategories.find(f => (f.value || f.name || '').toLowerCase() === fcName);

    // Match assignee by displayName or username
    const assigneeName = csvRow['assignee'] || '';
    const member = members.find(m =>
      m.displayName?.toLowerCase() === assigneeName.toLowerCase() ||
      m.name?.toLowerCase() === assigneeName.toLowerCase() ||
      m.emailAddress?.toLowerCase() === assigneeName.toLowerCase()
    );

    // Match sprint by name (case-insensitive) — blank if not found
    const sprintName = (csvRow['sprint'] || '').toLowerCase();
    const sprint = sprints.find(s => s.name?.toLowerCase() === sprintName);

    const defaults = {
      financialCategory: fc?.id || selfDefaults.financialCategory,
      assignee: member?.name || member?.accountId || selfDefaults.assignee,
      assigneeDisplay: member ? member.displayName : selfDefaults.assigneeDisplay,
      sprintId: sprint?.id || '',
    };

    const row = buildRow(i, members, finCategories, storyContext, defaults, sprints);
    row.querySelector('[data-field="title"]').value = title;
    row.querySelector('[data-field="description"]').value = csvRow['description'] || '';
    const est = csvRow['estimate'] || '';
    row.querySelector('[data-field="estimate"]').value = est;
    row.querySelector('[data-field="remaining"]').value = est;
    if (est) row.querySelector('[data-field="remaining"]').dataset.touched = '1';
    rowsContainer.appendChild(row);
    imported++;
  });
  return imported;
}

function saveBoardPref(projectKey, boardId) {
  try { chrome.storage.local.set({ ['jcpBoardPref_' + projectKey]: boardId }); } catch {}
}

function loadBoardPref(projectKey) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(['jcpBoardPref_' + projectKey], r => {
        resolve(r['jcpBoardPref_' + projectKey] || null);
      });
    } catch { resolve(null); }
  });
}

export const BulkTaskCreator = {
  async open(issueKey, fields) {
    injectStyles();
    // Reset sprint cache on each open so permissions are re-checked
    cachedSprints = null;
    canManageSprints = false;

    const issueType = fields.issuetype?.name?.toLowerCase() || '';
    const isEpicPage = issueType.includes('epic');
    if (!issueType.includes('story') && !isEpicPage) return;

    // Show loading modal immediately
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'jcp-bulk-modal';
    modal.innerHTML = `
      <div class="jcp-bulk-dialog">
        <div class="jcp-bulk-header">
          <h2>➕ ${isEpicPage ? 'Add Tasks to Epic' : 'Bulk Create Tasks for'} ${issueKey}</h2>
          <button class="jcp-bulk-close">×</button>
        </div>
        <div class="jcp-bulk-body">
          <div class="jcp-bulk-loading">
            <div class="jcp-bulk-spinner"></div>
            <div style="font-size:13px">Loading story context, team members & fields...</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.jcp-bulk-close').addEventListener('click', () => this.close());
    modal.addEventListener('click', (e) => { if (e.target === modal) this.close(); });

    // Fetch all data in parallel
    storyContext = await fetchStoryContext(issueKey, fields, isEpicPage);
    const [members, finCategories, me, sprintData, boards] = await Promise.all([
      fetchProjectMembers(storyContext.project),
      fetchFinancialCategories(),
      fetchCurrentUser(),
      fetchSprintsAndPermission(storyContext.project, storyContext.key),
      fetchBoards(storyContext.project)
    ]);
    let sprints = sprintData.sprints;
    await fetchLinkType();
    const savedBoardId = await loadBoardPref(storyContext.project);

    // Default assignee = current user
    const selfDefaults = {
      assignee: me?.name || me?.accountId || '',
      assigneeDisplay: me?.displayName || '',
      financialCategory: storyContext.financialCategory?.id || ''
    };

    // Replace loading with actual form
    const body = modal.querySelector('.jcp-bulk-body');

    // Block if Epic or Program missing (skip for Epic pages)
    const missingEpic = !storyContext.isEpicPage && !storyContext.epicKey;
    const missingProgram = !storyContext.isEpicPage && !storyContext.programName;
    const blockErrors = [];
    if (missingEpic) blockErrors.push('⚠️ This Story has no <strong>Epic Link</strong>. Please link an Epic before creating Tasks.');
    if (missingProgram) blockErrors.push('⚠️ The linked Epic has no <strong>Program (Parent Link)</strong>. Please link a Program to the Epic before creating Tasks.');

    if (blockErrors.length) {
      body.innerHTML = `
        <div class="jcp-bulk-meta">
          <span>📋 Story: <strong>${issueKey}</strong></span>
          ${storyContext.epicKey ? `<span>🏷️ Epic: <strong>${storyContext.epicKey}</strong>${storyContext.epicName ? ` — ${storyContext.epicName}` : ''}</span>` : '<span>🏷️ Epic: <strong style="color:#de350b">Not linked</strong></span>'}
          ${storyContext.programName ? `<span>📁 Program: <strong>${storyContext.programName}</strong></span>` : '<span>📁 Program: <strong style="color:#de350b">Not linked</strong></span>'}
        </div>
        <div style="background:#ffebe6;border:1px solid #de350b;border-radius:6px;padding:16px;margin-top:8px">
          ${blockErrors.map(e => `<div style="font-size:13px;color:#de350b;margin-bottom:6px">${e}</div>`).join('')}
        </div>
      `;
      const dialog = modal.querySelector('.jcp-bulk-dialog');
      const footer = document.createElement('div');
      footer.className = 'jcp-bulk-footer';
      footer.innerHTML = `<div></div><button class="jcp-bulk-btn jcp-bulk-btn-secondary" id="jcp-bulk-cancel">Close</button>`;
      dialog.appendChild(footer);
      modal.querySelector('#jcp-bulk-cancel').addEventListener('click', () => this.close());
      return;
    }

    body.innerHTML = `
      <div class="jcp-bulk-meta">
        <span>📋 Story: <strong>${isEpicPage ? 'N/A' : issueKey}</strong></span>
        <span>🏷️ Epic: <strong>${storyContext.epicKey}</strong>${storyContext.epicName ? ` — ${storyContext.epicName}` : ''}</span>
        ${storyContext.programName ? `<span>📁 Program: <strong>${storyContext.programName}</strong></span>` : ''}
        ${storyContext.sprintName ? `<span>🏃 Sprint: <strong>${storyContext.sprintName}</strong></span>` : ''}
        ${canManageSprints && boards.length ? `
        <span style="display:flex;align-items:center;gap:6px">
          📌 Board:
          <select id="jcp-board-select" style="font-size:12px;padding:3px 6px;border:1px solid #dfe1e6;border-radius:4px;color:#172b4d">
            <option value="">-- Select Board --</option>
            ${boards.map(b => `<option value="${b.id}" ${b.id == savedBoardId ? 'selected' : ''}>${b.name}</option>`).join('')}
          </select>
        </span>` : ''}
      </div>
      <div class="jcp-bulk-row jcp-bulk-row-header">
        <span>Title *</span><span>Description *</span><span>Estimate *</span><span>Remaining *</span><span>Financial Cat. *</span><span>Assignee *</span>${canManageSprints && boards.length ? '<span>Sprint</span>' : ''}<span></span>
      </div>
      <div id="jcp-bulk-rows"></div>
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
        <button class="jcp-bulk-btn jcp-bulk-btn-secondary" id="jcp-bulk-add-row">+ Add Task</button>
        <button class="jcp-bulk-btn jcp-bulk-btn-secondary" id="jcp-bulk-import-csv" title="Import tasks from CSV">📥 Import CSV</button>
        <button class="jcp-bulk-btn jcp-bulk-btn-secondary" id="jcp-bulk-download-csv" title="Download sample CSV template">⬇️ Sample CSV</button>
        <input type="file" id="jcp-csv-file" accept=".csv" style="display:none">
      </div>
      <div class="jcp-bulk-status" id="jcp-bulk-status"></div>
    `;

    // Add footer
    const dialog = modal.querySelector('.jcp-bulk-dialog');
    const footer = document.createElement('div');
    footer.className = 'jcp-bulk-footer';
    footer.innerHTML = `
      <div class="jcp-bulk-footer-left">
        ${canManageSprints ? `<span style="font-size:12px;color:#5e6c84">🟢 Active &nbsp; 🔵 Future sprint</span>` : `<span style="font-size:12px;color:#6b778c">⚠️ No sprint permission</span>`}
      </div>
      <div style="display:flex;gap:8px">
        <button class="jcp-bulk-btn jcp-bulk-btn-secondary" id="jcp-bulk-cancel">Cancel</button>
        <button class="jcp-bulk-btn jcp-bulk-btn-primary" id="jcp-bulk-create">Create All</button>
      </div>
    `;
    dialog.appendChild(footer);

    const rowsContainer = modal.querySelector('#jcp-bulk-rows');
    rowsContainer.appendChild(buildRow(0, members, finCategories, storyContext, selfDefaults, sprints));

    // Board dropdown handler — reload sprints and rebuild rows
    const boardSelect = modal.querySelector('#jcp-board-select');
    if (boardSelect) {
      // Auto-load sprints for saved board preference
      if (savedBoardId && boardSelect.value == savedBoardId) {
        boardSelect.disabled = true;
        sprints = await fetchSprintsForBoard(savedBoardId);
        boardSelect.disabled = false;
        const existingRows = rowsContainer.querySelectorAll('.jcp-bulk-row');
        existingRows.forEach((row, i) => {
          const data = getRowData(row);
          const newRow = buildRow(i, members, finCategories, storyContext, {
            financialCategory: data.financialCategory,
            assignee: data.assignee,
            assigneeDisplay: row.querySelector('[data-field="assigneeSearch"]').value,
            sprintId: data.sprintId,
          }, sprints);
          newRow.querySelector('[data-field="title"]').value = data.title;
          newRow.querySelector('[data-field="description"]').value = data.description;
          newRow.querySelector('[data-field="estimate"]').value = data.estimate;
          newRow.querySelector('[data-field="remaining"]').value = data.remaining;
          row.replaceWith(newRow);
        });
      }
      boardSelect.addEventListener('change', async () => {
        const boardId = boardSelect.value;
        if (boardId) saveBoardPref(storyContext.project, boardId);
        if (!boardId) { sprints = []; }
        else {
          boardSelect.disabled = true;
          boardSelect.options[0].text = 'Loading sprints...';
          sprints = await fetchSprintsForBoard(boardId);
          boardSelect.disabled = false;
          boardSelect.options[0].text = '-- Select Board --';
          console.log('JCP Bulk: Sprints for board', boardId, ':', sprints.map(s => `${s.name} (${s.state})`));
        }
        // Rebuild all existing rows with new sprints
        const existingRows = rowsContainer.querySelectorAll('.jcp-bulk-row');
        existingRows.forEach((row, i) => {
          const data = getRowData(row);
          const newRow = buildRow(i, members, finCategories, storyContext, {
            financialCategory: data.financialCategory,
            assignee: data.assignee,
            assigneeDisplay: row.querySelector('[data-field="assigneeSearch"]').value,
            sprintId: data.sprintId,
          }, sprints);
          // Restore filled values
          newRow.querySelector('[data-field="title"]').value = data.title;
          newRow.querySelector('[data-field="description"]').value = data.description;
          newRow.querySelector('[data-field="estimate"]').value = data.estimate;
          newRow.querySelector('[data-field="remaining"]').value = data.remaining;
          row.replaceWith(newRow);
        });
        // Update header sprint column
        const header = modal.querySelector('.jcp-bulk-row-header');
        if (header) {
          const spans = header.querySelectorAll('span');
          const sprintSpan = spans[spans.length - 2];
          if (sprintSpan) sprintSpan.textContent = sprints.length ? 'Sprint' : '';
        }
      });
    }

    // CSV import/export handlers
    modal.querySelector('#jcp-bulk-download-csv')?.addEventListener('click', () => downloadSampleCSV(finCategories, sprints));
    modal.querySelector('#jcp-bulk-import-csv')?.addEventListener('click', () => modal.querySelector('#jcp-csv-file').click());
    modal.querySelector('#jcp-csv-file')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const csvRows = parseCSV(ev.target.result);
        const count = importCSVRows(csvRows, members, finCategories, sprints, rowsContainer, selfDefaults);
        const statusEl = modal.querySelector('#jcp-bulk-status');
        statusEl.className = count > 0 ? 'jcp-bulk-status success' : 'jcp-bulk-status error';
        statusEl.textContent = count > 0 ? `✓ Imported ${count} task${count > 1 ? 's' : ''} from CSV` : 'No valid rows found in CSV.';
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    modal.querySelector('#jcp-bulk-add-row').addEventListener('click', () => {
      const existingRows = rowsContainer.querySelectorAll('.jcp-bulk-row');
      const lastRow = existingRows[existingRows.length - 1];
      const copyDefaults = lastRow ? {
        financialCategory: lastRow.querySelector('[data-field="financialCategory"]').value,
        assignee: lastRow.querySelector('[data-field="assignee"]').value,
        assigneeDisplay: lastRow.querySelector('[data-field="assigneeSearch"]').value,
        sprintId: lastRow.querySelector('[data-field="sprint"]')?.value || '',
      } : selfDefaults;
      rowsContainer.appendChild(buildRow(existingRows.length, members, finCategories, storyContext, copyDefaults, sprints));
    });
    modal.querySelector('#jcp-bulk-cancel').addEventListener('click', () => this.close());
    modal.querySelector('#jcp-bulk-create').addEventListener('click', () => this._createAll(rowsContainer));
  },

  async _createAll(rowsContainer) {
    const rows = rowsContainer.querySelectorAll('.jcp-bulk-row');
    const statusEl = modal.querySelector('#jcp-bulk-status');
    const createBtn = modal.querySelector('#jcp-bulk-create');

    const tasks = [];
    const validationErrors = [];
    for (const row of rows) {
      const data = getRowData(row);
      if (!data.title) { markError(row, '[data-field="title"]', 'Title is required'); validationErrors.push('Title missing'); continue; }
if (!data.estimate) { markError(row, '[data-field="estimate"]', 'Estimate is required'); validationErrors.push('Estimate missing'); continue; }
      if (!data.remaining) { markError(row, '[data-field="remaining"]', 'Remaining is required'); validationErrors.push('Remaining missing'); continue; }
      if (!data.financialCategory) { markError(row, '[data-field="financialCategory"]', 'Financial Category is required'); validationErrors.push('Financial Category missing'); continue; }
      if (!data.assignee) { markError(row, '[data-field="assigneeSearch"]', 'Assignee is required'); validationErrors.push('Assignee missing'); continue; }
      tasks.push({ data, row });
    }

    if (validationErrors.length) {
      statusEl.className = 'jcp-bulk-status error';
      statusEl.textContent = 'Please fill all required fields (highlighted in red).';
      return;
    }

    if (!tasks.length) {
      statusEl.className = 'jcp-bulk-status error';
      statusEl.textContent = 'Please add at least one task with a title.';
      return;
    }

    createBtn.disabled = true;
    createBtn.textContent = 'Creating...';
    statusEl.className = 'jcp-bulk-status';
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
        titleInput.value = `✓ ${taskKey} - ${data.title}`;
        titleInput.style.color = '#36b37e';
      } catch (e) {
        errors.push(`${data.title}: ${e.message}`);
        row.querySelector('[data-field="title"]').style.borderColor = '#de350b';
      }
    }

    createBtn.disabled = false;
    createBtn.textContent = 'Create All';

    if (errors.length) {
      statusEl.className = 'jcp-bulk-status error';
      statusEl.textContent = `Created ${created}/${tasks.length}. Errors: ${errors.join('; ')}`;
    } else {
      statusEl.className = 'jcp-bulk-status success';
      statusEl.textContent = storyContext.isEpicPage ? `✓ All ${created} tasks created under Epic ${storyContext.key}!` : `✓ All ${created} tasks created and linked to ${storyContext.key}!`;
      setTimeout(() => this.close(), 2000);
    }
  },

  close() {
    if (modal) { modal.remove(); modal = null; }
  },

  addButton(issueKey, fields) {
    const issueType = fields.issuetype?.name?.toLowerCase() || '';
    document.getElementById('jcp-bulk-btn-wrap')?.remove();
    if (!issueType.includes('story') && !issueType.includes('epic')) return;
    if (issueType.includes('sub')) return;

    const toolbar = document.querySelector('.aui-toolbar2-secondary');
    if (!toolbar) return;

    const wrap = document.createElement('div');
    wrap.id = 'jcp-bulk-btn-wrap';
    wrap.className = 'aui-buttons';
    wrap.style.marginRight = '8px';
    wrap.innerHTML = `<button class="aui-button" id="jcp-bulk-trigger" style="background:#f4f5f7;color:#42526e;font-size:14px;font-weight:500">➕ Add Tasks</button>`;
    toolbar.insertBefore(wrap, toolbar.firstChild);

    wrap.querySelector('#jcp-bulk-trigger').addEventListener('click', () => this.open(issueKey, fields));
  }
};
