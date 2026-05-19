# Web Ecosystem Dashboard

A self-hosted, automated web performance dashboard system built on Google Apps Script and GitHub Pages. Pulls live data from **Google Analytics 4**, **Siteimprove**, **Freshdesk**, and **Microsoft Clarity** — publishes two dashboards daily to GitHub Pages, sends an AI-written Monday morning email brief, and lets you preview and edit before sending. Zero ongoing cost.

**Dashboard 1 — Stakeholder Report** (`index.html`)
A story-driven, visual report for leadership. AI-generated journalistic narrative that updates with each data refresh. Plain-English framing, building-capacity enrollment comparisons, period-over-period change indicators, PDF and PPT export with data-reactive selling points.

**Dashboard 2 — Manager Operations Dashboard** (`manager/index.html`)
A technical operations console for web managers. Department traffic explorer (bar + line chart), quality score tracking with higher-ed benchmarks, team capacity analysis, Microsoft Clarity UX signals, automated recommendations, signal report, and a Monday brief modal with rich-text editing.

**Monday Brief Email**
Automated weekly email sent every Monday at 9am. Fresh 7-day data from APIs, AI-written opening paragraph, auto-generated priorities from threshold logic, rich-text editing before send, full Outlook-safe HTML layout with department tables and score bars.

---

## Quick Start (Technical Users)

