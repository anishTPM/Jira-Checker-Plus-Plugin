// Default settings
const DEFAULT_SETTINGS = {
  workflow: 'new',
  descSubtask: false,
  descEpic: false,
  descTask: true,
  assigneeEpic: false,
  priorityEpic: false,
  weeklyHours: 40,
  timelogMessage: 'Please log your hours for this week!',
  timesheetMessage: 'Please submit your timesheet for this month!'
};

// Load settings
function loadSettings() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    document.getElementById('workflow-standard').checked = settings.workflow !== 'new';
    document.getElementById('workflow-new').checked = settings.workflow === 'new';
    highlightWorkflow(settings.workflow || 'standard');
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

// Save settings
function saveSettings() {
  const workflow = document.querySelector('input[name="workflow"]:checked')?.value || 'standard';
  const newSettings = {
    workflow,
    descSubtask: document.getElementById('desc-subtask').checked,
    descEpic: document.getElementById('desc-epic').checked,
    descTask: document.getElementById('desc-task').checked,
    assigneeEpic: document.getElementById('assignee-epic').checked,
    priorityEpic: document.getElementById('priority-epic').checked,
    weeklyHours: parseInt(document.getElementById('weekly-hours').value) || 40,
    timelogMessage: document.getElementById('timelog-message').value || DEFAULT_SETTINGS.timelogMessage,
    timesheetMessage: document.getElementById('timesheet-message').value || DEFAULT_SETTINGS.timesheetMessage
  };

  chrome.storage.sync.get(DEFAULT_SETTINGS, (oldSettings) => {
    const changes = [];
    if (oldSettings.descSubtask !== newSettings.descSubtask) changes.push('Sub-task description');
    if (oldSettings.descEpic !== newSettings.descEpic) changes.push('Epic description');
    if (oldSettings.descTask !== newSettings.descTask) changes.push('Task description');
    if (oldSettings.assigneeEpic !== newSettings.assigneeEpic) changes.push('Epic assignee');
    if (oldSettings.priorityEpic !== newSettings.priorityEpic) changes.push('Epic priority');
    if (oldSettings.weeklyHours !== newSettings.weeklyHours) changes.push('Weekly hours');
    
    chrome.storage.sync.set(newSettings, () => {
      showStatus('Settings saved successfully!');
    });
  });
}

// Reset to defaults
function resetSettings() {
  chrome.storage.sync.set(DEFAULT_SETTINGS, () => {
    loadSettings();
    showStatus('Settings reset to defaults!');
  });
}

// Show status message
function showStatus(message) {
  const statusMsg = document.getElementById('status-msg');
  statusMsg.textContent = message;
  statusMsg.className = 'status-msg success show';
  
  setTimeout(() => {
    statusMsg.classList.remove('show');
  }, 3000);
}

function highlightWorkflow(value) {
  document.getElementById('workflow-standard-label').style.borderColor = value !== 'new' ? '#0052cc' : '#dfe1e6';
  document.getElementById('workflow-new-label').style.borderColor = value === 'new' ? '#0052cc' : '#dfe1e6';
}

// Event listeners
document.getElementById('save-btn').addEventListener('click', saveSettings);
document.getElementById('reset-btn').addEventListener('click', resetSettings);

document.querySelectorAll('input[name="workflow"]').forEach(radio => {
  radio.addEventListener('change', () => highlightWorkflow(radio.value));
});

// Sidebar navigation
document.querySelectorAll('.nav-item').forEach(item => {
  if (!item.classList.contains('analytics-link')) {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = e.target.dataset.section;
      
      // Update active nav item
      document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
      e.target.classList.add('active');
      
      // Show corresponding section
      document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
      document.getElementById(section + '-section').classList.add('active');
    });
  }
});

// Load settings on page load
loadSettings();
