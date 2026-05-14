# Web Ecosystem Dashboard

A self-hosted, automated web performance dashboard system built on Google Apps Script and GitHub Pages. Pulls live data from **Google Analytics 4**, **Siteimprove**, **Freshdesk**, and **Microsoft Clarity** — and publishes two dashboards daily to GitHub Pages with zero ongoing cost.

**Dashboard 1 — Stakeholder Report** (`index.html`)
A story-driven, visual report for leadership and stakeholders. Plain-English narrative, building-capacity comparisons, enrollment funnel, and a one-click PDF/PPT export.

**Dashboard 2 — Manager Operations Dashboard** (`manager/index.html`)
A dense, technical operations console for web managers. Department-level traffic explorer, quality score tracking, team capacity analysis, Clarity UX signals, automated recommendations, and a "Signal Report" daily brief.

---

## Quick Start (Technical Users)

1. Fork or clone this repo
2. Enable GitHub Pages (Settings → Pages → main branch → root folder)
3. In Google Apps Script, create a new project, paste `Code.gs`, add Script Properties (see table below), and run `fetchAllData` once
4. Both dashboards will be live at `https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/`

**Required Script Properties:**

| Property | Description |
|---|---|
| `GA4_PROPERTY_ID` | Your GA4 numeric property ID |
| `SI_USERNAME` | Siteimprove login email |
| `SI_API_KEY` | Siteimprove API key |
| `SI_SITE_ID` | Siteimprove site ID for your domain |
| `SI_API_URL` | `https://api.eu.siteimprove.com/v2` or `https://api.siteimprove.com/v2` |
| `FD_API_KEY` | Freshdesk API key |
| `FD_EMAIL` | Your Freshdesk account email |
| `FD_BASE_URL` | `https://YOUR-SUBDOMAIN.freshdesk.com` |
| `CLARITY_TOKEN` | Microsoft Clarity Bearer token |
| `CLARITY_PROJECT` | Clarity project ID |
| `GITHUB_TOKEN` | GitHub personal access token (repo scope) |
| `GITHUB_REPO` | `username/repo-name` |

Then in both HTML files, update the `GITHUB_BASE` variable to point to your GitHub Pages URL.

---

## Detailed Setup Guide

### What You'll Need

Before starting, make sure you have:

- A **GitHub account** (free at github.com)
- A **Google account** with access to Google Analytics 4 (GA4)
- A **Siteimprove account** with API access
- A **Freshdesk account** (optional — dashboard degrades gracefully without it)
- A **Microsoft Clarity account** (optional — free at clarity.microsoft.com)

You do **not** need a server, hosting account, or technical background. Everything runs on free services.

---

### Step 1 — Set Up the GitHub Repository

GitHub Pages will host your dashboards for free.

