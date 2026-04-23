// Jira Checker Plus - Content Script v1.0
(function() {
  'use strict';

  // ============================================================================
  // LOGGER
  // ============================================================================
  const Logger = {
    db: null,

    async init() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('JiraCheckerPlus', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          this.db = request.result;
          resolve();
        };
        
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('logs')) {
            const store = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
            store.createIndex('issueKey', 'issueKey', { unique: false });
            store.createIndex('timestamp', 'timestamp', { unique: false });
            store.createIndex('type', 'type', { unique: false });
          }
          if (!db.objectStoreNames.contains('metrics')) {
            const metricsStore = db.createObjectStore('metrics', { keyPath: 'id', autoIncrement: true });
            metricsStore.createIndex('issueKey', 'issueKey', { unique: false });
            metricsStore.createIndex('date', 'date', { unique: false });
          }
        };
      });
    },

    async log(type, message, data = {}) {
      if (!this.db) await this.init();
      
      const entry = {
        timestamp: Date.now(),
        type,
        message,
        issueKey: JiraAPI.getIssueKeyFromURL(),
        url: window.location.href,
        ...data
      };
      
      const tx = this.db.transaction(['logs'], 'readwrite');
      tx.objectStore('logs').add(entry);
      
      await this.cleanup();
    },

    async getPageLogs(issueKey) {
      if (!this.db) await this.init();
      
      return new Promise((resolve) => {
        const tx = this.db.transaction(['logs'], 'readonly');
        const index = tx.objectStore('logs').index('issueKey');
        const request = index.getAll(issueKey);
        
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      });
    },

    async getSettingsChanges(issueKey) {
      const logs = await this.getPageLogs(issueKey);
      return logs.filter(l => l.type === 'settings');
    },

    async cleanup() {
      if (!this.db) return;
      
      const tx = this.db.transaction(['logs'], 'readwrite');
      const store = tx.objectStore('logs');
      const index = store.index('timestamp');
      const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
      
      const request = index.openCursor();
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.value.timestamp < cutoff) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
    },

    async trackMetrics(issueKey, validationIssues, fields) {
      const issueType = fields.issuetype?.name || 'Unknown';
      const status = fields.status?.name || 'Unknown';
      
      try {
        // Get previous scans and overview
        const storageData = await new Promise((resolve) => {
          try {
            if (!chrome.storage || !chrome.storage.local) {
              resolve({ scans: [], overview: null });
              return;
            }
            chrome.storage.local.get(['jcpScans', 'jcpOverview'], result => {
              if (chrome.runtime.lastError) {
                resolve({ scans: [], overview: null });
              } else {
                resolve({ scans: result.jcpScans || [], overview: result.jcpOverview || null });
              }
            });
          } catch (error) {
            resolve({ scans: [], overview: null });
          }
        });
        
        const scans = storageData.scans;
        const prevScans = scans.filter(m => m.issueKey === issueKey);
        const prevScan = prevScans.length > 0 ? prevScans[prevScans.length - 1] : null;
        const beforeErrors = prevScan ? prevScan.afterErrors : null;
        const afterErrors = validationIssues.length;
        
        // Always create entry if error count changed OR if it's a rescan (to track all activity)
        if (beforeErrors === null || beforeErrors !== afterErrors) {
          const scanEntry = {
            issueKey,
            issueType,
            assignee: fields.assignee?.accountId || fields.assignee?.emailAddress || fields.assignee?.name || 'Unassigned',
            assigneeDisplayName: fields.assignee?.displayName || 'Unassigned',
            timestamp: Date.now(),
            issueCount: afterErrors,
            beforeErrors,
            afterErrors,
            hasDescription: !!fields.description,
            hasStoryPoints: !!DataExtractor.getStoryPoints(fields),
            hasOriginalEstimate: !!DataExtractor.getOriginalEstimate(fields),
            hasFinancialCategory: !!fields.customfield_10350,
            hasTargetStart: !!DataExtractor.getTargetStart(fields),
            hasTargetEnd: !!DataExtractor.getTargetEnd(fields),
            status
          };
          
          scans.push(scanEntry);
          if (scans.length > 500) scans.shift();
          
          // Update permanent overview metrics
          let overview = storageData.overview || { totalScans: 0, totalIssues: 0, rescanCount: 0, issuesFixed: 0, fieldStats: {} };
          
          overview.totalScans++;
          overview.totalIssues += afterErrors;
          
          if (beforeErrors !== null) {
            overview.rescanCount++;
            if (afterErrors < beforeErrors) {
              overview.issuesFixed += (beforeErrors - afterErrors);
            }
          }
          
          // Recalculate field stats from all scans
          const totalScans = scans.length;
          overview.fieldStats = {
            descPct: ((scans.filter(m => m.hasDescription).length / totalScans) * 100).toFixed(1),
            storyPointsPct: ((scans.filter(m => m.hasStoryPoints).length / totalScans) * 100).toFixed(1),
            estimatesPct: ((scans.filter(m => m.hasOriginalEstimate).length / totalScans) * 100).toFixed(1),
            financialPct: ((scans.filter(m => m.hasFinancialCategory).length / totalScans) * 100).toFixed(1),
            targetStartPct: ((scans.filter(m => m.hasTargetStart).length / totalScans) * 100).toFixed(1),
            targetEndPct: ((scans.filter(m => m.hasTargetEnd).length / totalScans) * 100).toFixed(1)
          };
          
          await new Promise((resolve) => {
            if (!chrome.storage || !chrome.storage.local) {
              resolve();
              return;
            }
            chrome.storage.local.set({ jcpScans: scans, jcpOverview: overview }, () => {
              console.log('JCP: Metrics saved. Scans:', scans.length, 'Overview:', overview);
              resolve();
            });
          });
        }
      } catch (error) {
        console.warn('JCP: Storage error:', error);
      }
    },

    async getAnalytics() {
      if (!this.db) await this.init();
      
      return new Promise((resolve) => {
        const tx = this.db.transaction(['metrics'], 'readonly');
        const request = tx.objectStore('metrics').getAll();
        
        request.onsuccess = () => {
          const data = request.result || [];
          const stats = {
            totalScans: data.length,
            totalIssues: data.reduce((sum, m) => sum + m.issueCount, 0),
            avgIssuesPerScan: 0,
            issuesFixed: 0,
            fieldCompletion: {
              description: 0,
              assignee: 0,
              priority: 0,
              financialCategory: 0
            },
            timeline: []
          };
          
          if (data.length > 0) {
            stats.avgIssuesPerScan = (stats.totalIssues / data.length).toFixed(2);
            stats.fieldCompletion.description = ((data.filter(m => m.hasDescription).length / data.length) * 100).toFixed(1);
            stats.fieldCompletion.assignee = ((data.filter(m => m.hasAssignee).length / data.length) * 100).toFixed(1);
            stats.fieldCompletion.priority = ((data.filter(m => m.hasPriority).length / data.length) * 100).toFixed(1);
            stats.fieldCompletion.financialCategory = ((data.filter(m => m.hasFinancialCategory).length / data.length) * 100).toFixed(1);
            
            const grouped = {};
            data.forEach(m => {
              if (!grouped[m.date]) grouped[m.date] = { date: m.date, issues: 0, scans: 0 };
              grouped[m.date].issues += m.issueCount;
              grouped[m.date].scans++;
            });
            stats.timeline = Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
          }
          
          resolve(stats);
        };
        request.onerror = () => resolve(null);
      });
    }
  };

  // ============================================================================
  // CONSTANTS
  // ============================================================================
  const VALIDATION_RULES = {
    DESCRIPTION_MISSING: 'Description is missing',
    ASSIGNEE_MISSING: 'Assignee not assigned',
    PRIORITY_MISSING: 'Priority not set',
    FINANCIAL_CATEGORY_MISSING: 'Financial Category is missing',
    STORY_POINTS_MISSING: 'Story points not estimated.',
    ORIGINAL_ESTIMATE_MISSING: 'Original Estimate missing.',
    TIME_LOGGED_IN_EPIC_STORY: 'Time log now allowed in Epic/Story (only in Sub-tasks and Bugs)',
    TIME_LOGGED_IN_TODO: 'Time logged but issue still in To Do status',
    SUBTASK_100_PERCENT_IN_PROGRESS: 'Sub-task 100% logged - still open',
    STORY_NO_SUBTASKS: 'Story status beyond NEW but no Sub-tasks linked',
    RELEASED_VERSION_NOT_DONE: 'Fix Version is Released but issue status is not Done',
    VERSION_PAST_DATE_NOT_RELEASED: 'Fix Version release date is in the past but not marked as Released',
    STORY_SHOULD_BE_CLOSED: 'Story not Done but all Sub-tasks and linked Bugs are closed',
    TARGET_START_OVERDUE: 'Target Start date has passed but issue still in To Do',
    TARGET_END_OVERDUE: 'Target End date has passed but issue not completed',
    IN_PROGRESS_NO_SPRINT: 'Issue is In Progress but not assigned to any Sprint'
  };

  const STATUS_TODO = ['to do', 'backlog', 'open'];
  const STATUS_IN_PROGRESS = ['in progress', 'progress'];

  // ============================================================================
  // STATE
  // ============================================================================
  let validationButton = null;
  let validationPanel = null;
  let isPanelOpen = false;
  let currentIssueKey = null;
  let currentIssues = [];
  let settings = {
    descSubtask: false,
    descEpic: false,
    descTask: true,
    assigneeEpic: false,
    priorityEpic: false,
    weeklyHours: 40,
    timelogMessage: 'Please log your hours for this week!',
    timesheetMessage: 'Please submit your timesheet for this month!'
  };

  // DOM Cache for performance
  const DOMCache = {
    toolbar: null,
    getToolbar() {
      if (!this.toolbar || !document.contains(this.toolbar)) {
        this.toolbar = document.querySelector('.aui-toolbar2-secondary');
      }
      return this.toolbar;
    },
    clear() {
      this.toolbar = null;
    }
  };

  // ============================================================================
  // API SERVICE
  // ============================================================================
  const JiraAPI = {
    async getIssue(issueKey) {
      try {
        const response = await fetch(`/rest/api/2/issue/${issueKey}?fields=issuetype,status,assignee,priority,description,timeoriginalestimate,timespent,aggregatetimeoriginalestimate,customfield_10350,customfield_10006,customfield_16401,customfield_16402,fixVersions,sprint,customfield_10020,customfield_10004`);
        return response.ok ? await response.json() : null;
      } catch (e) {
        return null;
      }
    },

    async getSubtasks(parentKey) {
      try {
        const response = await fetch(`/rest/api/2/search?jql=parent=${parentKey}&fields=issuetype,status,assignee,priority,description,timeoriginalestimate,timespent,aggregatetimeoriginalestimate,customfield_10350,customfield_10006,customfield_16401,customfield_16402,fixVersions`);
        if (!response.ok) return [];
        const data = await response.json();
        return data.issues || [];
      } catch (e) {
        return [];
      }
    },

    async getLinkedBugs(issueKey) {
      try {
        const response = await fetch(`/rest/api/2/search?jql=issue in linkedIssues(${issueKey}) AND type=Bug&fields=status`);
        if (!response.ok) return [];
        const data = await response.json();
        return data.issues || [];
      } catch (e) {
        return [];
      }
    },

    async getEpicStories(epicKey) {
      try {
        const response = await fetch(`/rest/api/2/search?jql=parent=${epicKey} OR "Epic Link"=${epicKey}&fields=issuetype,status,assignee,priority,description,timeoriginalestimate,timespent,customfield_10350,customfield_10006,customfield_16401,customfield_16402,fixVersions`);
        if (!response.ok) return [];
        const data = await response.json();
        return data.issues || [];
      } catch (e) {
        return [];
      }
    },

    getIssueKeyFromURL() {
      const match = window.location.pathname.match(/([A-Z]+-\d+)/);
      return match ? match[1] : null;
    },

    async getCurrentUser() {
      try {
        const response = await fetch('/rest/api/2/myself');
        if (!response.ok) return null;
        return await response.json();
      } catch (e) {
        return null;
      }
    },

    async getTempoWeeklyHours() {
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

        const user = await this.getCurrentUser();
        const url = user
          ? `/rest/tempo-timesheets/4/worklogs?dateFrom=${from}&dateTo=${to}&username=${encodeURIComponent(user)}`
          : `/rest/tempo-timesheets/4/worklogs?dateFrom=${from}&dateTo=${to}`;

        const response = await fetch(url);
        if (!response.ok) return 0;
        const data = await response.json();
        return data.reduce((sum, log) => sum + (log.timeSpentSeconds || 0), 0) / 3600;
      } catch (e) {
        return 0;
      }
    }
  };

  // ============================================================================
  // DATA EXTRACTORS
  // ============================================================================
  const DataExtractor = {
    _todayStart: null,
    getTodayStart() {
      if (!this._todayStart) {
        this._todayStart = new Date();
        this._todayStart.setHours(0, 0, 0, 0);
      }
      return this._todayStart;
    },

    getIssueType(fields) {
      return fields.issuetype?.name?.toLowerCase() || '';
    },

    getStatus(fields) {
      return fields.status?.name?.toLowerCase() || '';
    },

    getStatusCategory(fields) {
      return fields.status?.statusCategory?.key?.toLowerCase() || '';
    },

    getFixVersions(fields) {
      return fields.fixVersions || [];
    },

    hasReleasedVersion(fields) {
      const versions = this.getFixVersions(fields);
      return versions.some(v => v.released === true);
    },

    hasPastDateUnreleasedVersion(fields) {
      const versions = this.getFixVersions(fields);
      const now = this.getTodayStart();
      
      return versions.some(v => {
        if (v.released === true) return false;
        if (!v.releaseDate) return false;
        
        const releaseDate = new Date(v.releaseDate);
        return releaseDate < now;
      });
    },

    hasDescription(fields) {
      return !!fields.description;
    },

    hasAssignee(fields) {
      return !!fields.assignee;
    },

    hasPriority(fields) {
      return !!fields.priority;
    },

    getFinancialCategory(fields) {
      return fields.customfield_10350;
    },

    getStoryPoints(fields) {
      return fields.customfield_10006;
    },

    getOriginalEstimate(fields) {
      return fields.timeoriginalestimate;
    },

    getTimeSpent(fields) {
      return fields.timespent || 0;
    },

    getAggregateTimeOriginalEstimate(fields) {
      return fields.aggregatetimeoriginalestimate || fields.timeoriginalestimate || 0;
    },

    getTargetStart(fields) {
      return fields.customfield_16401;
    },

    getTargetEnd(fields) {
      return fields.customfield_16402;
    },

    getSprint(fields) {
      return fields.sprint || fields.customfield_10020 || fields.customfield_10004;
    }
  };

  // ============================================================================
  // VALIDATION RULES ENGINE
  // ============================================================================
  const ValidationEngine = {
    validateSingleIssue(fields, issueKey = null) {
      const issues = [];
      const issueType = DataExtractor.getIssueType(fields);
      const status = DataExtractor.getStatus(fields);
      const prefix = issueKey ? `[${issueKey}] ` : '';

      // Skip validation for Cancelled or Rejected issues
      if (status.includes('cancel') || status.includes('reject')) {
        return issues;
      }

      // Description validation with settings
      if (!DataExtractor.hasDescription(fields)) {
        const isStoryOrBug = issueType.includes('story') || issueType.includes('bug');
        const isSubtask = issueType.includes('sub');
        const isEpic = issueType.includes('epic');
        const isTask = issueType.includes('task') && !isSubtask;
        
        if (isStoryOrBug || 
            (isSubtask && settings.descSubtask) ||
            (isEpic && settings.descEpic) ||
            (isTask && settings.descTask)) {
          issues.push(prefix + VALIDATION_RULES.DESCRIPTION_MISSING);
        }
      }

      // Assignee validation with settings
      if (!DataExtractor.hasAssignee(fields)) {
        const isEpic = issueType.includes('epic');
        if (!isEpic || settings.assigneeEpic) {
          issues.push(prefix + VALIDATION_RULES.ASSIGNEE_MISSING);
        }
      }

      // Priority validation with settings
      if (!DataExtractor.hasPriority(fields)) {
        const isEpic = issueType.includes('epic');
        if (!isEpic || settings.priorityEpic) {
          issues.push(prefix + VALIDATION_RULES.PRIORITY_MISSING);
        }
      }

      // Financial Category required for Story, Task, Bug, and Sub-task only
      if (issueType.includes('story') || issueType.includes('task') || 
          issueType.includes('bug') || issueType.includes('sub')) {
        if (!DataExtractor.getFinancialCategory(fields)) {
          issues.push(prefix + VALIDATION_RULES.FINANCIAL_CATEGORY_MISSING);
        }
      }

      if (issueType.includes('story') && !issueType.includes('sub')) {
        // Only validate if status is beyond New/Defined
        if (!status.includes('new') && !status.includes('defined') && !DataExtractor.getStoryPoints(fields)) {
          issues.push(prefix + VALIDATION_RULES.STORY_POINTS_MISSING);
        }
      }

      if (issueType.includes('sub')) {
        if (!DataExtractor.getOriginalEstimate(fields)) {
          issues.push(prefix + VALIDATION_RULES.ORIGINAL_ESTIMATE_MISSING);
        }
      }

      const timeSpent = DataExtractor.getTimeSpent(fields);
      if (timeSpent > 0) {
        if (issueType.includes('epic') || (issueType.includes('story') && !issueType.includes('sub'))) {
          issues.push(prefix + VALIDATION_RULES.TIME_LOGGED_IN_EPIC_STORY);
        }
      }

      if (timeSpent > 0 && STATUS_TODO.some(s => status.includes(s))) {
        issues.push(prefix + VALIDATION_RULES.TIME_LOGGED_IN_TODO);
      }

      if (issueType.includes('sub') && STATUS_IN_PROGRESS.some(s => status.includes(s))) {
        const originalEstimate = DataExtractor.getAggregateTimeOriginalEstimate(fields);
        if (originalEstimate > 0 && timeSpent >= originalEstimate) {
          issues.push(prefix + VALIDATION_RULES.SUBTASK_100_PERCENT_IN_PROGRESS);
        }
      }

      // Released version but not Done
      if (DataExtractor.hasReleasedVersion(fields)) {
        const statusCategory = DataExtractor.getStatusCategory(fields);
        if (statusCategory !== 'done') {
          issues.push(prefix + VALIDATION_RULES.RELEASED_VERSION_NOT_DONE);
        }
      }

      // Past release date but not marked as Released
      if (DataExtractor.hasPastDateUnreleasedVersion(fields)) {
        issues.push(prefix + VALIDATION_RULES.VERSION_PAST_DATE_NOT_RELEASED);
      }

      // Target Start and Target End validation for Story and Sub-task only
      if (issueType.includes('story') || issueType.includes('sub')) {
        const statusCategory = DataExtractor.getStatusCategory(fields);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Target Start validation
        const targetStart = DataExtractor.getTargetStart(fields);
        if (targetStart && statusCategory === 'new') {
          const startDate = new Date(targetStart);
          if (startDate < today) {
            issues.push(prefix + VALIDATION_RULES.TARGET_START_OVERDUE);
          }
        }

        // Target End validation
        const targetEnd = DataExtractor.getTargetEnd(fields);
        if (targetEnd && (statusCategory === 'new' || statusCategory === 'indeterminate')) {
          const endDate = new Date(targetEnd);
          if (endDate < today) {
            issues.push(prefix + VALIDATION_RULES.TARGET_END_OVERDUE);
          }
        }
      }

      // Sprint validation for Story, Task, Bug in progress - only if beyond New/Defined
      if ((issueType.includes('story') || issueType.includes('task') || issueType.includes('bug')) && !issueType.includes('sub')) {
        const statusCategory = DataExtractor.getStatusCategory(fields);
        const sprint = DataExtractor.getSprint(fields);
        const isBlocked = status.includes('blocked');
        
        if (statusCategory === 'indeterminate' && !sprint && !isBlocked && !status.includes('new') && !status.includes('defined')) {
          issues.push(prefix + VALIDATION_RULES.IN_PROGRESS_NO_SPRINT);
        }
      }

      return issues;
    },

    async validate(apiData, issueKey) {
      const issues = [];
      const fields = apiData.fields;
      const issueType = DataExtractor.getIssueType(fields);
      const status = DataExtractor.getStatus(fields);
      const statusCategory = DataExtractor.getStatusCategory(fields);

      // Validate current issue
      issues.push(...this.validateSingleIssue(fields));

      // If Epic, validate all stories
      if (issueType.includes('epic')) {
        const stories = await JiraAPI.getEpicStories(issueKey);
        for (const story of stories) {
          const storyIssues = this.validateSingleIssue(story.fields, story.key);
          issues.push(...storyIssues);
        }
      }

      // If Story, validate all subtasks and check if should be closed
      if (issueType.includes('story') && !issueType.includes('sub')) {
        const subtasks = await JiraAPI.getSubtasks(issueKey);
        
        // Check if Story beyond NEW has no subtasks
        if (!status.includes('new') && subtasks.length === 0) {
          issues.push(VALIDATION_RULES.STORY_NO_SUBTASKS);
        }
        
        for (const subtask of subtasks) {
          const subtaskIssues = this.validateSingleIssue(subtask.fields, subtask.key);
          issues.push(...subtaskIssues);
        }

        // Check if Story should be closed (all subtasks and bugs are done) - only if beyond New/Defined
        if (statusCategory !== 'done' && subtasks.length > 0 && !status.includes('new') && !status.includes('defined')) {
          const allSubtasksDone = subtasks.every(st => 
            DataExtractor.getStatusCategory(st.fields) === 'done'
          );

          if (allSubtasksDone) {
            const linkedBugs = await JiraAPI.getLinkedBugs(issueKey);
            const allBugsDone = linkedBugs.length === 0 || linkedBugs.every(bug => 
              DataExtractor.getStatusCategory(bug.fields) === 'done'
            );

            if (allBugsDone) {
              issues.push(VALIDATION_RULES.STORY_SHOULD_BE_CLOSED);
            }
          }
        }
      }

      return issues;
    }
  };

  // ============================================================================
  // TEMPO TIMESHEET MANAGER
  // ============================================================================
  const TempoManager = {
    isFriday() {
      return new Date().getDay() === 5;
    },

    isLastWorkingDayOfMonth() {
      const now = new Date();
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      // Find last working day (skip weekends)
      while (lastDay.getDay() === 0 || lastDay.getDay() === 6) {
        lastDay.setDate(lastDay.getDate() - 1);
      }
      
      return now.getDate() === lastDay.getDate() && now.getMonth() === lastDay.getMonth();
    },

    async isTimesheetSubmitted() {
      try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        
        const response = await fetch(`/rest/tempo-timesheets/4/timesheet-approval/current-user/${year}/${month}`);
        if (!response.ok) return false;
        
        const data = await response.json();
        return data.status === 'APPROVED' || data.status === 'SUBMITTED';
      } catch (e) {
        return false;
      }
    },

    async checkAndApplyFadeEffect() {
      const messages = [];

      // Check Friday hours
      if (this.isFriday()) {
        const loggedHours = await JiraAPI.getTempoWeeklyHours();
        const requiredHours = settings.weeklyHours;
        const remaining = requiredHours - loggedHours;
        
        if (remaining > 0) {
          messages.push(`⏰ ${settings.timelogMessage} - ${remaining.toFixed(1)}/${requiredHours}h remaining this week`);
        }
      }

      // Check last working day timesheet submission
      if (this.isLastWorkingDayOfMonth()) {
        const submitted = await this.isTimesheetSubmitted();
        if (!submitted) {
          messages.push(`📋 ${settings.timesheetMessage}`);
        }
      }

      if (messages.length > 0) {
        this.showWarnings(messages);
      } else {
        this.clearWarnings();
      }
    },

    showWarnings(messages) {
      const banner = document.getElementById('announcement-banner');
      if (!banner) return;
      banner.innerHTML = `
        <div style="background: #de350b; color: #fff; padding: 16px; text-align: center; font-weight: 600;">
          ${messages.join(' | ')}
        </div>
      `;
    },

    clearWarnings() {
      const banner = document.getElementById('announcement-banner');
      if (banner) banner.innerHTML = '';
    }
  };

  // ============================================================================
  // UI MANAGER
  // ============================================================================
  const UIManager = {
    createButton(issues) {
      if (validationButton) {
        validationButton.remove();
      }

      const toolbar = DOMCache.getToolbar();
      if (!toolbar) return;

      validationButton = document.createElement('div');
      validationButton.className = 'aui-buttons';
      validationButton.style.marginRight = '8px';

      const hasErrors = issues.length > 0;
      const buttonClass = hasErrors ? 'jcp-btn-error' : 'jcp-btn-success';
      const icon = hasErrors ? '⚠️' : '✓';
      const text = hasErrors ? `${issues.length} ${issues.length > 1 ? '' : ''}` : 'JCP: OK';

      validationButton.innerHTML = `
        <button class="aui-button ${buttonClass}" id="jcp-toolbar-btn">
          <span class="jcp-btn-icon">${icon}</span>
          <span class="jcp-btn-text">${text}</span>
        </button>
      `;

      toolbar.insertBefore(validationButton, toolbar.firstChild);

      validationButton.querySelector('#jcp-toolbar-btn').addEventListener('click', () => {
        if (hasErrors) {
          this.togglePanel(issues);
        } else {
          // Manual rescan when no errors
          App.run();
          this.showNotification('Rescanning...');
        }
      });
    },

    togglePanel(issues) {
      if (isPanelOpen) {
        this.closePanel();
      } else {
        this.openPanel(issues);
      }
    },

    openPanel(issues) {
      this.closePanel();

      validationPanel = document.createElement('div');
      validationPanel.id = 'jira-checker-panel';
      validationPanel.innerHTML = `
        <div class="jcp-header">
          <span class="jcp-icon">⚠️</span>
          <span class="jcp-title">Jira Checker Plus: Validation (${issues.length})</span>
          <button class="jcp-close">×</button>
        </div>
        <ul class="jcp-list">
          ${issues.map(issue => `<li class="jcp-item">🚩 ${issue}</li>`).join('')}
        </ul>
      `;

      document.body.appendChild(validationPanel);
      isPanelOpen = true;

      validationPanel.querySelector('.jcp-close').addEventListener('click', (e) => {
        e.stopPropagation();
        this.closePanel();
      });
      
      // Prevent panel from closing when clicking inside it
      validationPanel.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    },

    closePanel() {
      if (validationPanel) {
        validationPanel.remove();
        validationPanel = null;
      }
      isPanelOpen = false;
    },

    showNotification(message) {
      const notif = document.createElement('div');
      notif.style.cssText = 'position:fixed;top:60px;right:20px;background:#0052cc;color:#fff;padding:12px 20px;border-radius:4px;z-index:10000;box-shadow:0 2px 8px rgba(0,0,0,0.2);max-width:300px';
      notif.textContent = message;
      document.body.appendChild(notif);
      setTimeout(() => notif.remove(), 5000);
    },

    highlightFields(issues) {
      const fieldMap = {
        [VALIDATION_RULES.DESCRIPTION_MISSING]: '[data-testid="issue.views.field.description"]',
        [VALIDATION_RULES.ASSIGNEE_MISSING]: '[data-testid="issue.views.field.assignee"]',
        [VALIDATION_RULES.PRIORITY_MISSING]: '[data-testid="issue.views.field.priority"]'
      };

      Object.entries(fieldMap).forEach(([rule, selector]) => {
        if (issues.includes(rule)) {
          document.querySelector(selector)?.classList.add('jcp-highlight');
        }
      });
    }
  };

  // ============================================================================
  // UTILITIES
  // ============================================================================
  const Utils = {
    waitForElement(selector, timeout = 5000) {
      return new Promise((resolve) => {
        if (document.querySelector(selector)) {
          return resolve(document.querySelector(selector));
        }
        const observer = new MutationObserver(() => {
          if (document.querySelector(selector)) {
            observer.disconnect();
            resolve(document.querySelector(selector));
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
      });
    }
  };

  // ============================================================================
  // SETTINGS MANAGER
  // ============================================================================
  const SettingsManager = {
    async load() {
      return new Promise((resolve) => {
        try {
          if (!chrome.storage || !chrome.storage.sync) {
            resolve();
            return;
          }
          chrome.storage.sync.get(settings, (result) => {
            if (chrome.runtime.lastError) {
              console.warn('JCP: Settings load error:', chrome.runtime.lastError);
              resolve();
            } else {
              settings = result;
              resolve();
            }
          });
        } catch (error) {
          console.warn('JCP: Settings load error:', error);
          resolve();
        }
      });
    }
  };

  // ============================================================================
  // MAIN APPLICATION
  // ============================================================================
  const App = {
    async run() {
      const issueKey = JiraAPI.getIssueKeyFromURL();
      if (!issueKey) return;

      // Don't close panel if it's already open and we're on the same issue
      const isSameIssue = currentIssueKey === issueKey;
      if (!isSameIssue) {
        UIManager.closePanel();
      }
      
      if (currentIssueKey !== issueKey) {
        currentIssueKey = issueKey;
        await Logger.log('visit', 'Page visited');
        await this.showPageHistory(issueKey);
      } else {
        // Same page visited again - this is a rescan
        await Logger.log('rescan', 'Page rescanned');
      }

      const apiData = await JiraAPI.getIssue(issueKey);
      if (!apiData) {
        await Logger.log('error', 'Failed to fetch issue data');
        return;
      }

      // Cache current user and jira base url for analytics page
      try {
        chrome.storage.local.set({ jcpJiraBaseUrl: window.location.origin });
        const user = await JiraAPI.getCurrentUser();
        if (user) chrome.storage.local.set({ jcpCurrentUser: {
          accountId: user.accountId,
          displayName: user.displayName,
          emailAddress: user.emailAddress || user.name,
          jiraBaseUrl: window.location.origin
        }});
      } catch (e) {}

      const issues = await ValidationEngine.validate(apiData, issueKey);
      currentIssues = issues;

      if (issues.length > 0) {
        await Logger.log('validation', `Found ${issues.length} issues`, { issues });
      }
      
      try {
        await Logger.trackMetrics(issueKey, issues, apiData.fields);
      } catch (error) {
        console.warn('JCP: Metrics tracking failed:', error);
      }

      UIManager.createButton(issues);
      if (issues.length > 0) {
        UIManager.highlightFields(issues);
      }
    },

    async showPageHistory(issueKey) {
      // Removed settings change notification - was too intrusive
    },

    setupObserver() {
      let debounceTimer;
      let lastRunTime = 0;
      const MIN_RUN_INTERVAL = 2000; // Minimum 2 seconds between runs
      
      const runWithThrottle = () => {
        const now = Date.now();
        if (now - lastRunTime < MIN_RUN_INTERVAL) {
          return; // Skip if too soon
        }
        lastRunTime = now;
        this.run();
      };
      
      const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const newIssueKey = JiraAPI.getIssueKeyFromURL();
          if (newIssueKey && (newIssueKey !== currentIssueKey || Date.now() - lastRunTime > MIN_RUN_INTERVAL)) {
            runWithThrottle();
          }
        }, 1500);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: false, // Reduced to prevent excessive triggers
        attributes: false
      });
      
      // Listen for page visibility changes (when user switches tabs and comes back)
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          setTimeout(() => runWithThrottle(), 1000);
          // Re-check Tempo so banner clears after logging hours
          TempoManager.checkAndApplyFadeEffect();
        }
      });
    },

    async init() {
      await SettingsManager.load();
      await Utils.waitForElement('.aui-toolbar2-secondary');
      await this.run();
      this.setupObserver();
      await TempoManager.checkAndApplyFadeEffect();
      
      // Removed storage change listener - was causing unnecessary notifications
    }
  };

  // ============================================================================
  // BOOTSTRAP
  // ============================================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
  } else {
    App.init();
  }
})();
