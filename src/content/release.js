import { StorageService } from '../shared/storage.js';
import { JiraAPI } from './services/jira-api.js';
import { ValidationEngine } from './validators/engine.js';

(function () {
  'use strict';

  let validationButton = null;
  let validationPanel = null;
  let isPanelOpen = false;

  const UI = {
    createButton(issues) {
      if (validationButton) validationButton.remove();
      const header = document.querySelector('.aui-page-header-actions');
      if (!header) return;

      validationButton = document.createElement('div');
      validationButton.className = 'aui-buttons';
      validationButton.style.marginRight = '8px';

      const hasErrors = issues.length > 0;
      const cls = hasErrors ? 'jcp-btn-error' : 'jcp-btn-success';
      validationButton.innerHTML = `<button class="aui-button ${cls}" id="jcp-release-btn"><span class="jcp-btn-icon">${hasErrors ? '\u26a0\ufe0f' : '\u2713'}</span><span class="jcp-btn-text">${hasErrors ? issues.length : 'JCP: OK'}</span></button>`;
      header.insertBefore(validationButton, header.firstChild);
      validationButton.querySelector('#jcp-release-btn').addEventListener('click', () => hasErrors && this.togglePanel(issues));
    },

    togglePanel(issues) { isPanelOpen ? this.closePanel() : this.openPanel(issues); },

    openPanel(issues) {
      this.closePanel();
      validationPanel = document.createElement('div');
      validationPanel.id = 'jira-checker-panel';
      validationPanel.innerHTML = `<div class="jcp-header"><span class="jcp-icon">\u26a0\ufe0f</span><span class="jcp-title">Release Validation Issues (${issues.length})</span><button class="jcp-close">\u00d7</button></div><ul class="jcp-list">${issues.map(i => `<li class="jcp-item">\ud83d\udea9 ${i}</li>`).join('')}</ul>`;
      document.body.appendChild(validationPanel);
      isPanelOpen = true;
      validationPanel.querySelector('.jcp-close').addEventListener('click', () => this.closePanel());
    },

    closePanel() {
      if (validationPanel) { validationPanel.remove(); validationPanel = null; }
      isPanelOpen = false;
    }
  };

  async function init() {
    const settings = await StorageService.loadSettings();
    const waitFor = (sel, ms = 5000) => new Promise(r => {
      if (document.querySelector(sel)) return r();
      const obs = new MutationObserver(() => { if (document.querySelector(sel)) { obs.disconnect(); r(); } });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); r(); }, ms);
    });

    await waitFor('.aui-page-header-actions');
    const versionId = JiraAPI.getVersionIdFromURL();
    if (!versionId) return;
    const issues = await ValidationEngine.validateRelease(versionId, settings);
    UI.createButton(issues);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
