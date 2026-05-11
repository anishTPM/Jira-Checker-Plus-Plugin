// Cloud Jira uses the same custom field IDs but API v3 response format differs
// Description is ADF (Atlassian Document Format) in API v3

export const CLOUD_CUSTOM_FIELDS = {
  FINANCIAL_CATEGORY: 'customfield_10350',
  STORY_POINTS: 'customfield_10016', // Cloud often uses 10016 for story points
  STORY_POINTS_ALT: 'customfield_10006', // Fallback
  TARGET_START: 'customfield_10015', // Cloud target start
  TARGET_START_ALT: 'customfield_16401',
  TARGET_END: 'customfield_10016_end', // Cloud target end
  TARGET_END_ALT: 'customfield_16402',
  EPIC_LINK: 'customfield_10014', // Cloud epic link
  EPIC_LINK_ALT: 'customfield_10000',
  PARENT_LINK: 'parent', // Cloud uses native parent field
  PARENT_LINK_ALT: 'customfield_16400',
  SPRINT: 'customfield_10020'
};

export const CLOUD_API_FIELDS = [
  'issuetype', 'status', 'assignee', 'priority', 'description',
  'timeoriginalestimate', 'timespent', 'aggregatetimeoriginalestimate',
  'parent', 'fixVersions', 'issuelinks',
  CLOUD_CUSTOM_FIELDS.FINANCIAL_CATEGORY,
  CLOUD_CUSTOM_FIELDS.STORY_POINTS,
  CLOUD_CUSTOM_FIELDS.STORY_POINTS_ALT,
  CLOUD_CUSTOM_FIELDS.TARGET_START_ALT,
  CLOUD_CUSTOM_FIELDS.TARGET_END_ALT,
  CLOUD_CUSTOM_FIELDS.EPIC_LINK,
  CLOUD_CUSTOM_FIELDS.EPIC_LINK_ALT,
  CLOUD_CUSTOM_FIELDS.PARENT_LINK_ALT,
  CLOUD_CUSTOM_FIELDS.SPRINT
].join(',');
