async function loadAnalytics() {
  try {
    await migrateStorageData();
    
    // Load permanent overview metrics
    const overview = await new Promise(resolve => {
      chrome.storage.local.get(['jcpOverview'], result => {
        resolve(result.jcpOverview || { totalScans: 0, totalIssues: 0, rescanCount: 0, issuesFixed: 0, fieldStats: {} });
      });
    });
    
    // Load recent scans (deletable)
    const scans = await new Promise(resolve => {
      chrome.storage.local.get(['jcpScans'], result => {
        resolve(result.jcpScans || []);
      });
    });
    
    // Display overview metrics (permanent data)
    document.getElementById('total-scans').textContent = overview.totalScans || 0;
    document.getElementById('total-issues').textContent = overview.totalIssues || 0;
    document.getElementById('avg-issues').textContent = overview.totalScans > 0 ? (overview.totalIssues / overview.totalScans).toFixed(1) : '0';
    document.getElementById('rescan-count').textContent = overview.rescanCount || 0;
    document.getElementById('issues-fixed').textContent = overview.issuesFixed || 0;

    // Field completion rates from overview
    const stats = overview.fieldStats || {};
    updateProgressBar('desc', stats.descPct || 0);
    updateProgressBar('story-points', stats.storyPointsPct || 0);
    updateProgressBar('estimates', stats.estimatesPct || 0);
    updateProgressBar('financial', stats.financialPct || 0);
    updateProgressBar('target-start', stats.targetStartPct || 0);
    updateProgressBar('target-end', stats.targetEndPct || 0);

    // Display recent scans timeline
    displayRecentScans(scans);
  } catch (error) {
    console.error('Analytics load error:', error);
    document.getElementById('timeline').innerHTML = '<div class="no-data">Error loading analytics.</div>';
  }
}

function displayRecentScans(scans) {
  if (scans.length === 0) {
    document.getElementById('timeline').innerHTML = '<div class="no-data">No recent scans. Visit a Jira issue page to start tracking.</div>';
    return;
  }
  
  displayScansWithTabs(scans, 'project-tabs', 'timeline');
}

function displayScansWithTabs(scans, tabsElementId, timelineElementId) {
  if (scans.length === 0) {
    document.getElementById(timelineElementId).innerHTML = '<div class="no-data">No scans available.</div>';
    return;
  }
  
  // Group scans by project
  const projectGroups = {};
  scans.forEach(scan => {
    const project = scan.issueKey.split('-')[0];
    if (!projectGroups[project]) projectGroups[project] = [];
    projectGroups[project].push(scan);
  });
  
  const projects = Object.keys(projectGroups).sort();
  let activeProject = projects[0];
  
  // Create project tabs
  const tabsHTML = projects.map(proj => 
    `<div class="project-tab ${proj === activeProject ? 'active' : ''}" data-project="${proj}" data-tabs="${tabsElementId}" data-timeline="${timelineElementId}">${proj} (${projectGroups[proj].length})</div>`
  ).join('');
  document.getElementById(tabsElementId).innerHTML = tabsHTML;
  
  // Function to display scans for a project
  const displayProject = (project) => {
    const timeline = projectGroups[project].sort((a, b) => b.timestamp - a.timestamp);
    const timelineHTML = timeline.map(t => {
      const date = new Date(t.timestamp).toLocaleString();
      const beforeAfter = t.beforeErrors !== null ? `${t.beforeErrors} → ${t.afterErrors}` : `${t.afterErrors}`;
      const rescanInfo = t.beforeErrors !== null ? 'Rescan' : 'First scan';
      const color = t.beforeErrors !== null && t.afterErrors < t.beforeErrors ? '#36b37e' : (t.afterErrors > 0 ? '#ff5630' : '#6b778c');
      const assigneeInfo = t.assigneeDisplayName ? `<span style="font-size:12px;color:#6b778c">Assignee: ${t.assigneeDisplayName}</span>` : '';
      return `<div class="timeline-item">
        <span><strong>${t.issueKey}</strong> (${t.issueType})</span>
        <span style="color:${color};font-weight:600">${beforeAfter} errors</span>
        <span style="font-size:12px;color:#6b778c">${rescanInfo}</span>
        <span style="font-size:12px;color:#6b778c">${date}</span>
        ${assigneeInfo}
      </div>`;
    }).join('');
    document.getElementById(timelineElementId).innerHTML = timelineHTML;
  };
  
  // Display initial project
  displayProject(activeProject);
  
  // Add tab click handlers
  document.querySelectorAll(`#${tabsElementId} .project-tab`).forEach(tab => {
    tab.addEventListener('click', (e) => {
      const tabsId = e.target.dataset.tabs;
      const timelineId = e.target.dataset.timeline;
      document.querySelectorAll(`#${tabsId} .project-tab`).forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      displayProject(e.target.dataset.project);
    });
  });
}

