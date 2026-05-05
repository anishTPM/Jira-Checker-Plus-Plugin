import { JiraAPI } from './jira-api.js';

export const TempoManager = {
  isFriday: () => new Date().getDay() === 5,

  isLastWorkingDayOfMonth() {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    while (lastDay.getDay() === 0 || lastDay.getDay() === 6) lastDay.setDate(lastDay.getDate() - 1);
    return now.getDate() === lastDay.getDate() && now.getMonth() === lastDay.getMonth();
  },

  async check(settings) {
    const messages = [];

    if (this.isFriday()) {
      const user = await JiraAPI.getCurrentUser();
      const username = user?.emailAddress || user?.name;
      const logged = await JiraAPI.getTempoWeeklyHours(username);
      const remaining = settings.weeklyHours - logged;
      if (remaining > 0) {
        messages.push(`\u23f0 ${settings.timelogMessage} - ${remaining.toFixed(1)}/${settings.weeklyHours}h remaining this week`);
      }
    }

    if (this.isLastWorkingDayOfMonth()) {
      const submitted = await JiraAPI.isTimesheetSubmitted();
      if (!submitted) messages.push(`\ud83d\udccb ${settings.timesheetMessage}`);
    }

    const banner = document.getElementById('announcement-banner');
    if (!banner) return;

    if (messages.length > 0) {
      banner.innerHTML = `<div style="background:#de350b;color:#fff;padding:16px;text-align:center;font-weight:600">${messages.join(' | ')}</div>`;
    } else {
      banner.innerHTML = '';
    }
  }
};
