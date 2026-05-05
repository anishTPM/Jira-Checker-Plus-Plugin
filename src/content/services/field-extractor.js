import { CUSTOM_FIELDS } from '../../shared/constants.js';

export const FieldExtractor = {
  issueType: (f) => f.issuetype?.name?.toLowerCase() || '',
  status: (f) => f.status?.name?.toLowerCase() || '',
  statusCategory: (f) => f.status?.statusCategory?.key?.toLowerCase() || '',
  hasDescription: (f) => !!f.description,
  hasAssignee: (f) => !!f.assignee,
  hasPriority: (f) => !!f.priority,
  financialCategory: (f) => f[CUSTOM_FIELDS.FINANCIAL_CATEGORY],
  storyPoints: (f) => f[CUSTOM_FIELDS.STORY_POINTS],
  originalEstimate: (f) => f.timeoriginalestimate,
  timeSpent: (f) => f.timespent || 0,
  aggregateEstimate: (f) => f.aggregatetimeoriginalestimate || f.timeoriginalestimate || 0,
  targetStart: (f) => f[CUSTOM_FIELDS.TARGET_START],
  targetEnd: (f) => f[CUSTOM_FIELDS.TARGET_END],
  fixVersions: (f) => f.fixVersions || [],

  sprint(f) {
    for (const key of CUSTOM_FIELDS.SPRINT_FIELDS) {
      if (f[key]) return f[key];
    }
    return null;
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
