import { DEFAULT_SETTINGS } from './constants.js';

export const StorageService = {
  async getLocal(keys) {
    return new Promise(resolve => {
      try {
        if (!chrome.storage?.local) return resolve({});
        chrome.storage.local.get(keys, r => resolve(chrome.runtime.lastError ? {} : r));
      } catch { resolve({}); }
    });
  },

  async setLocal(data) {
    return new Promise(resolve => {
      try {
        if (!chrome.storage?.local) return resolve();
        chrome.storage.local.set(data, resolve);
      } catch { resolve(); }
    });
  },

  async removeLocal(keys) {
    return new Promise(resolve => {
      try {
        if (!chrome.storage?.local) return resolve();
        chrome.storage.local.remove(keys, resolve);
      } catch { resolve(); }
    });
  },

  async getSync(keys) {
    return new Promise(resolve => {
      try {
        if (!chrome.storage?.sync) return resolve({});
        chrome.storage.sync.get(keys, r => resolve(chrome.runtime.lastError ? {} : r));
      } catch { resolve({}); }
    });
  },

  async setSync(data) {
    return new Promise(resolve => {
      try {
        if (!chrome.storage?.sync) return resolve();
        chrome.storage.sync.set(data, resolve);
      } catch { resolve(); }
    });
  },

  async loadSettings() {
    return this.getSync(DEFAULT_SETTINGS);
  },

  async getScans() {
    const r = await this.getLocal(['jcpScans']);
    return r.jcpScans || [];
  },

  async getOverview() {
    const r = await this.getLocal(['jcpOverview']);
    return r.jcpOverview || { totalScans: 0, totalIssues: 0, rescanCount: 0, issuesFixed: 0, fieldStats: {} };
  },

  async saveScansAndOverview(scans, overview) {
    return this.setLocal({ jcpScans: scans, jcpOverview: overview });
  }
};
