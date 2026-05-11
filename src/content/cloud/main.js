import { StorageService } from '../../shared/storage.js';
import { CloudJiraAPI } from './services/jira-api.js';
import { CloudValidationEngine } from './validators/engine.js';
import { CloudMetricsTracker } from './services/metrics.js';
import { CloudTempoManager } from './services/tempo.js';
import { CloudUIManager } from './services/ui.js';
import { CloudBulkTaskCreator } from './services/bulk-task-creator.js';
import { CloudTempoGuard } from './services/tempo-guard.js';

(function () {
  'use strict';

  let currentIssueKey = null;
  let settings = {};

  async function run() {
    const issueKey = CloudJiraAPI.getIssueKeyFromURL();
    if (!issueKey) return;

    if (currentIssueKey !== issueKey) CloudUIManager.closePanel();
    currentIssueKey = issueKey;

    try {
      StorageService.setLocal({ jcpJiraBaseUrl: window.location.origin });
      const user = await CloudJiraAPI.getCurrentUser();
      if (user) StorageService.setLocal({
        jcpCurrentUser: {
          accountId: user.accountId,
          displayName: user.displayName,
          emailAddress: user.emailAddress,
          jiraBaseUrl: window.location.origin
        }
      });
    } catch {}

    const apiData = await CloudJiraAPI.getIssue(issueKey);
    if (!apiData) return;

    const issues = await CloudValidationEngine.validate(apiData, issueKey, settings);
    try { await CloudMetricsTracker.track(issueKey, issues, apiData.fields); } catch {}

    CloudUIManager.createButton(issues, () => { run(); CloudUIManager.notify('Rescanning...'); });
    if (issues.length > 0) CloudUIManager.highlightFields(issues);

    if (settings.workflow === 'new') {
      CloudBulkTaskCreator.addButton(issueKey, apiData.fields);
    } else {
      document.getElementById('jcp-cloud-bulk-btn-wrap')?.remove();
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
        const key = CloudJiraAPI.getIssueKeyFromURL();
        if (key && (key !== currentIssueKey || Date.now() - lastRun > MIN_INTERVAL)) throttledRun();
      }, 1500);
    }).observe(document.body, { childList: true, subtree: false });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        setTimeout(throttledRun, 1000);
        CloudTempoManager.check(settings);
      }
    });
  }

  async function init() {
    settings = await StorageService.loadSettings();

    // If on Tempo page, only run TempoGuard
    if (window.location.href.includes('/Tempo') || window.location.href.includes('io.tempo.jira')) {
      CloudTempoGuard.init();
      return;
    }

    const waitFor = (sel, ms = 5000) => new Promise(r => {
      if (document.querySelector(sel)) return r();
      const obs = new MutationObserver(() => { if (document.querySelector(sel)) { obs.disconnect(); r(); } });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); r(); }, ms);
    });

    // Cloud: wait for issue view to load
    await waitFor('[data-testid="issue.views.issue-base.foundation.summary.heading"], [data-testid="issue-view-foundation.ui.header"]', 8000);
    await run();
    setupObserver();
    await CloudTempoManager.check(settings);
    CloudTempoGuard.init();
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
