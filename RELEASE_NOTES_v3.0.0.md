# Jira Checker Plus v3.0.0 Release Notes

## 🎉 Major Release: Dual-Hosting Architecture

### What's New

**Jira Cloud Support** — Full support for Jira Cloud (atlassian.net) alongside existing on-prem/Data Center support.

### Key Features

#### 🌐 Dual-Hosting Architecture
- **Global JCP Settings** now includes **Jira Hosting** selector
  - **Jira Cloud** (default) — *.atlassian.net with API v3
  - **Jira On-Premise / Data Center** — Self-hosted with API v2
- Auto-detection: Cloud URLs automatically route to cloud implementation
- Backward compatible: Existing on-prem users unaffected

#### ☁️ Cloud Implementation
- **API v3** — Uses Jira Cloud REST API v3
- **Cloud DOM Selectors** — React-based UI with `data-testid` attributes
- **ADF Descriptions** — Handles Atlassian Document Format (ADF) for descriptions
- **Cloud Custom Fields** — Supports cloud-specific field IDs
- **Cloud Bulk Task Creator** — Create multiple Tasks with cloud-specific UI
- **Cloud Tempo Guard** — Blocks time logging on issues with validation errors

#### 🔧 On-Premise Implementation
- **Preserved Existing Code** — All v2.3.0 on-prem code remains unchanged
- **API v2** — Uses Jira Server/Data Center REST API v2
- **AUI Toolbar** — Works with classic Jira UI (`.aui-toolbar2-secondary`)
- **Full Feature Parity** — All validations, bulk task creator, tempo guard work identically

### Architecture

```
src/content/
├── main-router.js          # Entry point — routes to cloud or on-prem
├── cloud/
│   ├── main.js             # Cloud implementation
│   ├── services/
│   │   ├── jira-api.js     # Cloud API v3
│   │   ├── field-extractor.js
│   │   ├── ui.js           # Cloud DOM selectors
│   │   ├── bulk-task-creator.js
│   │   ├── tempo.js
│   │   ├── tempo-guard.js
│   │   └── metrics.js
│   └── validators/
│       ├── engine.js
│       └── rules.js
├── onprem/
│   └── main.js             # On-prem implementation (v2.3.0 code)
├── services/               # Shared on-prem services (unchanged)
└── validators/             # Shared on-prem validators (unchanged)
```

### Settings

**Global JCP Settings** now includes:

1. **Jira Hosting** (NEW)
   - Cloud: *.atlassian.net
   - On-Premise / Data Center: Self-hosted

2. **Workflow** (existing)
   - Standard: Story → Sub-tasks
   - New: Story → Tasks

3. **Optional Validations** (existing)
4. **Tempo Settings** (existing)

### Validation Rules

**Same business logic for both Cloud and On-Prem:**
- Description, Assignee, Priority validation
- Financial Category, Story Points, Original Estimate
- Time logging restrictions
- Hierarchy validations (Epic Link, Parent Link)
- Sprint assignment, Target dates
- Release version checks

### Bulk Task Creator

**Cloud Version:**
- Uses API v3 for task creation
- Cloud-specific DOM selectors for UI
- ADF format for descriptions
- Cloud custom field IDs

**On-Prem Version:**
- Uses API v2 (unchanged from v2.3.0)
- AUI toolbar integration
- Wiki markup for descriptions
- On-prem custom field IDs

### Tempo Guard

**Cloud Version:**
- Detects Jira Cloud modal dialogs
- Blocks time logging on issues with validation errors
- Cloud-specific banner styling

**On-Prem Version:**
- Detects on-prem modal dialogs (unchanged from v2.3.0)
- Same blocking behavior

### Migration Guide

#### For Cloud Users
1. Install v3.0.0
2. Go to **Options → Global JCP Settings**
3. Select **Jira Cloud** (auto-detected if on *.atlassian.net)
4. Configure workflow and other settings
5. All features work identically to on-prem

#### For On-Prem Users
1. Install v3.0.0
2. Go to **Options → Global JCP Settings**
3. Select **Jira On-Premise / Data Center**
4. All existing settings and features work unchanged
5. No action required — backward compatible

### Technical Details

#### Cloud-Specific Implementations
- **CloudJiraAPI** — API v3 endpoints, cloud URL patterns
- **CloudFieldExtractor** — Handles ADF descriptions, cloud field IDs
- **CloudValidationEngine** — Same rules, cloud API calls
- **CloudUIManager** — React-based DOM selectors
- **CloudBulkTaskCreator** — Cloud API v3 task creation
- **CloudTempoGuard** — Cloud modal detection

#### Shared Components
- **ValidationRules** — Same business logic for both
- **StorageService** — Unified settings storage
- **MetricsTracker** — Unified analytics
- **Constants** — Shared validation rule messages

### Known Limitations

- Cloud: Bulk Task Creator requires Epic Link on Story (same as on-prem)
- Cloud: Tempo Guard requires Tempo Cloud integration
- On-Prem: No changes from v2.3.0

### Testing Checklist

- [x] Cloud issue validation
- [x] Cloud bulk task creation
- [x] Cloud tempo guard
- [x] On-prem backward compatibility
- [x] Settings persistence
- [x] Auto-detection of hosting type
- [x] Manual hosting selection

### Version History

- **v3.0.0** — Dual-hosting architecture (Cloud + On-Prem)
- **v2.3.0** — Hierarchy validations, CSV import/export, per-row sprint selection
- **v2.2.0** — Analytics dashboard, Tempo timesheet reminders
- **v2.1.0** — Bulk Task Creator, New Workflow support
- **v1.0.0** — Initial release

---

**Created by Anish Shah**  
[GitHub](https://github.com/anishTPM/Jira-Checker-Plus-Plugin)
