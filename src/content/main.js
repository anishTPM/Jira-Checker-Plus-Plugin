import { StorageService } from '../shared/storage.js';
import { JiraAPI } from './services/jira-api.js';
import { ValidationEngine } from './validators/engine.js';
import { MetricsTracker } from './services/metrics.js';
import { TempoManager } from './services/tempo.js';
import { UIManager } from './services/ui.js';
import { BulkTaskCreator } from './services/bulk-task-creator.js';

(function () {
  'use strict';

  let currentIssueKey = null;
  let settings = {};

  async function run() {
    const issueKey = JiraAPI.getIssueKeyFromURL();
    if (!issueKey) return;

    if (currentIssueKey !== issueKey) UIManager.closePanel();
    currentIssueKey = issueKey;

    // Cache user for analytics
    try {
      StorageService.setLocal({ jcpJiraBaseUrl: window.location.origin });
      const user = await JiraAPI.getCurrentUser();
      if (user) StorageService.setLocal({
        jcpCurrentUser: {
          accountId: user.accountId,
          displayName: user.displayName,
          emailAddress: user.emailAddress || user.name,
          jiraBaseUrl: window.location.origin
        }
      });
    } catch {}

    const apiData = await JiraAPI.getIssue(issueKey);
    if (!apiData) return;

    const issues = await ValidationEngine.validate(apiData, issueKey, settings);
    try { await MetricsTracker.track(issueKey, issues, apiData.fields); } catch {}

    UIManager.createButton(issues, () => { run(); UIManager.notify('Rescanning...'); });
    if (issues.length > 0) UIManager.highlightFields(issues);

    // Show bulk task button only for New Workflow (Story -> Tasks)
    if (settings.workflow === 'new') {
      BulkTaskCreator.addButton(issueKey, apiData.fields);
    } else {
      document.getElementById('jcp-bulk-btn-wrap')?.remove();
    }
  }

  function setupObserver() {
    let debounce, lastRun = 0;
    const MIN_INTERVAL = 2000;

    const throttledRun = () => {
      const now = Date.now();
      if (now - lastRun < MIN_INTERVAL) return;
      lastRun = now;
      run();
    };

    new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const key = JiraAPI.getIssueKeyFromURL();
        if (key && (key !== currentIssueKey || Date.now() - lastRun > MIN_INTERVAL)) throttledRun();
      }, 1500);
    }).observe(document.body, { childList: true, subtree: false });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        setTimeout(throttledRun, 1000);
        TempoManager.check(settings);
      }
    });
  }

  async function init() {
    settings = await StorageService.loadSettings();

    // If on Tempo page, skip
    if (window.location.href.includes('/Tempo') || window.location.href.includes('io.tempo.jira')) {
      return;
    }

    const waitFor = (sel, ms = 5000) => new Promise(r => {
      if (document.querySelector(sel)) return r();
      const obs = new MutationObserver(() => { if (document.querySelector(sel)) { obs.disconnect(); r(); } });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); r(); }, ms);
    });

    await waitFor('.aui-toolbar2-secondary');
    await run();
    setupObserver();
    await TempoManager.check(settings);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
