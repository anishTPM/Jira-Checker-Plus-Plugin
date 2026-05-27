const DEFAULT_SETTINGS = {
  jiraHosting: 'cloud',
  workflow: 'new',
  tempoGuardEnabled: false,
  descSubtask: false,
  descEpic: false,
  descTask: false,
  assigneeEpic: false,
  priorityEpic: false,
  weeklyHours: 40,
  tempoToken: '',
  timelogMessage: 'Please log your hours for this week!',
  timesheetMessage: 'Please submit your timesheet for this month!'
};

function loadSettings() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    document.getElementById('hosting-cloud').checked = settings.jiraHosting === 'cloud';
    document.getElementById('hosting-onprem').checked = settings.jiraHosting === 'onprem';
    highlightHosting(settings.jiraHosting || 'cloud');
    
    document.getElementById('workflow-standard').checked = settings.workflow !== 'new';
    document.getElementById('workflow-new').checked = settings.workflow === 'new';
    highlightWorkflow(settings.workflow || 'new');
    
    document.getElementById('tempo-guard-enabled').checked = settings.tempoGuardEnabled || false;
    document.getElementById('tempo-token').value = settings.tempoToken || '';
    document.getElementById('desc-subtask').checked = settings.descSubtask;
    document.getElementById('desc-epic').checked = settings.descEpic;
    document.getElementById('desc-task').checked = settings.descTask;
    document.getElementById('assignee-epic').checked = settings.assigneeEpic;
    document.getElementById('priority-epic').checked = settings.priorityEpic;
    document.getElementById('weekly-hours').value = settings.weeklyHours;
    document.getElementById('tempo-token').value = settings.tempoToken || '';
    document.getElementById('timelog-message').value = settings.timelogMessage;
    document.getElementById('timesheet-message').value = settings.timesheetMessage;
  });
}

function saveSettings() {
  const jiraHosting = document.querySelector('input[name="jiraHosting"]:checked')?.value || 'cloud';
  const workflow = document.querySelector('input[name="workflow"]:checked')?.value || 'new';
  const newSettings = {
    jiraHosting,
    workflow,
    tempoGuardEnabled: document.getElementById('tempo-guard-enabled').checked,
    tempoToken: document.getElementById('tempo-token').value.trim(),
    descSubtask: document.getElementById('desc-subtask').checked,
    descEpic: document.getElementById('desc-epic').checked,
    descTask: document.getElementById('desc-task').checked,
    assigneeEpic: document.getElementById('assignee-epic').checked,
    priorityEpic: document.getElementById('priority-epic').checked,
    weeklyHours: parseInt(document.getElementById('weekly-hours').value) || 40,
    timelogMessage: document.getElementById('timelog-message').value || DEFAULT_SETTINGS.timelogMessage,
    timesheetMessage: document.getElementById('timesheet-message').value || DEFAULT_SETTINGS.timesheetMessage,
    confluenceBaseUrl: document.getElementById('confluence-base-url')?.value.trim() || ''
  };

  chrome.storage.sync.set(newSettings, () => {
    showStatus('Settings saved successfully!');
  });
}

function resetSettings() {
  chrome.storage.sync.set(DEFAULT_SETTINGS, () => {
    loadSettings();
    showStatus('Settings reset to defaults!');
  });
}

function showStatus(message) {
  const statusMsg = document.getElementById('status-msg');
  statusMsg.textContent = message;
  statusMsg.className = 'status-msg success show';
  
  setTimeout(() => {
    statusMsg.classList.remove('show');
  }, 3000);
}

function highlightHosting(value) {
  document.getElementById('hosting-cloud-label').style.borderColor = value === 'cloud' ? '#0052cc' : '#dfe1e6';
  document.getElementById('hosting-onprem-label').style.borderColor = value === 'onprem' ? '#0052cc' : '#dfe1e6';
}

function highlightWorkflow(value) {
  document.getElementById('workflow-standard-label').style.borderColor = value !== 'new' ? '#0052cc' : '#dfe1e6';
  document.getElementById('workflow-new-label').style.borderColor = value === 'new' ? '#0052cc' : '#dfe1e6';
}

