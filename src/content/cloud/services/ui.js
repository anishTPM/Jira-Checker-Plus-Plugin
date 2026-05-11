let validationButton = null;
let validationPanel = null;
let isPanelOpen = false;

export const CloudUIManager = {
  createButton(issues, onRescan) {
    if (validationButton) validationButton.remove();

    // Cloud Jira: find toolbar area — try multiple selectors
    const toolbar = document.querySelector('[data-testid="issue.views.issue-base.foundation.breadcrumbs.breadcrumb-current-issue-container"]')?.parentElement
      || document.querySelector('[data-testid="issue-view-foundation.ui.header"]')
      || document.querySelector('#jira-issue-header')
      || document.querySelector('[data-testid="issue.views.issue-base.foundation.summary.heading"]')?.parentElement;

    if (!toolbar) {
      // Fallback: inject floating button
      this._createFloatingButton(issues, onRescan);
      return;
    }

    validationButton = document.createElement('div');
    validationButton.id = 'jcp-cloud-btn-wrap';
    validationButton.style.cssText = 'display:inline-flex;align-items:center;margin-left:8px;';

    const hasErrors = issues.length > 0;
    const cls = hasErrors ? 'jcp-btn-error' : 'jcp-btn-success';
    const icon = hasErrors ? '\u26a0\ufe0f' : '\u2713';
    const text = hasErrors ? `${issues.length}` : 'JCP: OK';

    validationButton.innerHTML = `<button class="jcp-cloud-btn ${cls}" id="jcp-toolbar-btn"><span class="jcp-btn-icon">${icon}</span><span class="jcp-btn-text">${text}</span></button>`;
    toolbar.appendChild(validationButton);

    validationButton.querySelector('#jcp-toolbar-btn').addEventListener('click', () => {
      hasErrors ? this.togglePanel(issues) : onRescan();
    });
  },

  _createFloatingButton(issues, onRescan) {
    validationButton = document.createElement('div');
    validationButton.id = 'jcp-cloud-btn-wrap';
    validationButton.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9999;';

    const hasErrors = issues.length > 0;
    const cls = hasErrors ? 'jcp-btn-error' : 'jcp-btn-success';
    const icon = hasErrors ? '\u26a0\ufe0f' : '\u2713';
    const text = hasErrors ? `${issues.length}` : 'JCP: OK';

    validationButton.innerHTML = `<button class="jcp-cloud-btn ${cls}" id="jcp-toolbar-btn"><span class="jcp-btn-icon">${icon}</span><span class="jcp-btn-text">${text}</span></button>`;
    document.body.appendChild(validationButton);

    validationButton.querySelector('#jcp-toolbar-btn').addEventListener('click', () => {
      hasErrors ? this.togglePanel(issues) : onRescan();
    });
  },

  togglePanel(issues) {
    isPanelOpen ? this.closePanel() : this.openPanel(issues);
  },

  openPanel(issues) {
    this.closePanel();
    validationPanel = document.createElement('div');
    validationPanel.id = 'jira-checker-panel';
    validationPanel.innerHTML = `
      <div class="jcp-header">
        <span class="jcp-icon">\u26a0\ufe0f</span>
        <span class="jcp-title">Jira Checker Plus: Validation (${issues.length})</span>
        <button class="jcp-close">\u00d7</button>
      </div>
      <ul class="jcp-list">${issues.map(i => `<li class="jcp-item">\ud83d\udea9 ${i}</li>`).join('')}</ul>`;
    document.body.appendChild(validationPanel);
    isPanelOpen = true;
    validationPanel.querySelector('.jcp-close').addEventListener('click', e => { e.stopPropagation(); this.closePanel(); });
    validationPanel.addEventListener('click', e => e.stopPropagation());
  },

  closePanel() {
    if (validationPanel) { validationPanel.remove(); validationPanel = null; }
    isPanelOpen = false;
  },

  highlightFields(issues) {
    // Cloud Jira uses data-testid attributes
    const map = {
      'Description is missing': '[data-testid="issue.views.field.rich-text.description"]',
      'Assignee not assigned': '[data-testid="issue.views.field.assignee"]',
      'Priority not set': '[data-testid="issue.views.field.priority"]'
    };
    Object.entries(map).forEach(([rule, sel]) => {
      if (issues.some(i => i.includes(rule))) document.querySelector(sel)?.classList.add('jcp-highlight');
    });
  },

  notify(message) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:60px;right:20px;background:#0052cc;color:#fff;padding:12px 20px;border-radius:4px;z-index:10000;box-shadow:0 2px 8px rgba(0,0,0,0.2);max-width:300px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }
};
