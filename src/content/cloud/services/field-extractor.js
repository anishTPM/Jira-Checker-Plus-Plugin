import { CLOUD_CUSTOM_FIELDS } from '../../../shared/constants.js';

export const CloudFieldExtractor = {
  issueType: (f) => f.issuetype?.name?.toLowerCase() || '',
  status: (f) => f.status?.name?.toLowerCase() || '',
  statusCategory: (f) => f.status?.statusCategory?.key?.toLowerCase() || '',

  // Cloud API v3: description is ADF object, not string
  hasDescription(f) {
    if (!f.description) return false;
    // ADF format: { type: 'doc', content: [...] }
    if (typeof f.description === 'object') {
      return f.description.content && f.description.content.length > 0;
    }
    return !!f.description;
  },

  hasAssignee: (f) => !!f.assignee,
  hasPriority: (f) => !!f.priority,

  financialCategory(f) {
    return f[CLOUD_CUSTOM_FIELDS.FINANCIAL_CATEGORY] || null;
  },

  storyPoints(f) {
    return f[CLOUD_CUSTOM_FIELDS.STORY_POINTS] || f[CLOUD_CUSTOM_FIELDS.STORY_POINTS_ALT] || null;
  },

  originalEstimate: (f) => f.timeoriginalestimate,
  timeSpent: (f) => f.timespent || 0,
  aggregateEstimate: (f) => f.aggregatetimeoriginalestimate || f.timeoriginalestimate || 0,

  targetStart(f) {
    return f[CLOUD_CUSTOM_FIELDS.TARGET_START_ALT] || null;
  },

  targetEnd(f) {
    return f[CLOUD_CUSTOM_FIELDS.TARGET_END_ALT] || null;
  },

  // Cloud: Epic Link can be in customfield_10014 or parent field
  epicLink(f) {
    return f[CLOUD_CUSTOM_FIELDS.EPIC_LINK] || f[CLOUD_CUSTOM_FIELDS.EPIC_LINK_ALT] || null;
  },

  // Cloud: Parent link uses native 'parent' field for Epics
  parentLink(f) {
    return f.parent || f[CLOUD_CUSTOM_FIELDS.PARENT_LINK_ALT] || null;
  },

  fixVersions: (f) => f.fixVersions || [],

  sprint(f) {
    const val = f[CLOUD_CUSTOM_FIELDS.SPRINT];
    if (Array.isArray(val)) return val.find(s => s.state === 'active') || val[0] || null;
    return val || null;
  },

  hasReleasedVersion(f) {
    return this.fixVersions(f).some(v => v.released === true);
  },

  hasPastUnreleasedVersion(f) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.fixVersions(f).some(v =>
      !v.released && v.releaseDate && new Date(v.releaseDate) < today
    );
  },

  isType(f, type) {
    return this.issueType(f).includes(type);
  },

  isCancelledOrRejected(f) {
    const s = this.status(f);
    return s.includes('cancel') || s.includes('reject');
  }
};