// Render integrations section based on org config
function renderIntegrations() {
  const cfg = window.JCP_ORG_CONFIG || { locked: false, confluenceBaseUrl: '', pages: [] };
  const container = document.getElementById('integrations-content');
  if (!container) return;

  let html = '';

  if (cfg.locked) {
    // Org-managed: show read-only values
    html += '<p class="note" style="color:#36b37e;font-weight:600;">\u2713 Configured by your organisation \u2014 read only.</p>';
    if (cfg.confluenceBaseUrl) {
      html += `<label class="input-label"><span>Confluence Base URL</span><input type="text" value="${cfg.confluenceBaseUrl}" disabled style="background:#f4f5f7;color:#5e6c84;"></label>`;
    }
    if (cfg.pages && cfg.pages.length) {
      html += '<h3 style="margin-top:16px;color:#0052cc;">Configured Pages</h3>';
      cfg.pages.forEach(p => {
        html += `<label class="input-label"><span>${p.label}</span><div style="display:flex;gap:8px;align-items:center;"><input type="text" value="${p.url}" disabled style="flex:1;background:#f4f5f7;color:#5e6c84;"><a href="${p.url}" target="_blank" class="btn-secondary" style="white-space:nowrap;padding:8px 12px;text-decoration:none;">Open \u2197</a></div></label>`;
      });
    }
  } else {
    // Public/self-configured: show editable fields
    html += '<label class="input-label"><span>Confluence Base URL</span><input type="text" id="confluence-base-url" placeholder="https://yourorg.atlassian.net/wiki"></label>';
    html += '<p class="note">Add your Confluence base URL to enable Confluence integrations.</p>';
  }

  container.innerHTML = html;

  // Load saved confluence URL for non-locked mode
  if (!cfg.locked) {
    chrome.storage.sync.get({ confluenceBaseUrl: '' }, s => {
      const el = document.getElementById('confluence-base-url');
      if (el) el.value = s.confluenceBaseUrl || '';
    });
  }
}

document.getElementById('save-btn').addEventListener('click', saveSettings);
document.getElementById('reset-btn').addEventListener('click', resetSettings);

document.querySelectorAll('input[name="jiraHosting"]').forEach(radio => {
  radio.addEventListener('change', () => highlightHosting(radio.value));
});

document.querySelectorAll('input[name="workflow"]').forEach(radio => {
  radio.addEventListener('change', () => highlightWorkflow(radio.value));
});

document.querySelectorAll('.nav-item').forEach(item => {
  if (!item.classList.contains('analytics-link')) {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = e.target.dataset.section;
      document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
      e.target.classList.add('active');
      document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
      document.getElementById(section + '-section').classList.add('active');
    });
  }
});

document.getElementById('check-tempo-hours')?.addEventListener('click', async () => {
  const token = document.getElementById('tempo-token').value.trim();
  const statusEl = document.getElementById('tempo-token-status');
  if (!token) { statusEl.style.color = '#de350b'; statusEl.textContent = 'Please enter a token first.'; return; }
  statusEl.style.color = '#5e6c84'; statusEl.textContent = 'Validating...';
  try {
    const today = new Date().toISOString().split('T')[0];
    // Try to get token info including expiry
    const worklogR = await fetch('https://api.tempo.io/4/worklogs?from=' + today + '&to=' + today + '&limit=1', { headers: { Authorization: 'Bearer ' + token } });
    if (worklogR.ok) {
      statusEl.style.color = '#36b37e';
      statusEl.textContent = '\u2713 Token is valid!';
    } else {
      statusEl.style.color = '#de350b';
      statusEl.textContent = '\u2717 Invalid token (' + worklogR.status + '). Please check and try again.';
    }
  } catch(e) { statusEl.style.color = '#de350b'; statusEl.textContent = '\u2717 Error: ' + e.message; }
});

loadSettings();
renderIntegrations();
