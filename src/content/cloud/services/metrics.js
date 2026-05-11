import { StorageService } from '../../../shared/storage.js';
import { CloudFieldExtractor as F } from './field-extractor.js';

export const CloudMetricsTracker = {
  async track(issueKey, validationIssues, fields) {
    try {
      const [scans, overview] = await Promise.all([
        StorageService.getScans(),
        StorageService.getOverview()
      ]);

      const prevScans = scans.filter(m => m.issueKey === issueKey);
      const prevScan = prevScans.length > 0 ? prevScans[prevScans.length - 1] : null;
      const beforeErrors = prevScan ? prevScan.afterErrors : null;
      const afterErrors = validationIssues.length;

      if (beforeErrors !== null && beforeErrors === afterErrors) return;

      scans.push({
        issueKey,
        issueType: fields.issuetype?.name || 'Unknown',
        assignee: fields.assignee?.accountId || 'Unassigned',
        assigneeDisplayName: fields.assignee?.displayName || 'Unassigned',
        timestamp: Date.now(),
        issueCount: afterErrors,
        beforeErrors,
        afterErrors,
        hasDescription: F.hasDescription(fields),
        hasStoryPoints: !!F.storyPoints(fields),
        hasOriginalEstimate: !!F.originalEstimate(fields),
        hasFinancialCategory: !!F.financialCategory(fields),
        hasTargetStart: !!F.targetStart(fields),
        hasTargetEnd: !!F.targetEnd(fields),
        status: fields.status?.name || 'Unknown'
      });

      if (scans.length > 500) scans.shift();

      overview.totalScans++;
      overview.totalIssues += afterErrors;
      if (beforeErrors !== null) {
        overview.rescanCount++;
        if (afterErrors < beforeErrors) overview.issuesFixed += (beforeErrors - afterErrors);
      }

      const total = scans.length;
      const pct = (key) => ((scans.filter(m => m[key]).length / total) * 100).toFixed(1);
      overview.fieldStats = {
        descPct: pct('hasDescription'),
        storyPointsPct: pct('hasStoryPoints'),
        estimatesPct: pct('hasOriginalEstimate'),
        financialPct: pct('hasFinancialCategory'),
        targetStartPct: pct('hasTargetStart'),
        targetEndPct: pct('hasTargetEnd')
      };

      await StorageService.saveScansAndOverview(scans, overview);
    } catch (e) {
      console.warn('JCP: Cloud metrics tracking failed:', e);
    }
  }
};
