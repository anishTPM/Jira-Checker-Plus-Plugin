import { VALIDATION_RULES } from '../../shared/constants.js';
import { FieldExtractor as F } from '../services/field-extractor.js';
import { JiraAPI } from '../services/jira-api.js';
import { rules } from './rules.js';

export const ValidationEngine = {
  validateFields(fields, settings, prefix = '') {
    if (F.isCancelledOrRejected(fields)) return [];
    return rules.map(rule => rule(fields, settings)).filter(Boolean).map(msg => prefix + msg);
  },

  async validate(apiData, issueKey, settings) {
    const fields = apiData.fields;
    const issues = this.validateFields(fields, settings);
    const type = F.issueType(fields);
    const status = F.status(fields);
    const statusCategory = F.statusCategory(fields);

    if (type.includes('epic')) {
      const stories = await JiraAPI.getEpicStories(issueKey);
      for (const s of stories) issues.push(...this.validateFields(s.fields, settings, `[${s.key}] `));
    }

    if (type.includes('story') && !type.includes('sub')) {
      const subtasks = await JiraAPI.getSubtasks(issueKey);

      if (!status.includes('new') && subtasks.length === 0) {
        issues.push(VALIDATION_RULES.STORY_NO_SUBTASKS);
      }

      for (const st of subtasks) issues.push(...this.validateFields(st.fields, settings, `[${st.key}] `));

      if (statusCategory !== 'done' && subtasks.length > 0 &&
          !status.includes('new') && !status.includes('defined')) {
        const allDone = subtasks.every(st => F.statusCategory(st.fields) === 'done');
        if (allDone) {
          const bugs = await JiraAPI.getLinkedBugs(issueKey);
          if (bugs.length === 0 || bugs.every(b => F.statusCategory(b.fields) === 'done')) {
            issues.push(VALIDATION_RULES.STORY_SHOULD_BE_CLOSED);
          }
        }
      }
    }

    return issues;
  },

  async validateRelease(versionId, settings) {
    const allIssues = [];
    const versionIssues = await JiraAPI.getVersionIssues(versionId);
    const storyKeys = [];

    for (const issue of versionIssues) {
      allIssues.push(...this.validateFields(issue.fields, settings, `[${issue.key}] `));
      if (F.isType(issue.fields, 'story') && !F.isType(issue.fields, 'sub')) {
        storyKeys.push(issue.key);
      }
    }

    if (storyKeys.length > 0) {
      const subtaskArrays = await Promise.all(storyKeys.map(k => JiraAPI.getSubtasks(k)));
      for (const subtasks of subtaskArrays) {
        for (const st of subtasks) {
          allIssues.push(...this.validateFields(st.fields, settings, `[${st.key}] `));
        }
      }
    }

    return allIssues;
  }
};
