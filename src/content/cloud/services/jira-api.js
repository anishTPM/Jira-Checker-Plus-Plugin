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
      const fieldArr = typeof fields === 'string' ? fields.split(',') : fields;
      const r = await fetch('/rest/api/3/search/jql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jql, fields: fieldArr, maxResults })
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        console.warn('JCP Cloud search error:', r.status, err);
        return [];
      }
      const data = await r.json();
      return data.issues || [];
    } catch (e) {
      console.warn('JCP Cloud search exception:', e);
      return [];
    }
  },

  // Get child issues (Tasks) for a parent (Story)
  async getChildIssues(parentKey) {
    try {
      const parentIssue = await this.getIssue(parentKey);
      if (!parentIssue || !parentIssue.fields.issuelinks) return [];
      
      // "Is a Child of/Is a Parent of" — children appear as inwardIssue on the story
      const childLinks = parentIssue.fields.issuelinks.filter(link => {
        const inward = link.type?.inward?.toLowerCase() || '';
        return inward.includes('parent of') && link.inwardIssue;
      });
      
      return childLinks.map(link => ({
        key: link.inwardIssue.key,
        fields: {
          issuetype: link.inwardIssue.fields?.issuetype,
          status: link.inwardIssue.fields?.status
        }
      }));
    } catch (e) {
      console.warn('JCP Cloud getChildIssues error:', e);
      return [];
    }
  },

  getSubtasks: (parentKey) => CloudJiraAPI.search(`parent=${parentKey}`),
  getLinkedBugs: (issueKey) => CloudJiraAPI.search(`issue in linkedIssues(${issueKey}) AND type=Bug`, 'status'),
  getEpicStories: (epicKey) => CloudJiraAPI.search(`parent=${epicKey} OR "Epic Link"=${epicKey}`),
  getVersionIssues: (versionId) => CloudJiraAPI.search(`fixVersion=${versionId}`),

  getIssueKeyFromURL() {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);

    const selected = params.get('selectedIssue');
    if (selected && /^[A-Z]+-\d+$/.test(selected)) return selected;

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

  async getTempoWeeklyHours(accountId, tempoToken = null) {
    try {
      const now = new Date();
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      monday.setHours(0, 0, 0, 0);
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);
      friday.setHours(23, 59, 59, 999);
      const from = monday.toISOString().split('T')[0];
      const to = friday.toISOString().split('T')[0];

      // If Tempo token provided, use Tempo Cloud API directly
      if (tempoToken) {
        const r = await fetch(`https://api.tempo.io/4/worklogs?from=${from}&to=${to}&limit=1000`, {
          headers: { 'Authorization': `Bearer ${tempoToken}` }
        });
        console.log('JCP Tempo API status:', r.status);
        if (r.ok) {
          const data = await r.json();
          const results = data.results || [];
          const hours = results
            .filter(l => l.author?.accountId === accountId)
            .reduce((sum, l) => sum + (l.timeSpentSeconds || 0), 0) / 3600;
          console.log('JCP Tempo: hours via token:', hours);
          return hours;
        }
      }

      // Fallback: Jira native worklog API
      const r = await fetch(`/rest/api/3/worklog/updated?since=${monday.getTime()}`);
      if (!r.ok) return null;
      const updated = await r.json();
      const ids = (updated.values || []).map(v => v.worklogId);
      if (!ids.length) return 0;
      const r2 = await fetch('/rest/api/3/worklog/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids.slice(0, 1000) })
      });
      if (!r2.ok) return null;
      const logs = await r2.json();
      const filtered = (Array.isArray(logs) ? logs : []).filter(l => {
        const started = new Date(l.started).getTime();
        return (l.author?.accountId === accountId || l.updateAuthor?.accountId === accountId) &&
          started >= monday.getTime() && started <= friday.getTime();
      });
      const hours = filtered.reduce((sum, l) => sum + (l.timeSpentSeconds || 0), 0) / 3600;
      console.log('JCP Tempo: hours via Jira worklog API:', hours);
      return hours;
    } catch (e) {
      console.warn('JCP Tempo error:', e);
      return null;
    }
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
