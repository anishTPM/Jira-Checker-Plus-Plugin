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
      const token = settings.tempoToken || null;
      if (token) {
        // Use Tempo API directly with token (same method as options page)
        const user = await CloudJiraAPI.getCurrentUser();
        const accountId = user?.accountId;
        if (accountId) {
          const now = new Date();
          const day = now.getDay();
          const diffToMonday = day === 0 ? 6 : day - 1;
          const monday = new Date(now); monday.setDate(now.getDate() - diffToMonday); monday.setHours(0,0,0,0);
          const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
          const from = monday.toISOString().split('T')[0];
          const to = sunday.toISOString().split('T')[0];
          try {
            const r = await fetch(`https://api.tempo.io/4/worklogs?from=${from}&to=${to}&limit=1000`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (r.ok) {
              const data = await r.json();
              const logged = (data.results || [])
                .filter(l => l.author?.accountId === accountId)
                .reduce((s, l) => s + (l.timeSpentSeconds || 0), 0) / 3600;
              const remaining = settings.weeklyHours - logged;
              if (remaining > 0) {
                messages.push(`\u23f0 ${settings.timelogMessage} - ${logged.toFixed(1)}/${settings.weeklyHours}h logged (${remaining.toFixed(1)}h remaining)`);
              }
            }
          } catch {}
        }
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
    let banner = document.getElementById('jcp-tempo-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'jcp-tempo-banner';
      banner.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;max-width:680px;width:90%;pointer-events:auto;';
      document.body.appendChild(banner);
    }
    banner.innerHTML = `
      <div style="background:#ff991f;color:#172b4d;padding:12px 40px 12px 16px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.25);position:relative;">
        ${messages.map(m => `<div style="padding:2px 0">${m}</div>`).join('')}
        <button onclick="document.getElementById('jcp-tempo-banner').remove()" style="position:absolute;top:8px;right:10px;background:none;border:none;color:#172b4d;font-size:18px;cursor:pointer;opacity:0.6;line-height:1;">×</button>
      </div>
    `;
  }
};
