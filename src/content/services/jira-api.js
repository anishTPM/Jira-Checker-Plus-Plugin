import { ISSUE_API_FIELDS } from '../../shared/constants.js';

export const JiraAPI = {
  async getIssue(issueKey) {
    try {
      const r = await fetch(`/rest/api/2/issue/${issueKey}?fields=${ISSUE_API_FIELDS}`);
      return r.ok ? r.json() : null;
    } catch { return null; }
  },

  async search(jql, fields = ISSUE_API_FIELDS, maxResults = 1000) {
    try {
      const r = await fetch(`/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=${maxResults}`);
      if (!r.ok) return [];
      return (await r.json()).issues || [];
    } catch { return []; }
  },

  getSubtasks: (parentKey) => JiraAPI.search(`parent=${parentKey}`),
  getLinkedBugs: (issueKey) => JiraAPI.search(`issue in linkedIssues(${issueKey}) AND type=Bug`, 'status'),
  getEpicStories: (epicKey) => JiraAPI.search(`parent=${epicKey} OR "Epic Link"=${epicKey}`),
  getVersionIssues: (versionId) => JiraAPI.search(`fixVersion=${versionId}`),

  getIssueKeyFromURL() {
    const m = window.location.pathname.match(/([A-Z]+-\d+)/);
    return m ? m[1] : null;
  },

  getVersionIdFromURL() {
    const m = window.location.pathname.match(/versions\/(\d+)/);
    return m ? m[1] : null;
  },

  async getCurrentUser() {
    try {
      const r = await fetch('/rest/api/2/myself');
      return r.ok ? r.json() : null;
    } catch { return null; }
  },

  async getTempoWeeklyHours(username) {
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

      let url = `/rest/tempo-timesheets/4/worklogs?dateFrom=${from}&dateTo=${to}`;
      if (username) url += `&username=${encodeURIComponent(username)}`;

      const r = await fetch(url);
      if (!r.ok) return 0;
      const data = await r.json();
      return data.reduce((sum, log) => sum + (log.timeSpentSeconds || 0), 0) / 3600;
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
  }
};
