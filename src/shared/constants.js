export const VALIDATION_RULES = {
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
  IN_PROGRESS_NO_SPRINT: 'Issue is In Progress but not assigned to any Sprint',
  TASK_NO_EPIC_LINK: 'Task does not have an Epic Link',
  BUG_NO_EPIC_LINK: 'Bug does not have an Epic Link',
  EPIC_NO_PARENT_LINK: 'Epic does not have a Parent Link'
};

export const STATUS_TODO = ['to do', 'backlog', 'open'];
export const STATUS_IN_PROGRESS = ['in progress', 'progress'];

// On-Prem (API v2) Custom Fields
export const CUSTOM_FIELDS = {
  FINANCIAL_CATEGORY: 'customfield_10350',
  STORY_POINTS: 'customfield_10006',
  TARGET_START: 'customfield_16401',
  TARGET_END: 'customfield_16402',
  EPIC_LINK: 'customfield_10000',
  PARENT_LINK: 'customfield_16400',
  SPRINT_FIELDS: ['sprint', 'customfield_10020', 'customfield_10004']
};

// Cloud (API v3) Custom Fields
export const CLOUD_CUSTOM_FIELDS = {
  FINANCIAL_CATEGORY: 'customfield_10195',
  STORY_POINTS: 'customfield_10058',
  STORY_POINTS_ALT: 'customfield_10016',
  STORY_POINTS_ALT2: 'customfield_10006',
  TARGET_START: 'customfield_10022',
  TARGET_START_ALT: 'customfield_10022',
  TARGET_END: 'customfield_10023',
  TARGET_END_ALT: 'customfield_10023',
  EPIC_LINK: 'customfield_10014',
  EPIC_LINK_ALT: 'customfield_10000',
  PARENT_LINK: 'parent',
  PARENT_LINK_ALT: 'customfield_16400',
  SPRINT: 'customfield_10020'
};

export const ISSUE_API_FIELDS = [
  'issuetype', 'status', 'assignee', 'priority', 'description',
  'timeoriginalestimate', 'timespent', 'aggregatetimeoriginalestimate',
  CUSTOM_FIELDS.FINANCIAL_CATEGORY, CUSTOM_FIELDS.STORY_POINTS,
  CUSTOM_FIELDS.TARGET_START, CUSTOM_FIELDS.TARGET_END,
  CUSTOM_FIELDS.EPIC_LINK, CUSTOM_FIELDS.PARENT_LINK,
  'fixVersions', ...CUSTOM_FIELDS.SPRINT_FIELDS
].join(',');

export const CLOUD_API_FIELDS = [
  'issuetype', 'status', 'assignee', 'priority', 'description',
  'timeoriginalestimate', 'timespent', 'aggregatetimeoriginalestimate',
  'parent', 'fixVersions', 'issuelinks',
  CLOUD_CUSTOM_FIELDS.FINANCIAL_CATEGORY,
  CLOUD_CUSTOM_FIELDS.STORY_POINTS,
  CLOUD_CUSTOM_FIELDS.STORY_POINTS_ALT,
  CLOUD_CUSTOM_FIELDS.STORY_POINTS_ALT2,
  CLOUD_CUSTOM_FIELDS.TARGET_START_ALT,
  CLOUD_CUSTOM_FIELDS.TARGET_END_ALT,
  CLOUD_CUSTOM_FIELDS.EPIC_LINK,
  CLOUD_CUSTOM_FIELDS.EPIC_LINK_ALT,
  CLOUD_CUSTOM_FIELDS.PARENT_LINK_ALT,
  CLOUD_CUSTOM_FIELDS.SPRINT
].join(',');

export const DEFAULT_SETTINGS = {
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
