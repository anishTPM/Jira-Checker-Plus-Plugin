import { CLOUD_API_FIELDS } from '../../../shared/constants.js';

export const CloudJiraAPI = {
  async getIssue(issueKey) {
    try {
      const r = await fetch(`/rest/api/3/issue/${issueKey}?fields=${CLOUD_API_FIELDS}`);
      return r.ok ? r.json() : null;
    } catch { return null; }
  },

  async search(jql, fields = CLOUD_API_FIELDS, maxResults = 1000) {
    try {
      const r = await fetch(`/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=${maxResults}`);
      if (!r.ok) return [];
      return (await r.json()).issues || [];
    } catch { return []; }
  },

  getSubtasks: (parentKey) => CloudJiraAPI.search(`parent=${parentKey}`),
  getLinkedBugs: (issueKey) => CloudJiraAPI.search(`issue in linkedIssues(${issueKey}) AND type=Bug`, 'status'),
  getEpicStories: (epicKey) => CloudJiraAPI.search(`parent=${epicKey} OR "Epic Link"=${epicKey}`),
  getVersionIssues: (versionId) => CloudJiraAPI.search(`fixVersion=${versionId}`),

  getIssueKeyFromURL() {
    // Cloud URLs: /browse/KEY-123, /jira/software/projects/PROJ/boards/X?selectedIssue=KEY-123
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    // Check selectedIssue query param first (board/backlog views)
    const selected = params.get('selectedIssue');
    if (selected && /^[A-Z]+-\d+$/.test(selected)) return selected;

    // Check URL path
    const m = path.match(/([A-Z][A-Z0-9]+-\d+)/);
    return m ? m[1] : null;
  },

  getVersionIdFromURL() {
    const m = window.location.pathname.match(/versions\/([\d]+)/);
    return m ? m[1] : null;
  },

  async getCurrentUser() {
    try {
      const r = await fetch('/rest/api/3/myself');
      return r.ok ? r.json() : null;
    } catch { return null; }
  },

  async getTempoWeeklyHours(accountId) {
    try {
      const now = new Date();
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      monday.setHours(0, 0, 0, 0);
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);

      const from = monday.toISOString().split('T')[0];
      const to = friday.toISOString().split('T')[0];

      // Tempo Cloud API
      let url = `/rest/tempo-timesheets/4/worklogs?dateFrom=${from}&dateTo=${to}`;
      if (accountId) url += `&worker=${encodeURIComponent(accountId)}`;

      const r = await fetch(url);
      if (!r.ok) return 0;
      const data = await r.json();
      const results = data.results || data;
      return (Array.isArray(results) ? results : []).reduce((sum, log) => sum + (log.timeSpentSeconds || 0), 0) / 3600;
    } catch { return 0; }
  },

  async isTimesheetSubmitted() {
    try {
      const now = new Date();
      const r = await fetch(`/rest/tempo-timesheets/4/timesheet-approval/current-user/${now.getFullYear()}/${now.getMonth() + 1}`);
      if (!r.ok) return false;
      const data = await r.json();
      return data.status === 'APPROVED' || data.status === 'SUBMITTED';
    } catch { return false; }
  },

  async getBoards(projectKey) {
    try {
      const r = await fetch(`/rest/agile/1.0/board?projectKeyOrId=${projectKey}`);
      if (!r.ok) return [];
      const data = await r.json();
      return data.values || [];
    } catch { return []; }
  },

  async getSprints(boardId) {
    try {
      const r = await fetch(`/rest/agile/1.0/board/${boardId}/sprint?state=active,future`);
      if (!r.ok) return [];
      const data = await r.json();
      return data.values || [];
    } catch { return []; }
  }
};