1. Fork or clone this repo and enable GitHub Pages (Settings → Pages → main → root)
2. In [Google Apps Script](https://script.google.com), create a new project, paste `Code.gs`, add Script Properties (table below), run `fetchAllData` once
3. In both HTML files update `GITHUB_BASE` to your GitHub Pages URL
4. In `manager/index.html` also update `WEB_APP_URL` to your deployed Web App URL
5. Dashboards live at `https://YOUR-USERNAME.github.io/YOUR-REPO/`

**Required Script Properties:**

| Property | Description |
|---|---|
| `GA4_PROPERTY_ID` | GA4 numeric property ID |
| `SI_USERNAME` | Siteimprove login email |
| `SI_API_KEY` | Siteimprove API key |
| `SI_SITE_ID` | Siteimprove site ID for your domain |
| `SI_API_URL` | `https://api.eu.siteimprove.com/v2` (EU) or `https://api.siteimprove.com/v2` (US) |
| `FD_API_KEY` | Freshdesk API key |
| `FD_EMAIL` | Your Freshdesk account email |
| `FD_BASE_URL` | `https://YOUR-SUBDOMAIN.freshdesk.com` |
| `CLARITY_TOKEN` | Microsoft Clarity Bearer token |
| `CLARITY_PROJECT` | Clarity project ID |
| `GITHUB_TOKEN` | GitHub personal access token (repo scope) |
| `GITHUB_REPO` | `username/repo-name` |
| `ANTHROPIC_API_KEY` | Anthropic API key (for AI narrative and Monday brief) |
| `WEEKLY_RECIPIENTS` | Comma-separated email list for Monday brief |

---

## Detailed Setup Guide

### What You'll Need

- A **GitHub account** (free at github.com)
- A **Google account** with access to Google Analytics 4
- A **Siteimprove account** with API access
- A **Freshdesk account** (optional — degrades gracefully without it)
- A **Microsoft Clarity account** (optional — free at clarity.microsoft.com)
- An **Anthropic API key** (optional — for AI-generated narrative; get one at console.anthropic.com)

---

### Step 1 — Set Up the GitHub Repository

1. Create a new **public** GitHub repository
2. Upload all files maintaining this structure:
   ```
   /index.html              ← stakeholder dashboard
   /manager/index.html      ← ops manager dashboard
   /Code.gs                 ← Apps Script (stored for reference)
   /benchmarks.json         ← benchmark comparison data
   /README.md
   ```
3. Go to Settings → Pages → Branch: main, Folder: / (root) → Save
4. Your dashboards will be at `https://YOUR-USERNAME.github.io/YOUR-REPO/`

---

### Step 2 — Configure Google Apps Script

1. Go to [script.google.com](https://script.google.com) → New project
2. Delete the default code, paste the contents of `Code.gs`
3. Save (Ctrl+S)
4. Click **Run** → `fetchAllData` — authorize when prompted

---

### Step 3 — Add Script Properties

Project Settings (gear icon) → Script Properties → Add each property from the table above.

**Where to find each value:**

| Property | Where to find it |
|---|---|
| `GA4_PROPERTY_ID` | GA4 → Admin → Property Settings → Property ID |
| `SI_USERNAME` | Your Siteimprove login email |
| `SI_API_KEY` | Siteimprove → Account Settings → API |
| `SI_SITE_ID` | In the Siteimprove URL: `/sites/XXXXXXXXX/` |
| `SI_API_URL` | EU: `https://api.eu.siteimprove.com/v2` — US: `https://api.siteimprove.com/v2` |
| `FD_API_KEY` | Freshdesk → Profile Settings → API Key |
| `FD_EMAIL` | Your Freshdesk login email |
| `FD_BASE_URL` | `https://YOUR-COMPANY.freshdesk.com` |
| `CLARITY_TOKEN` | Clarity → Settings → API Access → Generate token |
| `CLARITY_PROJECT` | Clarity → Settings — short alphanumeric ID in the URL |
| `GITHUB_TOKEN` | GitHub → Settings → Developer settings → Personal access tokens → repo scope |
| `GITHUB_REPO` | `your-username/your-repo-name` |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `WEEKLY_RECIPIENTS` | `email1@domain.com,email2@domain.com` |

---

### Step 4 — Configure the HTML Files

**In `index.html`** find near the top of the `<script>` block:
```javascript
var GITHUB_BASE = 'YOUR_GITHUB_PAGES_URL/';
```
Replace with your actual URL, e.g. `'https://username.github.io/repo-name/'`

Search for `[YOUR ORGANIZATION]`, `[YOUR DOMAIN]`, `[YOUR COLLEGE/UNIT]` and replace with your values. Also update the `BUILDINGS` array with venues your audience recognizes:
```javascript
var BUILDINGS = [
  { name: 'Your Stadium',     capacity: 75000, emoji: '🏟️' },
  { name: 'Your Arena',       capacity: 10000, emoji: '🏀' },
  { name: 'Your Auditorium',  capacity: 2000,  emoji: '🎭' },
  { name: 'Your Classroom',   capacity: 300,   emoji: '📚' }
];
```

**In `manager/index.html`** find:
```javascript
var WEB_APP_URL = 'YOUR_WEB_APP_URL';
var GITHUB_BASE = 'YOUR_GITHUB_PAGES_URL/';
```
`WEB_APP_URL` comes from Step 5. `GITHUB_BASE` is the same as above.

---

### Step 5 — Deploy the Web App

Required for the Monday brief send button and AI paragraph generation in the manager dashboard.

1. In Apps Script → **Deploy** → **New deployment**
2. Gear icon → **Web app** → Execute as: **Me** → Who has access: **Anyone**
3. Click Deploy → copy the URL → paste into `manager/index.html` as `WEB_APP_URL`

> Every time `Code.gs` changes: Deploy → Manage deployments → pencil → **New version** → Save.

---

### Step 6 — First Run and Automation

**Generate initial data:**
Select `fetchAllData` → Run. Takes 3-5 minutes. Writes `data.json`, `data-30.json`, `data-60.json`, `data-180.json` to GitHub.

**Automate daily updates:**
Select `createDailyTrigger` → Run once. Updates at 6am daily.

**Automate Monday brief:**
Select `createWeeklyEmailTrigger` → Run once. Sends at 9am every Monday to `WEEKLY_RECIPIENTS`.

---

### Monday Brief

**Automatic:** triggers every Monday at 9am.

**On-demand with editing:** click **📧 Send Monday Brief** in the Signal Report section of the manager dashboard. The modal lets you:
- Review and edit the AI-generated opening paragraph (or regenerate it)
- Edit priorities with a rich-text toolbar (bold, italic, underline, bullets, numbered lists)
- Add an optional rich-text note at the bottom
- Edit recipients and subject before sending

The brief sends in two steps: first saves a draft to GitHub, then triggers the send — this avoids URL length limits that would truncate your edits.

**Security:** recipient addresses in the draft file are replaced with `[sent]` immediately after the email goes out.

---

### Thresholds and Benchmarks

Edit the `T` object in `manager/index.html` to match your standards:
```javascript
var T = {
  accessGood: 80, accessWarn: 65,  // Siteimprove accessibility
  seoGood:    80, seoWarn:    65,  // Siteimprove SEO
  engGood:    55, engWarn:    40,  // GA4 engagement rate %
  durGood:   150, durWarn:    90,  // GA4 avg session duration (seconds)
  brokenWarn: 20, brokenAlert:100, // Siteimprove broken links
  respWarn:    4, respAlert:   8,  // Freshdesk first response (hours)
  resWarn:    85                   // Freshdesk resolution rate % floor
};
```

Score bar markers on the quality section use higher-ed benchmarks from Siteimprove's study of 988 institutions: **peer average = 85**, **excellence (top 5%) = 90**. Update in the HTML if you have sector-specific data.

---

### Architecture

```
GA4 · Siteimprove · Freshdesk · Clarity · Anthropic API
                    ↓
         Google Apps Script (Code.gs)
         Daily at 6am + Monday at 9am
                    ↓
         GitHub repo — writes:
         data.json · data-30.json
         data-60.json · data-180.json
                    ↓
         GitHub Pages (free)
         index.html · manager/index.html
                    ↓
         Browser reads JSON, renders dashboard
         No server at view time
```

Cost: $0 except Anthropic API (typically under $1/month).

---

### Troubleshooting

| Symptom | Fix |
|---|---|
| Stuck on loading screen | Run `fetchAllData` first — `data.json` doesn't exist yet |
| Period switcher returns 404 | Run updated `fetchAllData` to generate period files |
| "Script function not found: doGet" | Redeploy as new version |
| Siteimprove 404 | Switch `SI_API_URL` between EU and US servers |
| Freshdesk 401 | Check `FD_API_KEY` (no spaces) and `FD_BASE_URL` |
| AI brief fails | Check `ANTHROPIC_API_KEY` in Script Properties; redeploy after adding it |
| Note/priorities missing from email | Redeploy Web App as new version |
| Clarity shows no data | 48h delay for new projects; check `CLARITY_PROJECT` and `CLARITY_TOKEN` |
| Subject line shows `?` | Avoid em-dashes in subject — use plain hyphens |

---

### Files

| File | Purpose |
|---|---|
| `index.html` | Stakeholder story dashboard |
| `manager/index.html` | Operations manager dashboard |
| `Code.gs` | Apps Script — fetcher, scheduler, email builder |
| `benchmarks.json` | Peer benchmark data |
| `README.md` | This file |

Generated by the script:

| File | Purpose |
|---|---|
| `data.json` | 90-day snapshot |
| `data-30.json` | 30-day snapshot |
| `data-60.json` | 60-day snapshot |
| `data-180.json` | 180-day snapshot |
| `brief-draft.json` | Temporary send buffer — scrubbed after each send |

---

### Security

- API keys live in Google's encrypted Script Properties — never in any public file
- Dashboard JSON contains aggregate analytics only — no PII
- Email recipients are stored in Script Properties; `brief-draft.json` is scrubbed to `[sent]` immediately after sending
- Email sends via your Google Workspace SMTP, inheriting your domain's SPF/DKIM

---

### License

MIT — fork, adapt, share.
