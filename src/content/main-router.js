import { StorageService } from '../shared/storage.js';

(async function () {
  'use strict';

  const settings = await StorageService.loadSettings();
  const jiraHosting = settings.jiraHosting || 'cloud';
  const isCloud = jiraHosting === 'cloud' || window.location.hostname.includes('atlassian.net');

  console.log('JCP Router: jiraHosting =', jiraHosting, ', hostname =', window.location.hostname, ', isCloud =', isCloud);

  if (isCloud) {
    console.log('JCP Router: Loading cloud implementation');
    await import('./cloud/main.js');
  } else {
    console.log('JCP Router: Loading on-prem implementation');
    await import('./onprem/main.js');
  }
})();
