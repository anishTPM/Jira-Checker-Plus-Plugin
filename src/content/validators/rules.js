import { VALIDATION_RULES, STATUS_TODO, STATUS_IN_PROGRESS } from '../../shared/constants.js';
import { FieldExtractor as F } from '../services/field-extractor.js';

// Each rule: (fields, settings) => string | null
// settings.workflow = 'standard' | 'new'
export const rules = [

  // ── COMMON: Description ──────────────────────────────────────────────────
  (fields, settings) => {
    if (F.hasDescription(fields)) return null;
    const type = F.issueType(fields);
    if (type.includes('story') || type.includes('bug')) return VALIDATION_RULES.DESCRIPTION_MISSING;
    if (type.includes('sub') && settings.descSubtask) return VALIDATION_RULES.DESCRIPTION_MISSING;
    if (type.includes('epic') && settings.descEpic) return VALIDATION_RULES.DESCRIPTION_MISSING;
    if (type.includes('task') && !type.includes('sub') && settings.descTask) return VALIDATION_RULES.DESCRIPTION_MISSING;
    return null;
  },

  // ── COMMON: Assignee ─────────────────────────────────────────────────────
  (fields, settings) => {
    if (F.hasAssignee(fields)) return null;
    return (!F.isType(fields, 'epic') || settings.assigneeEpic) ? VALIDATION_RULES.ASSIGNEE_MISSING : null;
  },

  // ── COMMON: Priority ─────────────────────────────────────────────────────
  (fields, settings) => {
    if (F.hasPriority(fields)) return null;
    return (!F.isType(fields, 'epic') || settings.priorityEpic) ? VALIDATION_RULES.PRIORITY_MISSING : null;
  },

  // ── COMMON: Financial Category ───────────────────────────────────────────
  (fields) => {
    const type = F.issueType(fields);
    if (type.includes('story') || type.includes('task') || type.includes('bug') || type.includes('sub')) {
      if (!F.financialCategory(fields)) return VALIDATION_RULES.FINANCIAL_CATEGORY_MISSING;
    }
    return null;
  },

  // ── COMMON: Story Points (beyond New/Defined) ────────────────────────────
  (fields) => {
    const s = F.status(fields);
    if (F.isType(fields, 'story') && !F.isType(fields, 'sub') &&
        !s.includes('new') && !s.includes('defined') && !F.storyPoints(fields)) {
      return VALIDATION_RULES.STORY_POINTS_MISSING;
    }
    return null;
  },

  // ── STANDARD ONLY: Original Estimate for Sub-tasks ───────────────────────
  (fields, settings) => {
    if (settings.workflow === 'new') return null;
    if (F.isType(fields, 'sub') && !F.originalEstimate(fields)) return VALIDATION_RULES.ORIGINAL_ESTIMATE_MISSING;
    return null;
  },

  // ── NEW WORKFLOW ONLY: Original Estimate for Tasks ───────────────────────
  (fields, settings) => {
    if (settings.workflow !== 'new') return null;
    const type = F.issueType(fields);
    if (type.includes('task') && !type.includes('sub') && !F.originalEstimate(fields)) {
      return VALIDATION_RULES.ORIGINAL_ESTIMATE_MISSING;
    }
    return null;
  },

  // ── COMMON: Time logged in Epic/Story ────────────────────────────────────
  (fields) => {
    if (F.timeSpent(fields) > 0) {
      if (F.isType(fields, 'epic') || (F.isType(fields, 'story') && !F.isType(fields, 'sub'))) {
        return VALIDATION_RULES.TIME_LOGGED_IN_EPIC_STORY;
      }
    }
    return null;
  },

  // ── COMMON: Time logged but in To Do ─────────────────────────────────────
  (fields) => {
    if (F.timeSpent(fields) > 0 && STATUS_TODO.some(s => F.status(fields).includes(s))) {
      return VALIDATION_RULES.TIME_LOGGED_IN_TODO;
    }
    return null;
  },

  // ── STANDARD ONLY: Sub-task 100% logged but open ─────────────────────────
  (fields, settings) => {
    if (settings.workflow === 'new') return null;
    if (F.isType(fields, 'sub') && STATUS_IN_PROGRESS.some(s => F.status(fields).includes(s))) {
      const est = F.aggregateEstimate(fields);
      if (est > 0 && F.timeSpent(fields) >= est) return VALIDATION_RULES.SUBTASK_100_PERCENT_IN_PROGRESS;
    }
    return null;
  },

  // ── NEW WORKFLOW ONLY: Task 100% logged but open ──────────────────────────
  (fields, settings) => {
    if (settings.workflow !== 'new') return null;
    const type = F.issueType(fields);
    if (type.includes('task') && !type.includes('sub') && STATUS_IN_PROGRESS.some(s => F.status(fields).includes(s))) {
      const est = F.aggregateEstimate(fields);
      if (est > 0 && F.timeSpent(fields) >= est) return VALIDATION_RULES.SUBTASK_100_PERCENT_IN_PROGRESS;
    }
    return null;
  },

  // ── COMMON: Released version but not Done ────────────────────────────────
  (fields) => {
    if (F.hasReleasedVersion(fields) && F.statusCategory(fields) !== 'done') {
      return VALIDATION_RULES.RELEASED_VERSION_NOT_DONE;
    }
    return null;
  },

  // ── COMMON: Past release date not released ───────────────────────────────
  (fields) => F.hasPastUnreleasedVersion(fields) ? VALIDATION_RULES.VERSION_PAST_DATE_NOT_RELEASED : null,

  // ── COMMON: Target Start overdue (Story + Sub-task for Standard, Story + Task for New) ──
  (fields, settings) => {
    const type = F.issueType(fields);
    const isStory = type.includes('story') && !type.includes('sub');
    const isChild = settings.workflow === 'new'
      ? (type.includes('task') && !type.includes('sub'))
      : type.includes('sub');
    if (!isStory && !isChild) return null;
    const ts = F.targetStart(fields);
    if (!ts || F.statusCategory(fields) !== 'new') return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(ts) < today ? VALIDATION_RULES.TARGET_START_OVERDUE : null;
  },

  // ── COMMON: Target End overdue ───────────────────────────────────────────
  (fields, settings) => {
    const type = F.issueType(fields);
    const isStory = type.includes('story') && !type.includes('sub');
    const isChild = settings.workflow === 'new'
      ? (type.includes('task') && !type.includes('sub'))
      : type.includes('sub');
    if (!isStory && !isChild) return null;
    const te = F.targetEnd(fields);
    const sc = F.statusCategory(fields);
    if (!te || (sc !== 'new' && sc !== 'indeterminate')) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(te) < today ? VALIDATION_RULES.TARGET_END_OVERDUE : null;
  },

  // ── COMMON: In Progress but no Sprint ────────────────────────────────────
  (fields) => {
    const type = F.issueType(fields);
    if (F.isType(fields, 'sub')) return null;
    if (!type.includes('story') && !type.includes('task') && !type.includes('bug')) return null;
    const s = F.status(fields);
    if (F.statusCategory(fields) !== 'indeterminate' || F.sprint(fields) || s.includes('blocked') ||
        s.includes('new') || s.includes('defined')) return null;
    return VALIDATION_RULES.IN_PROGRESS_NO_SPRINT;
  },

  // ── BOTH: Task must have Epic Link ───────────────────────────────────────
  (fields) => {
    const type = F.issueType(fields);
    if (type.includes('task') && !type.includes('sub') && !F.epicLink(fields)) {
      return VALIDATION_RULES.TASK_NO_EPIC_LINK;
    }
    return null;
  },

  // ── BOTH: Bug must have Epic Link ────────────────────────────────────────
  (fields) => {
    if (F.isType(fields, 'bug') && !F.epicLink(fields)) {
      return VALIDATION_RULES.BUG_NO_EPIC_LINK;
    }
    return null;
  },

  // ── BOTH: Epic must have Parent Link ─────────────────────────────────────
  (fields) => {
    if (F.isType(fields, 'epic') && !F.parentLink(fields)) {
      return VALIDATION_RULES.EPIC_NO_PARENT_LINK;
    }
    return null;
  }
];
