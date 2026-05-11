import { CloudJiraAPI } from './jira-api.js';
import { CloudValidationEngine } from '../validators/engine.js';
import { StorageService } from '../../shared/storage.js';

const BANNER_ID = 'jcp-cloud-tempo-guard-banner';
const GUARD_ATTR = 'data-jcp-cloud-guarded';
const validationCache = new Map();

function injectStyles() {
  if (document.getElementById('jcp-cloud-tempo-guard-styles')) return;
  const style = document.createElement('style');
  style.id = 'jcp-cloud-tempo-guard-styles';
  style.textContent = `
    #${BANNER_ID} {
      background: #ffebe6;
      border: 1px solid #de350b;
      border-radius: 6px;
      padding: 12px 14px;
      margin: 10px 0;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #${BANNER_ID} .jcp-tg-title {
      font-weight: 700;
      color: #de350b;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
    }
    #${BANNER_ID} .jcp-tg-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    #${BANNER_ID} .jcp-tg-list li {
      color: #172b4d;
      padding: 3px 0;
      padding-left: 14px;
      position: relative;
      line-height: 1.5;
    }
    #${BANNER_ID} .jcp-tg-list li::before {
      content: '•';
      position: absolute;
      left: 0;
      color: #de350b;
      font-weight: 700;
    }
    .jcp-cloud-tg-btn-blocked {
      opacity: 0.4 !important;
      pointer-events: none !important;
      cursor: not-allowed !important;
    }
  `;
  document.head.appendChild(style);
}

function findIssueKeyInDialog(dialog) {
  // Cloud: look for issue key in various places
  const links = dialog.querySelectorAll('a[href*="/browse/"]');
  for (const link of links) {
    const m = link.href?.match(/browse\/([A-Z]+-\d+)/);
    if (m) return m[1];
  }

  const allText = dialog.querySelectorAll('span, div, a, p, label, h1, h2, h3');
  for (const el of allText) {
    const text = el.childNodes?.[0]?.nodeValue?.trim() || '';
    const m = text.match(/^([A-Z]{2,10}-\d+)$/);
    if (m) return m[1];
  }

  return null;
}

function findTimeInput(dialog) {
  const selectors = [
    'input[name="timeSpent"]',
    'input[placeholder*="0h"]',
    'input[placeholder*="hour"]',
    '[data-testid*="duration"] input',
    '[data-testid*="time-spent"] input'
  ];
  for (const sel of selectors) {
    const el = dialog.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function findLogButton(dialog) {
  const buttons = dialog.querySelectorAll('button, input[type="submit"]');
  for (const btn of buttons) {
    const text = (btn.textContent || btn.value || '').toLowerCase().trim();
    if (text.includes('log') || text.includes('save') || text.includes('submit')) {
      return btn;
    }
  }
  return null;
}

function showErrors(dialog, issueKey, errors) {
  dialog.querySelector(`#${BANNER_ID}`)?.remove();

  if (!errors.length) {
    dialog.querySelectorAll(`.jcp-cloud-tg-btn-blocked`).forEach(btn => {
      btn.classList.remove('jcp-cloud-tg-btn-blocked');
      btn.removeAttribute(GUARD_ATTR);
    });
    return;
  }

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.innerHTML = `
    <div class="jcp-tg-title">
      🚫 Cannot log time — ${issueKey} has ${errors.length} validation issue${errors.length > 1 ? 's' : ''}:
    </div>
    <ul class="jcp-tg-list">
      ${errors.map(e => `<li>${e}</li>`).join('')}
    </ul>
  `;

  const footer = dialog.querySelector('footer, [class*="footer"]');
  if (footer) {
    footer.insertBefore(banner, footer.firstChild);
  } else {
    const logBtn = findLogButton(dialog);
    if (logBtn) {
      logBtn.parentNode.insertBefore(banner, logBtn);
    } else {
      dialog.insertBefore(banner, dialog.firstChild);
    }
  }

  const logBtn = findLogButton(dialog);
  if (logBtn && !logBtn.getAttribute(GUARD_ATTR)) {
    logBtn.classList.add('jcp-cloud-tg-btn-blocked');
    logBtn.setAttribute(GUARD_ATTR, 'true');
    logBtn.addEventListener('click', (e) => {
      if (logBtn.hasAttribute(GUARD_ATTR)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    }, true);
  }
}

async function checkDialog(dialog) {
  if (dialog.getAttribute('data-jcp-cloud-checked') === 'processing') return;

  const issueKey = findIssueKeyInDialog(dialog);
  if (!issueKey) return;

  const cacheKey = `${issueKey}-${dialog.id || ''}`;
  if (dialog.getAttribute('data-jcp-cloud-checked') === cacheKey) return;
  dialog.setAttribute('data-jcp-cloud-checked', 'processing');

  try {
    const settings = await StorageService.loadSettings();

    if (!settings.tempoGuardEnabled) {
      dialog.removeAttribute('data-jcp-cloud-checked');
      return;
    }

    let errors;
    if (validationCache.has(issueKey)) {
      errors = validationCache.get(issueKey);
    } else {
      const apiData = await CloudJiraAPI.getIssue(issueKey);
      if (!apiData) { dialog.removeAttribute('data-jcp-cloud-checked'); return; }
      errors = await CloudValidationEngine.validate(apiData, issueKey, settings);
      validationCache.set(issueKey, errors);
      setTimeout(() => validationCache.delete(issueKey), 60000);
    }

    showErrors(dialog, issueKey, errors);
    dialog.setAttribute('data-jcp-cloud-checked', cacheKey);
  } catch (e) {
    console.warn('JCP Cloud TempoGuard: check failed', e);
    dialog.removeAttribute('data-jcp-cloud-checked');
  }
}

export const CloudTempoGuard = {
  init() {
    injectStyles();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;

          if (node.getAttribute?.('role') === 'dialog' || node.getAttribute?.('data-testid')?.includes('modal')) {
            this._watchModal(node);
          }

          const modal = node.querySelector?.('[role="dialog"]');
          if (modal) this._watchModal(modal);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const existing = document.querySelector('[role="dialog"]');
    if (existing) this._watchModal(existing);
  },

  _watchModal(dialog) {
    checkDialog(dialog);

    const innerObserver = new MutationObserver(() => {
      dialog.removeAttribute('data-jcp-cloud-checked');
      checkDialog(dialog);
    });

    innerObserver.observe(dialog, { childList: true, subtree: true });

    const watchTimeInput = () => {
      const timeInput = findTimeInput(dialog);
      if (timeInput && !timeInput.getAttribute('data-jcp-cloud-watched')) {
        timeInput.setAttribute('data-jcp-cloud-watched', 'true');
        timeInput.addEventListener('focus', () => {
          dialog.removeAttribute('data-jcp-cloud-checked');
          checkDialog(dialog);
        });
      }
    };

    watchTimeInput();
    setTimeout(watchTimeInput, 1000);
    setTimeout(watchTimeInput, 2000);

    const closeObserver = new MutationObserver(() => {
      if (!document.contains(dialog)) {
        innerObserver.disconnect();
        closeObserver.disconnect();
      }
    });
    closeObserver.observe(document.body, { childList: true, subtree: false });
  }
};