1. **Create a GitHub account** at [github.com](https://github.com) if you don't have one
2. **Create a new repository**: click the `+` button → New repository
   - Name it anything you like (e.g., `web-dashboard`)
   - Set it to **Public** (required for free GitHub Pages)
   - Click **Create repository**
3. **Upload the files**: drag and drop `index.html`, the `manager/` folder, and this README into the repo
4. **Enable GitHub Pages**:
   - Go to your repo → Settings → Pages
   - Under "Branch", select `main` and folder `/ (root)`
   - Click Save
   - Your dashboards will be live at `https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/` within a few minutes

> **Your GitHub Pages URL** — write this down. You'll need it in Step 4.

---

### Step 2 — Configure Google Apps Script

Google Apps Script is Google's free automation platform. Your script will run daily, pull data from all your tools, and write the results to GitHub.

1. Go to [script.google.com](https://script.google.com)
2. Click **New project**
3. Delete the default code in `Code.gs`
4. Open the `Code.gs` file from this repo, copy all of it, and paste it into the editor
5. Click **Save** (Ctrl+S / Cmd+S)
6. In the top menu, click **Run** → **fetchAllData**
7. Google will ask you to authorize the script — click through the prompts
   - You may see a "Google hasn't verified this app" warning — click **Advanced** → **Go to (your project name) (unsafe)**. This is normal for personal scripts.

> **What the script does**: every day at 6am, it calls GA4, Siteimprove, Freshdesk, and Clarity, combines the results, and writes JSON files to your GitHub repo. Your dashboards read those JSON files. No data ever passes through a third-party server.

---

### Step 3 — Add Your API Keys (Script Properties)

Script Properties store your API keys securely inside Google's servers. They never appear in your code or in this repo.

1. In Apps Script, click **Project Settings** (gear icon, left sidebar)
2. Scroll to **Script Properties**
3. Click **Add script property** for each item in this table:

| Property Name | What to put here | Where to find it |
|---|---|---|
| `GA4_PROPERTY_ID` | The numeric ID of your GA4 property (e.g., `123456789`) | GA4 → Admin → Property Settings → Property ID |
| `SI_USERNAME` | Your Siteimprove login email | The email you use to log into Siteimprove |
| `SI_API_KEY` | Your Siteimprove API key | Siteimprove → Account Settings → API |
| `SI_SITE_ID` | Your site's ID in Siteimprove | Found in the URL when viewing your site in Siteimprove: `/sites/XXXXXXXXX/` |
| `SI_API_URL` | Siteimprove server URL | Use `https://api.eu.siteimprove.com/v2` for EU accounts, or `https://api.siteimprove.com/v2` for US. If one returns 404, try the other. |
| `FD_API_KEY` | Your Freshdesk API key | Freshdesk → Profile Settings → API Key |
| `FD_EMAIL` | The email tied to your Freshdesk account | Your Freshdesk login email |
| `FD_BASE_URL` | Your Freshdesk instance URL | `https://YOUR-COMPANY.freshdesk.com` — find this in your Freshdesk browser URL |
| `CLARITY_TOKEN` | Microsoft Clarity Bearer token | Clarity → Settings → API Access → Generate token |
| `CLARITY_PROJECT` | Your Clarity project ID | Clarity → Settings — shown in the URL as a short alphanumeric string |
| `GITHUB_TOKEN` | A GitHub personal access token | GitHub → Settings → Developer settings → Personal access tokens → Generate new token (classic) → check `repo` scope |
| `GITHUB_REPO` | Your repo path | `your-github-username/your-repo-name` |

> **Security note**: Script Properties are only visible to you when you're logged into your Google account. Never put API keys directly in the HTML files or commit them to GitHub.

---

### Step 4 — Configure the Dashboard HTML Files

Each dashboard HTML file has a small configuration section near the top of the `<script>` block. You need to update two values:

**In `index.html`** (stakeholder dashboard), find:
```javascript
var GITHUB_BASE  = 'YOUR_GITHUB_PAGES_URL/';
var FALLBACK_URL = GITHUB_BASE + 'data.json';
```

**In `manager/index.html`** (operations dashboard), find the same variables. Replace `YOUR_GITHUB_PAGES_URL` with your actual URL, e.g.:
```javascript
var GITHUB_BASE = 'https://your-username.github.io/your-repo-name/';
```

Also update the **organization name**, **domain**, and any **branding** by searching for `[YOUR ORGANIZATION]`, `[YOUR DOMAIN]`, and `[YOUR COLLEGE/UNIT]` in both HTML files and replacing them with your own.

---

### Step 5 — Run the Script for the First Time

1. In Apps Script, make sure `fetchAllData` is selected in the function dropdown
2. Click **Run**
3. Watch the **Execution log** (View → Execution log)
4. The run takes 3–5 minutes. When complete, you should see:
   ```
   Fetching 30-day data...
   Wrote data-30.json
   Fetching 60-day data...
   Wrote data-60.json
   Fetching 90-day data...
   Wrote data.json
   Fetching 180-day data...
   Wrote data-180.json
   CAS dashboard data fetch complete — all periods written.
   ```
5. Go to your GitHub repo — you should see the JSON files appear
6. Visit your GitHub Pages URL — both dashboards should now show real data

---

### Step 6 — Set Up Automatic Daily Updates

Run this once so the script updates your dashboards automatically every morning:

1. In Apps Script, click the function dropdown and select `createDailyTrigger`
2. Click **Run**
3. Done — your dashboards will update every day at 6am in your local timezone

> You can change the time by editing the `atHour(6)` and `inTimezone('America/Chicago')` values in `createDailyTrigger()`.

---

### Customizing the Stakeholder Dashboard

The stakeholder dashboard (`index.html`) is designed to tell a story. Key things to customize:

**Building capacity comparisons** (Story 3 — Enrollment): The funnel section uses real building capacities to make visitor numbers tangible. Update the `BUILDINGS` array near the top of the script with buildings your audience will recognize:

```javascript
var BUILDINGS = [
  { name: 'Your Stadium Name',     capacity: 75000, emoji: '🏟️', context: 'your largest venue' },
  { name: 'Your Arena Name',       capacity: 10000, emoji: '🏀', context: 'home of your team' },
  { name: 'Your Auditorium Name',  capacity: 2000,  emoji: '🎭', context: 'main performing arts venue' },
  { name: 'Your Largest Classroom',capacity: 300,   emoji: '📚', context: 'biggest lecture hall' }
];
```

**Benchmarks** (`benchmarks.json`): Upload this file alongside `data.json` to enable comparison callouts. Key fields:

```json
{
  "avgSessionDurationSeconds": 140,
  "engagementRatePct": 50,
  "seoScoreGood": 80,
  "peerAvgSessions": 0
}
```

Set `peerAvgSessions` to the 90-day session count of a comparable peer organization if you have it — this enables a "X times peer average" callout.

---

### Customizing the Operations Dashboard

The manager dashboard (`manager/index.html`) has a `THRESHOLDS` object near the top that controls all the green/yellow/red status flags:

```javascript
var T = {
  accessGood: 80,    // accessibility score to show green
  accessWarn: 65,    // accessibility score to show yellow
  seoGood:    80,
  seoWarn:    65,
  engGood:    55,    // engagement rate % to show green
  engWarn:    40,
  durGood:    150,   // session duration in seconds to show green
  durWarn:    90,
  brokenWarn: 20,    // broken link count for yellow
  brokenAlert:100,   // broken link count for red
  respWarn:   4,     // Freshdesk first response hours (yellow)
  respAlert:  8,     // Freshdesk first response hours (red)
  resWarn:    85     // resolution rate % below which shows yellow
};
```

Adjust these to match your organization's standards.

**Department paths**: the `DEPT_PATHS` array in `Code.gs` maps department names to URL paths. Update it to match your site structure:

```javascript
var DEPT_PATHS = [
  { name: 'Your Department Name', path: '/your-department-path/' },
  // add one entry per department
];
```

---

### Splitting into Two Repositories

By default, both dashboards share one repo and one script. If you want to host them separately:

1. **For the stakeholder dashboard**: create a new repo, upload `index.html` and `benchmarks.json`. The `GITHUB_BASE` in that file should point to the new repo's Pages URL. The script writes `data.json` (and period files) to whichever repo is set in `GITHUB_REPO`.

2. **For the manager dashboard**: create a second repo, upload `manager/index.html` as `index.html`. Update `GITHUB_BASE` to the second repo's URL. The script's `GITHUB_REPO` property only writes to one repo — to write to both, you'd duplicate the `writeFileToGitHub` calls at the bottom of `fetchAllData` with a second token/repo pair.

3. **Simplest split approach**: keep one repo with both JSON files, but host each HTML in a separate repo that reads from the shared JSON repo. Since the JSON files are public via GitHub Pages, any dashboard on any domain can read them.

---

### Troubleshooting

**"Script function not found: doGet"**
Your Web App deployment is running old code. Go to Deploy → Manage deployments → pencil icon → Version → New version → Save.

**"Siteimprove returns 404"**
Check which server your account uses. Try switching `SI_API_URL` between `https://api.eu.siteimprove.com/v2` (EU) and `https://api.siteimprove.com/v2` (US).

**"Freshdesk 401 Unauthorized"**
Check that `FD_API_KEY` is correct and `FD_BASE_URL` is your actual Freshdesk subdomain URL (e.g., `https://company.freshdesk.com`), not a custom domain alias.

**"data-30.json not found"**
Run `fetchAllData` with the new script. The period files are only created by the updated script — older versions only wrote `data.json`.

**"Clarity data not showing"**
Make sure `CLARITY_PROJECT` is set in Script Properties (just the project ID, no spaces). Clarity has a 48-hour data delay for new projects. Regenerate your token if it has expired — tokens are time-limited.

**Dashboard stuck on loading screen**
Open the browser console (F12) and check for red errors. The most common cause is `data.json` not existing at the configured `GITHUB_BASE` URL. Confirm the URL in the HTML matches your actual GitHub Pages URL exactly (including trailing slash).

---

### Data Privacy & Security

- **No data leaves your control**: the script runs in your Google account and writes to your GitHub repo. No third-party servers are involved.
- **API keys are stored in Google's servers**: Script Properties are encrypted at rest and only accessible to you while logged in.
- **GitHub Pages is public by default**: the JSON files and dashboards are publicly accessible URLs. Do not include personally identifiable information in department names, ticket subjects, or any data that flows through the system.
- **Freshdesk ticket data**: the script only reads aggregate counts and timing — it does not store ticket content, requester names, or email addresses.
- **Microsoft Clarity**: the Clarity API returns aggregate session metrics only. No individual user data is stored or displayed.

---

### Architecture Overview

```
GA4 + Siteimprove + Freshdesk + Clarity
           ↓
   Google Apps Script (Code.gs)
   Runs daily at 6am — fetches 4 time periods
           ↓
   GitHub repo (your account)
   Writes: data.json, data-30.json,
           data-60.json, data-180.json
           ↓
   GitHub Pages (free hosting)
   Serves: index.html (stakeholder)
           manager/index.html (operations)
           ↓
   Browser reads JSON + renders dashboard
   No server-side code runs at view time
```

**Cost**: $0. Google Apps Script, GitHub Pages, and GitHub are all free for this use case.

**Update frequency**: daily (configurable). Switching between 30/60/90/180 day periods uses pre-built JSON files — no live API calls from the browser.

---

### Files in This Repository

| File | Purpose |
|---|---|
| `index.html` | Stakeholder-facing story dashboard |
| `manager/index.html` | Operations manager dashboard |
| `Code.gs` | Google Apps Script — data fetcher and scheduler |
| `benchmarks.json` | Benchmark comparison data (upload alongside data.json) |
| `README.md` | This file |

After running `fetchAllData`, your repo will also contain:

| File | Purpose |
|---|---|
| `data.json` | 90-day snapshot (default view) |
| `data-30.json` | 30-day snapshot |
| `data-60.json` | 60-day snapshot |
| `data-180.json` | 180-day snapshot |

---

### Contributing & License

This template is provided as-is. Feel free to fork, adapt, and share. If you build improvements, consider opening a pull request.