function updateProgressBar(field, percentage) {
  document.getElementById(field + '-pct').textContent = percentage + '%';
  document.getElementById(field + '-bar').style.width = percentage + '%';
  document.getElementById(field + '-bar').textContent = percentage + '%';
}

document.getElementById('export-btn').addEventListener('click', async () => {
  const data = await new Promise(resolve => {
    chrome.storage.local.get(['jcpScans'], result => {
      resolve(result.jcpScans || []);
    });
  });

  const csv = [
    ['Timestamp', 'Issue Key', 'Issue Type', 'Before Errors', 'After Errors', 'Has Description', 'Has Story Points', 'Has Estimates', 'Has Financial Category', 'Has Target Start', 'Has Target End', 'Status', 'Export Date & Time'],
    ...data.map(m => [
      new Date(m.timestamp).toISOString(),
      m.issueKey,
      m.issueType || '',
      m.beforeErrors !== null ? m.beforeErrors : 'N/A',
      m.afterErrors,
      m.hasDescription ? 'Yes' : 'No',
      m.hasStoryPoints ? 'Yes' : 'No',
      m.hasOriginalEstimate ? 'Yes' : 'No',
      m.hasFinancialCategory ? 'Yes' : 'No',
      m.hasTargetStart ? 'Yes' : 'No',
      m.hasTargetEnd ? 'Yes' : 'No',
      m.status,
      new Date().toLocaleString()
    ])
  ].map(row => row.join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jcp-analytics-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
});

// Confluence sync functionality
document.getElementById('sync-confluence-btn').addEventListener('click', async () => {
  // Get saved Confluence URL from storage
  const result = await new Promise(resolve => {
    chrome.storage.sync.get(['confluenceUrl'], resolve);
  });
  
  const confluenceUrl = result.confluenceUrl;
  const statusDiv = document.getElementById('sync-status');
  
  if (!confluenceUrl) {
    statusDiv.innerHTML = '<span style="color: #de350b;">Please save Confluence URL in Analytics Settings first</span>';
    return;
  }
  
  statusDiv.innerHTML = '<span style="color: #0052cc;">Syncing to Confluence...</span>';
  
  try {
    // Extract page ID from Confluence URL (pageId=567904864)
    const pageIdMatch = confluenceUrl.match(/pageId=(\d+)/);
    if (!pageIdMatch) {
      statusDiv.innerHTML = '<span style="color: #de350b;">Invalid Confluence URL format. URL should contain pageId parameter</span>';
      return;
    }
    
    const pageId = pageIdMatch[1];
    
    // Extract base URL (https://confluence.tenerity.com)
    const baseUrlMatch = confluenceUrl.match(/(https?:\/\/[^\/]+)/);
    const baseUrl = baseUrlMatch ? baseUrlMatch[1] : window.location.origin;
    
    // Get analytics data
    const data = await new Promise(resolve => {
      chrome.storage.local.get(['jcpScans'], result => {
        resolve(result.jcpScans || []);
      });
    });
    
    if (data.length === 0) {
      statusDiv.innerHTML = '<span style="color: #de350b;">No analytics data to sync</span>';
      return;
    }
    
    // Get current page content
    const pageResponse = await fetch(`${baseUrl}/rest/api/content/${pageId}?expand=body.storage,version`);
    if (!pageResponse.ok) {
      if (pageResponse.status === 401 || pageResponse.status === 403) {
        throw new Error('Authentication failed. Please log in to Confluence first.');
      }
      throw new Error(`Failed to fetch Confluence page: ${pageResponse.status} ${pageResponse.statusText}`);
    }
    
    const pageData = await pageResponse.json().catch(() => {
      throw new Error('Authentication failed. Please log in to Confluence first.');
    });
    let content = pageData.body.storage.value;
    
    // Create a map of existing data for quick lookup (use most recent entry per issue)
    const dataMap = new Map();
    // Sort by timestamp to ensure we process entries in chronological order
    const sortedData = data.sort((a, b) => a.timestamp - b.timestamp);
    const syncDateTime = new Date().toLocaleString();
    sortedData.forEach(m => {
      // For first scans, put error count in Before column; for rescans, use actual before/after
      const isFirstScan = m.beforeErrors === null;
      dataMap.set(m.issueKey, {
        issueType: m.issueType || '',
        lastScanned: new Date(m.timestamp).toLocaleDateString(),
        beforeErrorCount: isFirstScan ? m.afterErrors : (m.beforeErrors !== null ? m.beforeErrors : 'N/A'),
        afterErrorCount: isFirstScan ? 'N/A' : m.afterErrors,
        hasDescription: m.hasDescription ? 'Yes' : 'No',
        hasStoryPoints: m.hasStoryPoints ? 'Yes' : 'No',
        hasEstimates: m.hasOriginalEstimate ? 'Yes' : 'No',
        hasFinancialCategory: m.hasFinancialCategory ? 'Yes' : 'No',
        hasTargetStart: m.hasTargetStart ? 'Yes' : 'No',
        hasTargetEnd: m.hasTargetEnd ? 'Yes' : 'No',
        syncDateTime: syncDateTime
      });
    });
    
    // Check if table exists
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/i;
    const tableMatch = content.match(tableRegex);
    let newRows = [];
    let updatedCount = 0;
    
    if (tableMatch) {
      // Update existing table
      const tableContent = tableMatch[1];
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let updatedTableContent = tableContent;
      let updatedIssues = new Set();
      
      // Update existing rows - only if After Error Count changed
      updatedTableContent = updatedTableContent.replace(rowRegex, (match, rowContent) => {
        const cellRegex = /<td[^>]*>([^<]*)<\/td>/gi;
        const cells = [];
        let cellMatch;
        while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
          cells.push(cellMatch[1].trim());
        }
        
        if (cells.length > 0 && dataMap.has(cells[0])) {
          const issueKey = cells[0];
          const issueData = dataMap.get(issueKey);
          updatedIssues.add(issueKey);
          
          // Check if After Error Count changed (column 4)
          const existingAfterError = cells[4];
          const newAfterError = String(issueData.afterErrorCount);
          
          if (existingAfterError !== newAfterError) {
            updatedCount++;
            // Only update Last Scanned (col 2), After Error Count (col 4), and Sync Date & Time (col 11)
            return `<tr>
              <td>${cells[0]}</td>
              <td>${cells[1] || issueData.issueType}</td>
              <td>${issueData.lastScanned}</td>
              <td>${cells[3] || issueData.beforeErrorCount}</td>
              <td>${issueData.afterErrorCount}</td>
              <td>${cells[5] || issueData.hasDescription}</td>
              <td>${cells[6] || issueData.hasStoryPoints}</td>
              <td>${cells[7] || issueData.hasEstimates}</td>
              <td>${cells[8] || issueData.hasFinancialCategory}</td>
              <td>${cells[9] || issueData.hasTargetStart}</td>
              <td>${cells[10] || issueData.hasTargetEnd}</td>
              <td>${issueData.syncDateTime}</td>
            </tr>`;
          }
        }
        return match; // Keep original row unchanged
      });
      
      // Add new rows for issues not already in table
      newRows = [];
      dataMap.forEach((issueData, issueKey) => {
        if (!updatedIssues.has(issueKey)) {
          newRows.push(`<tr>
            <td>${issueKey}</td>
            <td>${issueData.issueType}</td>
            <td>${issueData.lastScanned}</td>
            <td>${issueData.beforeErrorCount}</td>
            <td>${issueData.afterErrorCount}</td>
            <td>${issueData.hasDescription}</td>
            <td>${issueData.hasStoryPoints}</td>
            <td>${issueData.hasEstimates}</td>
            <td>${issueData.hasFinancialCategory}</td>
            <td>${issueData.hasTargetStart}</td>
            <td>${issueData.hasTargetEnd}</td>
            <td>${issueData.syncDateTime}</td>
          </tr>`);
        }
      });
      
      if (newRows.length > 0) {
        updatedTableContent += newRows.join('');
      }
      
      const updatedTable = `<table>${updatedTableContent}</table>`;
      content = content.replace(tableRegex, updatedTable);
    } else {
      // Create new table if none exists
      const tableRows = Array.from(dataMap.entries()).map(([issueKey, issueData]) => {
        return `<tr>
          <td>${issueKey}</td>
          <td>${issueData.issueType}</td>
          <td>${issueData.lastScanned}</td>
          <td>${issueData.beforeErrorCount}</td>
          <td>${issueData.afterErrorCount}</td>
          <td>${issueData.hasDescription}</td>
          <td>${issueData.hasStoryPoints}</td>
          <td>${issueData.hasEstimates}</td>
          <td>${issueData.hasFinancialCategory}</td>
          <td>${issueData.hasTargetStart}</td>
          <td>${issueData.hasTargetEnd}</td>
          <td>${issueData.syncDateTime}</td>
        </tr>`;
      }).join('');
      
      const tableHtml = `
      <h2>JCP Analytics Data</h2>
      <table>
        <thead>
          <tr>
            <th>Issue Key</th>
            <th>Issue Type</th>
            <th>Last Scanned</th>
            <th>Before Error Count</th>
            <th>After Error Count</th>
            <th>Description</th>
            <th>Story Points</th>
            <th>Estimates</th>
            <th>Financial Category</th>
            <th>Target Start</th>
            <th>Target End</th>
            <th>Sync Date & Time</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>`;
      
      content += tableHtml;
      newRows = Array.from(dataMap.entries());
      updatedCount = 0;
    }
    
    // Update page
    const updateResponse = await fetch(`${baseUrl}/rest/api/content/${pageId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: pageId,
        type: 'page',
        title: pageData.title,
        body: {
          storage: {
            value: content,
            representation: 'storage'
          }
        },
        version: {
          number: pageData.version.number + 1
        }
      })
    });
    
    if (!updateResponse.ok) {
      if (updateResponse.status === 401 || updateResponse.status === 403) {
        throw new Error('Authentication failed. Please log in to Confluence first.');
      }
      throw new Error(`Failed to update Confluence page: ${updateResponse.status}`);
    }
    
    statusDiv.innerHTML = `
      <div style="color: #36b37e; margin-bottom: 10px;">✓ Successfully synced to Confluence! ${newRows.length} created, ${updatedCount} updated</div>
      <div style="font-size: 12px; color: #5e6c84;">
        <a href="${confluenceUrl}" target="_blank">View updated page</a>
      </div>
    `;
    
  } catch (error) {
    console.error('Confluence sync error:', error);
    statusDiv.innerHTML = `<span style="color: #de350b;">Sync failed: ${error.message}</span>`;
  }
});

// Save Confluence URL
document.getElementById('save-confluence-btn').addEventListener('click', () => {
  const confluenceUrl = document.getElementById('confluence-url').value.trim();
  const statusDiv = document.getElementById('confluence-status');

  if (!confluenceUrl) {
    statusDiv.innerHTML = '<span style="color: #de350b;">Please enter a Confluence URL</span>';
    return;
  }

  chrome.storage.sync.set({ confluenceUrl }, () => {
    statusDiv.innerHTML = '<span style="color: #36b37e;">✓ Confluence URL saved successfully!</span>';
    setTimeout(() => { statusDiv.innerHTML = ''; }, 3000);
  });
});

loadAnalytics();

// Sync + Delete button
document.getElementById('sync-delete-btn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('sync-status');
  
  if (!confirm('This will sync data to Confluence and then delete all Recent Scans. Continue?')) {
    return;
  }
  
  // First trigger sync
  document.getElementById('sync-confluence-btn').click();
  statusDiv.innerHTML = '<span style="color: #0052cc;">Syncing to Confluence before deletion...</span>';
  
  // Wait for sync to complete
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Delete recent scans AND old jcpMetrics to prevent re-migration
  await new Promise(resolve => {
    chrome.storage.local.remove(['jcpScans', 'jcpMetrics'], resolve);
  });
  
  // Set empty scans array
  await new Promise(resolve => {
    chrome.storage.local.set({ jcpScans: [] }, resolve);
  });
  
  statusDiv.innerHTML = '<div style="color: #36b37e;">✓ Synced and Recent scans deleted (Overview data preserved)</div>';
  
  // Force reload by clearing timeline and project tabs
  document.getElementById('timeline').innerHTML = '<div class="no-data">No recent scans. Visit a Jira issue page to start tracking.</div>';
  document.getElementById('project-tabs').innerHTML = '';
});

// Migration function to move data from sync to local storage
async function migrateStorageData() {
  try {
    const localScans = await new Promise(resolve => {
      chrome.storage.local.get(['jcpScans'], result => {
        resolve(result.jcpScans || []);
      });
    });
    
    // Migrate old jcpMetrics to new structure
    if (localScans.length === 0) {
      const oldData = await new Promise(resolve => {
        chrome.storage.local.get(['jcpMetrics'], result => {
          resolve(result.jcpMetrics || []);
        });
      });
      
      if (oldData.length > 0) {
        console.log('JCP: Migrating to new storage structure');
        
        // Calculate overview metrics from old data
        const totalIssues = oldData.reduce((sum, m) => sum + m.issueCount, 0);
        const issueKeys = {};
        let rescanCount = 0;
        let issuesFixed = 0;
        
        oldData.forEach(m => {
          if (issueKeys[m.issueKey]) {
            rescanCount++;
            if (m.beforeErrors !== null && m.afterErrors < m.beforeErrors) {
              issuesFixed += (m.beforeErrors - m.afterErrors);
            }
          } else {
            issueKeys[m.issueKey] = true;
          }
        });
        
        const descPct = ((oldData.filter(m => m.hasDescription).length / oldData.length) * 100).toFixed(1);
        const storyPointsPct = ((oldData.filter(m => m.hasStoryPoints).length / oldData.length) * 100).toFixed(1);
        const estimatesPct = ((oldData.filter(m => m.hasOriginalEstimate).length / oldData.length) * 100).toFixed(1);
        const financialPct = ((oldData.filter(m => m.hasFinancialCategory).length / oldData.length) * 100).toFixed(1);
        const targetStartPct = ((oldData.filter(m => m.hasTargetStart).length / oldData.length) * 100).toFixed(1);
        const targetEndPct = ((oldData.filter(m => m.hasTargetEnd).length / oldData.length) * 100).toFixed(1);
        
        const overview = {
          totalScans: oldData.length,
          totalIssues,
          rescanCount,
          issuesFixed,
          fieldStats: { descPct, storyPointsPct, estimatesPct, financialPct, targetStartPct, targetEndPct }
        };
        
        await new Promise(resolve => {
          chrome.storage.local.set({ jcpOverview: overview, jcpScans: oldData }, resolve);
        });
      }
    }
  } catch (error) {
    console.warn('JCP: Migration failed:', error);
  }
}

// Load saved Confluence URL
chrome.storage.sync.get(['confluenceUrl'], result => {
  if (result.confluenceUrl) document.getElementById('confluence-url').value = result.confluenceUrl;
});

// Sidebar navigation
document.querySelectorAll('.nav-item').forEach(item => {
  if (!item.classList.contains('analytics-link')) {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = e.target.dataset.section;
      
      // Update active nav item
      document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
      e.target.classList.add('active');
      
      // Show corresponding section
      document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
      document.getElementById(section + '-section').classList.add('active');
    });
  }
});
