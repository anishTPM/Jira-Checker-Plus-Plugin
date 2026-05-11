import { CloudJiraAPI } from './jira-api.js';

export const CloudTempoManager = {
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
      const user = await CloudJiraAPI.getCurrentUser();
      const accountId = user?.accountId;
      const logged = await CloudJiraAPI.getTempoWeeklyHours(accountId);
      const remaining = settings.weeklyHours - logged;
      if (remaining > 0) {
        messages.push(`\u23f0 ${settings.timelogMessage} - ${remaining.toFixed(1)}/${settings.weeklyHours}h remaining this week`);
      }
    }

    if (this.isLastWorkingDayOfMonth()) {
      const submitted = await CloudJiraAPI.isTimesheetSubmitted();
      if (!submitted) messages.push(`\ud83d\udccb ${settings.timesheetMessage}`);
    }

    if (messages.length > 0) {
      this._showBanner(messages);
    }
  },

  _showBanner(messages) {
    // Cloud: no #announcement-banner, use fixed position banner
    let banner = document.getElementById('jcp-tempo-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'jcp-tempo-banner';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;';
      document.body.appendChild(banner);
    }
    banner.innerHTML = `<div style="background:#de350b;color:#fff;padding:12px 16px;text-align:center;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;">${messages.join(' | ')}</div>`;
  }
};
