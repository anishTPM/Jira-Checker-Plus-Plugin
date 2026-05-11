import { StorageService } from '../shared/storage.js';

(async function () {
  'use strict';

  const settings = await StorageService.loadSettings();
  const isCloud = settings.jiraHosting === 'cloud' || window.location.hostname.includes('atlassian.net');

  if (isCloud) {
    await import('./cloud/main.js');
  } else {
    await import('./onprem/main.js');
  }
})();
