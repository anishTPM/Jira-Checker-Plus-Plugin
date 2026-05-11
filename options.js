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
    document.getElementById('desc-subtask').checked = settings.descSubtask;
    document.getElementById('desc-epic').checked = settings.descEpic;
    document.getElementById('desc-task').checked = settings.descTask;
    document.getElementById('assignee-epic').checked = settings.assigneeEpic;
    document.getElementById('priority-epic').checked = settings.priorityEpic;
    document.getElementById('weekly-hours').value = settings.weeklyHours;
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
    descSubtask: document.getElementById('desc-subtask').checked,
    descEpic: document.getElementById('desc-epic').checked,
    descTask: document.getElementById('desc-task').checked,
    assigneeEpic: document.getElementById('assignee-epic').checked,
    priorityEpic: document.getElementById('priority-epic').checked,
    weeklyHours: parseInt(document.getElementById('weekly-hours').value) || 40,
    timelogMessage: document.getElementById('timelog-message').value || DEFAULT_SETTINGS.timelogMessage,
    timesheetMessage: document.getElementById('timesheet-message').value || DEFAULT_SETTINGS.timesheetMessage
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

loadSettings();
