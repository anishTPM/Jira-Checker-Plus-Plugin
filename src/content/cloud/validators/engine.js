import { VALIDATION_RULES } from '../../../shared/constants.js';
import { CloudFieldExtractor as F } from '../services/field-extractor.js';
import { CloudJiraAPI } from '../services/jira-api.js';
import { cloudRules } from './rules.js';

export const CloudValidationEngine = {
  validateFields(fields, settings, prefix = '') {
    if (F.isCancelledOrRejected(fields)) return [];
    return cloudRules.map(rule => rule(fields, settings)).filter(Boolean).map(msg => prefix + msg);
  },

  async validate(apiData, issueKey, settings) {
    const fields = apiData.fields;
    const issues = this.validateFields(fields, settings);
    const type = F.issueType(fields);
    const status = F.status(fields);
    const statusCategory = F.statusCategory(fields);

    if (type.includes('epic')) {
      const stories = await CloudJiraAPI.getEpicStories(issueKey);
      for (const s of stories) issues.push(...this.validateFields(s.fields, settings, `[${s.key}] `));
    }

    if (type.includes('story') && !type.includes('sub')) {
      const isNewWorkflow = settings.workflow === 'new';

      if (isNewWorkflow) {
        // Cloud: get child issues (Tasks) from issue links
        const linkedTasks = await CloudJiraAPI.getChildIssues(issueKey);

        if (!status.includes('new') && linkedTasks.length === 0) {
          issues.push(VALIDATION_RULES.STORY_NO_SUBTASKS.replace('Sub-tasks', 'linked Tasks'));
        }

        if (statusCategory !== 'done' && linkedTasks.length > 0 &&
            !status.includes('new') && !status.includes('defined')) {
          const allDone = linkedTasks.every(t => F.statusCategory(t.fields) === 'done');
          if (allDone) issues.push(VALIDATION_RULES.STORY_SHOULD_BE_CLOSED);
        }
      } else {
        const subtasks = await CloudJiraAPI.getSubtasks(issueKey);

        if (!status.includes('new') && subtasks.length === 0) {
          issues.push(VALIDATION_RULES.STORY_NO_SUBTASKS);
        }

        for (const st of subtasks) issues.push(...this.validateFields(st.fields, settings, `[${st.key}] `));

        if (statusCategory !== 'done' && subtasks.length > 0 &&
            !status.includes('new') && !status.includes('defined')) {
          const allDone = subtasks.every(st => F.statusCategory(st.fields) === 'done');
          if (allDone) {
            const bugs = await CloudJiraAPI.getLinkedBugs(issueKey);
            if (bugs.length === 0 || bugs.every(b => F.statusCategory(b.fields) === 'done')) {
              issues.push(VALIDATION_RULES.STORY_SHOULD_BE_CLOSED);
            }
          }
        }
      }
    }

    return issues;
  }
};
