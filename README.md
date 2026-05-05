# Jira Checker Plus

A Chrome/Edge browser extension that validates Jira issues, highlights missing or inconsistent information, and provides productivity tools for Jira teams.

> **Version 2.2.0** | [GitHub](https://github.com/anishTPM/Jira-Checker-Plus-Plugin) | Created by Anish Shah

---

## What's New in v2.x

- 🏗️ **SOLID Architecture** — Fully modular codebase with separate services, validators, and shared utilities
- 🔀 **Dual Workflow Support** — Standard (Story → Sub-tasks) and New Workflow (Story → Tasks)
- ➕ **Bulk Task Creator** — Create multiple linked Tasks from a Story in one go
- 🔗 **Hierarchy Validations** — Task/Bug must have Epic Link, Epic must have Parent Link
- 🌐 **Global JCP Settings** — Switch workflows from the Options page
- 🏃 **Per-row Sprint Selection** — Board dropdown + active/future sprint picker per Task
- 🚫 **Tempo Log Guard** — Blocks time logging on issues with pending validations
- ✅ **Mandatory Field Validation** — All Bulk Task Creator fields enforced before creation

---

## Features

### 🔍 Validation Engine

Automatically validates Jira issues on page load and shows a toolbar button with error count.

#### Both Workflows
| Rule | Description |
|------|-------------|
| Description Missing | Mandatory for Story and Bug |
| Assignee Missing | Mandatory for all except Epic |
| Priority Missing | Mandatory for all except Epic |
| Financial Category Missing | Story, Task, Bug, Sub-task |
| Story Points Missing | Story (when status beyond NEW/Defined) |
| Time Logged in Epic/Story | Not allowed — use Tasks/Sub-tasks |
| Time Logged but To Do | Time logged but status still in To Do |
| Released Version Not Done | Fix Version released but issue not Done |
| Past Release Date Not Released | Fix Version overdue but not marked Released |
| In Progress No Sprint | Issue in progress but not in a Sprint |
| **Task must have Epic Link** | `customfield_10000` required on Tasks |
| **Bug must have Epic Link** | `customfield_10000` required on Bugs |
| **Epic must have Parent Link** | `customfield_16400` required on Epics |

#### Standard Workflow Only (Story → Sub-tasks)
| Rule | Description |
|------|-------------|
| Original Estimate Missing | Required on Sub-tasks |
| Sub-task 100% Logged | Sub-task fully logged but still open |
| Story No Sub-tasks | Story beyond NEW must have Sub-tasks |
| Story Should Be Closed | All Sub-tasks and Bugs done but Story open |
| Target Start/End Overdue | For Story and Sub-task |

#### New Workflow Only (Story → Tasks)
| Rule | Description |
|------|-------------|
| Original Estimate Missing | Required on Tasks |
| Task 100% Logged | Task fully logged but still open |
| Story No Linked Tasks | Story beyond NEW must have linked Tasks |
| Story Should Be Closed | All linked Tasks done but Story open |
| Target Start/End Overdue | For Story and Task |

### ➕ Bulk Task Creator (New Workflow)

Available on Story pages when **New Workflow** is selected. Click **"➕ Add Tasks"** in the toolbar.

- Create multiple Tasks at once linked to the Story
- Auto-fills Epic Link, Program, Sprint from Story context
- Blocks creation if Epic or Program is not linked
- Default assignee = current logged-in user
- Copies Financial Category and Assignee from previous row
- All fields mandatory: Title, Description, Estimate, Remaining, Financial Category, Assignee
- Sets Story Points = Original Estimate (hidden, auto-calculated)
- Links Task to Story via "Is a Child of" relationship
- **Board dropdown** in modal header — select any project board
- **Per-row Sprint dropdown** — active 🟢 and future 🔵 sprints loaded from selected board
- Optionally adds Tasks to selected sprint per row

### 🌐 Global JCP Settings

Configure the workflow mode from **Options → Global JCP Settings**:

- **Standard Jira Workflow** — Story → Sub-tasks (classic Jira)
- **New Workflow** — Story → Tasks linked via "Is a Child of" *(default)*

### ⏰ Tempo Timesheet Reminders

- Friday reminder if weekly hours not fully logged (shows `X/40h remaining`)
- Month-end reminder if timesheet not submitted
- Configurable messages and weekly hour targets

### 📊 Analytics Dashboard

- Total scans, issues found, average issues per scan
- Issues fixed through rescans
- Field completion rates (Description, Story Points, Estimates, Financial Category, Target Dates)
- Recent scans timeline with project tabs
- Export to CSV
- Sync to Confluence page

---

## Installation

1. Open Chrome/Edge → `chrome://extensions/` or `edge://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `build/` folder
5. Navigate to any Jira issue page

---

## Settings

Right-click the extension icon → **Options**:

| Section | Description |
|---------|-------------|
| 🌐 Global JCP Settings | Select Standard or New Workflow |
| Optional Validations | Enable optional rules (description for Sub-task/Epic/Task, assignee/priority for Epic) |
| Tempo Settings | Weekly hours target, reminder messages |
| Mandatory Rules | View all enforced rules by workflow |

---

## Permissions

- `activeTab` — Read Jira page content
- `storage` — Save settings and analytics
- `*://*.atlassian.net/*` — Run on Jira Cloud
- `*://*/jira/*` — Run on Jira Server/Data Center

---

## Compatibility

- Chrome 88+, Edge 88+
- Jira Cloud (atlassian.net) and Jira Server/Data Center

---

## License

MIT
