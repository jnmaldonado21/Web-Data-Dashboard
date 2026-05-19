// ============================================================
// [Your College/Unit] — Web Dashboard Data Fetcher v2
// Google Apps Script
//
// CONFIRMED WORKING CONFIGURATION (May 2025):
//   GA4:         Google Analytics Data API (OAuth via ScriptApp)
//   Siteimprove: api.eu.siteimprove.com (EU server)
//                Site ID: 30317268100
//                Endpoint: /dci/overview for all scores
//   Freshdesk:   [your-subdomain].freshdesk.com
//                Auth: apikey: (apikey + empty password)
//                Date format: full ISO8601 (toISOString())
//   Clarity:     api.clarity.ms/v1/projects/{projectId}/reports
//                Auth: Bearer token
//
// REQUIRED SCRIPT PROPERTIES:
//   GA4_PROPERTY_ID   — GA4 numeric property ID
//   SI_USERNAME       — Siteimprove login email
//   SI_API_KEY        — Siteimprove API key
//   SI_SITE_ID        — 30317268100
//   SI_API_URL        — https://api.eu.siteimprove.com/v2
//   FD_API_KEY        — Freshdesk API key
//   FD_EMAIL          — Your TAMU email
//   FD_BASE_URL       — https://[your-subdomain].freshdesk.com
//   CLARITY_TOKEN     — Microsoft Clarity API Bearer token
//   CLARITY_PROJECT   — [YOUR_CLARITY_PROJECT_ID]
//   GITHUB_TOKEN      — GitHub personal access token
//   GITHUB_REPO       — username/repo-name
//
// WEB APP DEPLOYMENT:
//   Deploy > New deployment > Web app
//   Execute as: Me
//   Who has access: Anyone (or Anyone with Google account for auth)
//   The deployed URL goes in the OPS dashboard as WEB_APP_URL
// ============================================================

// ------------------------------------------------------------
// DEPARTMENT PATHS
// ------------------------------------------------------------
var DEPT_PATHS = [
  // Add one entry per department/section on your site.
  // path should match the URL path on your domain e.g. '/biology/'
  { name: '[Department Name 1]', path: '/[path-1]/' },
  { name: '[Department Name 2]', path: '/[path-2]/' },
  { name: '[Department Name 3]', path: '/[path-3]/' }
  // Add more as needed...
];

var CENTERS_INVENTORY = [
  // List external sites related to your organization (centers, labs, affiliates)
  // platform: 'WordPress', 'Cascade', 'Google Sites', 'HTML/CSS', 'Unknown'
  // monitored: true = in Siteimprove, false = external only
  { name: '[Site Name]', url: 'https://[site-url]', platform: 'WordPress', monitored: false }
  // Add more as needed...
];

// ============================================================
// WEB APP ENDPOINT — doGet
// Handles requests from the OPS dashboard for live data
// with custom date ranges.
//
// Query parameters:
//   source   — 'ga4' | 'siteimprove' | 'freshdesk' | 'clarity' | 'all'
//   days     — number of days to look back (default: 90)
//   startDate — YYYY-MM-DD override (optional)
//   endDate   — YYYY-MM-DD override (optional)
//
// Example URL:
//   https://script.google.com/macros/s/ABC.../exec?source=ga4&days=30
// ============================================================
function doGet(e) {
  var params    = e ? (e.parameter || {}) : {};
  var source    = params.source    || 'all';
  var days      = parseInt(params.days || '90');
  var startDate = params.startDate || null;
  var endDate   = params.endDate   || null;
  var callback  = params.callback  || null;
  var action    = params.action    || null;
  var result    = {};

  // ── Handle generateBrief action from modal ───────────────
  if (action === 'generateBrief') {
    try {
      var userPrompt = params.prompt || '';
      if (!userPrompt) throw new Error('No prompt provided');

      var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in Script Properties');

      var aiResp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
        method: 'post',
        contentType: 'application/json',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        payload: JSON.stringify({
          model:      'claude-sonnet-4-6',
          max_tokens: 200,
          messages:   [{ role: 'user', content: userPrompt }]
        }),
        muteHttpExceptions: true
      });

      var aiData = JSON.parse(aiResp.getContentText());
      var brief  = aiData.content && aiData.content[0] ? aiData.content[0].text.trim() : null;
      result = { brief: brief || '', success: !!brief };

    } catch(err) {
      Logger.log('generateBrief error: ' + err.message);
      result = { brief: '', success: false, error: err.message };
    }

    var json = JSON.stringify(result);
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }

  // ── Save brief draft to GitHub ────────────────────────────
  if (action === 'saveBriefDraft') {
    try {
      var draftStr = params.draft || '';
      if (!draftStr) throw new Error('No draft content provided');
      writeFileToGitHub('brief-draft.json', draftStr);
      result = { success: true };
    } catch(err) {
      Logger.log('saveBriefDraft error: ' + err.message);
      result = { success: false, error: err.message };
    }
    var json = JSON.stringify(result);
    if (callback) return ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }

  // ── Handle sendWeeklyBrief action from dashboard modal ────
  if (action === 'sendWeeklyBrief') {
    try {
      var recipients, subject, paragraph, priorities, note;

      if (params.useDraft === 'true') {
        // Read all edited content from brief-draft.json on GitHub
        // This avoids URL length limits entirely
        var gRepo = PropertiesService.getScriptProperties().getProperty('GITHUB_REPO');
        var draftUrl = 'https://raw.githubusercontent.com/' + gRepo + '/main/brief-draft.json?t=' + Date.now();
        var draftResp = UrlFetchApp.fetch(draftUrl, { muteHttpExceptions: true });
        if (draftResp.getResponseCode() !== 200) {
          throw new Error('Could not read brief-draft.json from GitHub (status ' + draftResp.getResponseCode() + ').');
        }
        var draft = JSON.parse(draftResp.getContentText());
        recipients = draft.recipients || '';
        subject    = draft.subject    || '';
        paragraph  = draft.paragraph  || '';
        priorities = draft.priorities || '';
        note       = draft.note       || '';
        Logger.log('Loaded draft from GitHub — recipients: ' + recipients);
        Logger.log('Draft note: ' + note);
        Logger.log('Draft priorities: ' + priorities.substring(0, 100));
      } else {
        recipients = params.recipients || '';
        subject    = params.subject    || '';
        paragraph  = params.paragraph  || '';
        priorities = params.priorities || '';
        note       = params.note       || '';
      }

      if (!recipients) throw new Error('No recipients specified');

      var priorityLines = priorities.split('\n').filter(function(l){ return l.trim().length > 0; });

      var weekPeriod = buildPeriod(7, null, null);
      var weekGA4    = fetchGA4Data(weekPeriod);
      var weekFD     = fetchFreshdeskData(weekPeriod);
      var trendData  = null;
      var githubRepo = PropertiesService.getScriptProperties().getProperty('GITHUB_REPO');
      if (githubRepo) {
        try {
          var ghResp = UrlFetchApp.fetch('https://raw.githubusercontent.com/' + githubRepo + '/main/data-30.json', { muteHttpExceptions: true });
          if (ghResp.getResponseCode() === 200) trendData = JSON.parse(ghResp.getContentText());
        } catch(e2) {}
      }
      var siData = (trendData && trendData.siteimprove) ? trendData.siteimprove : fetchSiteimproveData();

      var priorityLines = priorities.split('\n').filter(function(l){ return l.trim().length > 0; });

      var week = {
        sessions:       weekGA4.sessions        ? weekGA4.sessions.raw        : 0,
        newUsers:       weekGA4.newUsers         ? weekGA4.newUsers.raw         : 0,
        engagementRate: weekGA4.engagementRate   ? weekGA4.engagementRate.raw   : 0,
        avgDuration:    weekGA4.avgDuration      ? weekGA4.avgDuration.raw      : 0,
        tickets:        weekFD.ticketVolume      ? weekFD.ticketVolume.raw      : 0,
        resolutionRate: weekFD.resolutionRate    ? weekFD.resolutionRate.raw    : 0,
        responseTime:   weekFD.avgResponseTime   ? weekFD.avgResponseTime.raw   : 'N/A'
      };
      var trend30 = {};
      if (trendData && trendData.ga4) {
        trend30 = {
          sessions: trendData.ga4.sessions ? trendData.ga4.sessions.raw : 0,
          tickets:  trendData.freshdesk && trendData.freshdesk.ticketVolume ? trendData.freshdesk.ticketVolume.raw : 0
        };
      }
      var si = {
        accessibility: siData.accessibilityScore ? siData.accessibilityScore.raw : 0,
        seo:           siData.seoScore            ? siData.seoScore.raw            : 0,
        mobile:        siData.mobileScore         ? siData.mobileScore.raw         : 0,
        dci:           siData.dciTotal            ? siData.dciTotal.raw            : 0,
        brokenLinks:   siData.brokenLinks         ? siData.brokenLinks.raw         : 0
      };

      function wowPct(w, m) {
        if (!w || !m) return null;
        var prior = (m - w) / (30/7 - 1);
        if (prior <= 0) return null;
        return Math.round(((w - prior) / prior) * 100);
      }
      function fmt(n) { return n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n); }
      function fmtD(s) { return Math.floor(s/60)+':'+String(Math.round(s%60)).padStart(2,'0'); }
      function arr(p, h) { if(p===null)return''; return (p>0?'\u25b2':'\u25bc')+' '+Math.abs(p)+'%'; }
      function aCol(p, h) { if(p===null)return'#666'; return (h?p>=0:p<=0)?'#1a7a3f':'#c0392b'; }

      var htmlBody = buildEmailHTMLWithEdits(
        week, trend30, si,
        wowPct(week.sessions, trend30.sessions),
        wowPct(week.tickets,  trend30.tickets),
        weekPeriod, paragraph, priorityLines, note,
        weekGA4, weekFD, fmt, fmtD, arr, aCol
      );

      var recipientList = recipients.split(',').map(function(r){ return r.trim(); }).filter(Boolean);
      recipientList.forEach(function(r) {
        MailApp.sendEmail({ to: r, subject: subject, htmlBody: htmlBody, name: '[Your Unit] Web Team' });
      });

      Logger.log('Brief sent from modal to: ' + recipients);

      // Scrub recipients from the public draft file immediately after sending
      // brief-draft.json is in a public GitHub repo — remove email addresses
      try {
        var scrubbed = JSON.stringify({
          recipients: '[sent]',
          subject:    subject,
          paragraph:  '[sent]',
          priorities: '[sent]',
          note:       '[sent]',
          sentAt:     new Date().toISOString()
        }, null, 2);
        writeFileToGitHub('brief-draft.json', scrubbed);
        Logger.log('brief-draft.json scrubbed after send');
      } catch(scrubErr) {
        Logger.log('Warning: could not scrub brief-draft.json: ' + scrubErr.message);
      }

      result = { success: true, sent: recipientList.length };

    } catch(err) {
      Logger.log('sendWeeklyBrief error: ' + err.message);
      result = { success: false, error: err.message };
    }

    var json = JSON.stringify(result);
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }

  // ── Standard data fetch ────────────────────────────────────
  var period = buildPeriod(days, startDate, endDate);

  try {
    if (source === 'ga4'         || source === 'all') result.ga4         = fetchGA4Data(period);
    if (source === 'siteimprove' || source === 'all') result.siteimprove = fetchSiteimproveData();
    if (source === 'freshdesk'   || source === 'all') result.freshdesk   = fetchFreshdeskData(period);
    if (source === 'clarity'     || source === 'all') result.clarity     = fetchClarityData(period);
    result.lastUpdated  = new Date().toISOString();
    result.reportPeriod = period;
    result.college      = '[Your College/Unit]';
    result.domain       = '[your-domain.edu]';
    if (source === 'all') result.centersInventory = CENTERS_INVENTORY;
  } catch (err) {
    result.error  = err.message;
    result.source = source;
    result.period = period;
  }

  var json = JSON.stringify(result);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
// DAILY SCHEDULED JOB — fetchAllData
// Writes data-30.json, data-60.json, data-90.json, data-180.json
// and data.json (alias for 90 days) to GitHub Pages.
// Dashboard reads the right file based on selected period.
// No browser-side API calls needed — eliminates CORS entirely.
// ============================================================
function fetchAllData() {
  try {
    Logger.log('Starting CAS dashboard data fetch...');

    // Siteimprove scores don't change by period — fetch once
    var siData = fetchSiteimproveData();
    var clData = fetchClarityData(buildPeriod(3, null, null));

    var periods = [30, 60, 90, 180];

    periods.forEach(function(days) {
      Logger.log('Fetching ' + days + '-day data...');
      var period  = buildPeriod(days, null, null);
      var ga4Data = fetchGA4Data(period);
      var fdData  = fetchFreshdeskData(period);

      var payload = {
        lastUpdated:      new Date().toISOString(),
        reportPeriod:     period,
        college:          '[Your College/Unit]',
        domain:           '[your-domain.edu]',
        ga4:              ga4Data,
        siteimprove:      siData,
        freshdesk:        fdData,
        clarity:          clData,
        centersInventory: CENTERS_INVENTORY
      };

      var filename = days === 90 ? 'data.json' : 'data-' + days + '.json';
      writeFileToGitHub(filename, JSON.stringify(payload, null, 2));
      Logger.log('Wrote ' + filename);
    });

    Logger.log('CAS dashboard data fetch complete — all periods written.');

  } catch (e) {
    Logger.log('ERROR in fetchAllData: ' + e.message);
    MailApp.sendEmail(
      Session.getActiveUser().getEmail(),
      'CAS Dashboard: Data fetch failed',
      'The CAS dashboard data fetch failed:\n\n' + e.message +
      '\n\nCheck Apps Script logs at script.google.com'
    );
  }
}

// ============================================================
// PERIOD BUILDER
// ============================================================
function buildPeriod(days, startDateOverride, endDateOverride) {
  var end   = new Date();
  var start = new Date();
  start.setDate(start.getDate() - days);

  if (startDateOverride) start = new Date(startDateOverride);
  if (endDateOverride)   end   = new Date(endDateOverride);

  return {
    days:      days,
    startDate: formatDate(start),
    endDate:   formatDate(end),
    startISO:  start.toISOString(),
    endISO:    end.toISOString(),
    label:     formatDisplayDate(start) + ' \u2013 ' + formatDisplayDate(end)
  };
}

// ============================================================
// DATE HELPERS
// ============================================================
function formatDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function formatDisplayDate(d) {
  var months = ['Jan','Feb','Mar','Apr','May','Jun',
                'Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

function formatNumber(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

// ============================================================
// GA4 — Google Analytics Data API
// ============================================================
function fetchGA4Data(period) {
  Logger.log('Fetching GA4 data for [your-domain].[your-domain.edu]... Period: ' + period.startDate + ' to ' + period.endDate);

  var props      = PropertiesService.getScriptProperties();
  var propertyId = props.getProperty('GA4_PROPERTY_ID');
  var token      = ScriptApp.getOAuthToken();

  var hostnameFilter = {
    filter: {
      fieldName: 'hostName',
      stringFilter: { matchType: 'EXACT', value: '[your-domain.edu]' }
    }
  };

  // Overall site metrics
  var overallBody = {
    dateRanges: [{ startDate: period.startDate, endDate: period.endDate }],
    metrics: [
      { name: 'sessions' },
      { name: 'newUsers' },
      { name: 'engagementRate' },
      { name: 'averageSessionDuration' },
      { name: 'screenPageViews' },
      { name: 'bounceRate' }
    ],
    dimensionFilter: hostnameFilter,
    limit: 1
  };

  var overallResp = ga4Request(propertyId, overallBody, token);

  if (!overallResp.rows) {
    Logger.log('No GA4 rows returned.');
    return getSampleGA4Data();
  }

  var c           = overallResp.rows[0].metricValues;
  var sessions    = parseInt(c[0].value);
  var newUsers    = parseInt(c[1].value);
  var engageRate  = Math.round(parseFloat(c[2].value) * 100);
  var avgDuration = parseInt(c[3].value);
  var pageViews   = parseInt(c[4].value);
  var bounceRate  = Math.round(parseFloat(c[5].value) * 100);
  var minutes     = Math.floor(avgDuration / 60);
  var seconds     = String(avgDuration % 60).padStart(2, '0');

  var topPages      = fetchGA4TopPages(propertyId, period, token, hostnameFilter);
  var monthlyTrend  = fetchGA4MonthlyTrend(propertyId, period.days, token, hostnameFilter);
  var deptBreakdown = fetchGA4DeptBreakdown(propertyId, period, token);
  var deptTrend     = fetchGA4DeptTrend(propertyId, period.days, token);
  var admissions    = fetchGA4FilteredPageViews(propertyId, period, token, hostnameFilter, ['admissions', 'prospective', 'apply']);

  return {
    sessions:         { value: formatNumber(sessions),   raw: sessions },
    newUsers:         { value: formatNumber(newUsers),    raw: newUsers },
    engagementRate:   { value: engageRate + '%',          raw: engageRate },
    avgDuration:      { value: minutes + ':' + seconds,   raw: avgDuration },
    pageViews:        { value: formatNumber(pageViews),   raw: pageViews },
    bounceRate:       { value: bounceRate + '%',          raw: bounceRate },
    admissionsVisits: { value: formatNumber(admissions),  raw: admissions },
    topPages:         topPages,
    monthlyTrend:     monthlyTrend,
    deptBreakdown:    deptBreakdown,
    deptTrend:        deptTrend
  };
}

function fetchGA4TopPages(propertyId, period, token, hostnameFilter) {
  var body = {
    dateRanges: [{ startDate: period.startDate, endDate: period.endDate }],
    metrics:    [{ name: 'screenPageViews' }],
    dimensions: [{ name: 'pagePath' }],
    dimensionFilter: hostnameFilter,
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 5
  };
  var resp = ga4Request(propertyId, body, token);
  if (!resp.rows) return [];
  return resp.rows.map(function(row) {
    return { path: row.dimensionValues[0].value, views: parseInt(row.metricValues[0].value) };
  });
}

// Monthly trend — adapts granularity to period length
function fetchGA4MonthlyTrend(propertyId, days, token, hostnameFilter) {
  var months = [];
  var labels = [];
  var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // For short periods use weeks, for long periods use months
  var buckets = days <= 30 ? Math.min(days, 7) : 6;
  var bucketDays = Math.ceil(days / buckets);

  for (var i = buckets - 1; i >= 0; i--) {
    var endD   = new Date();
    endD.setDate(endD.getDate() - (i * bucketDays));
    var startD = new Date(endD);
    startD.setDate(startD.getDate() - bucketDays + 1);

    var body = {
      dateRanges:      [{ startDate: formatDate(startD), endDate: formatDate(endD) }],
      metrics:         [{ name: 'sessions' }, { name: 'newUsers' }, { name: 'bounceRate' }],
      dimensionFilter: hostnameFilter,
      limit: 1
    };

    var resp = ga4Request(propertyId, body, token);
    var sessions   = resp.rows ? parseInt(resp.rows[0].metricValues[0].value) : 0;
    var newUsersV  = resp.rows ? parseInt(resp.rows[0].metricValues[1].value) : 0;
    var bounceV    = resp.rows ? Math.round(parseFloat(resp.rows[0].metricValues[2].value) * 100) : 0;
    months.push({ sessions: sessions, newUsers: newUsersV, bounceRate: bounceV });
    labels.push(days <= 30
      ? (startD.getMonth() + 1) + '/' + startD.getDate()
      : monthNames[endD.getMonth()]);
  }

  return { buckets: months, labels: labels };
}

function fetchGA4DeptBreakdown(propertyId, period, token) {
  var body = {
    dateRanges: [{ startDate: period.startDate, endDate: period.endDate }],
    metrics:    [{ name: 'sessions' }, { name: 'newUsers' }, { name: 'averageSessionDuration' }, { name: 'bounceRate' }],
    dimensions: [{ name: 'pagePath' }],
    dimensionFilter: {
      filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: '[your-domain.edu]' } }
    },
    limit: 500
  };

  var resp = ga4Request(propertyId, body, token);
  if (!resp.rows) return [];

  var results = [];
  DEPT_PATHS.forEach(function(dept) {
    var sessions = 0, newUsers = 0, totalDuration = 0, totalBounce = 0, count = 0;
    resp.rows.forEach(function(row) {
      var path = row.dimensionValues[0].value;
      if (path.indexOf(dept.path) === 0 || path === dept.path.replace(/\/$/, '')) {
        sessions      += parseInt(row.metricValues[0].value);
        newUsers      += parseInt(row.metricValues[1].value);
        totalDuration += parseFloat(row.metricValues[2].value);
        totalBounce   += parseFloat(row.metricValues[3].value);
        count++;
      }
    });
    var avgDur   = count > 0 ? Math.round(totalDuration / count) : 0;
    var avgBounce= count > 0 ? Math.round((totalBounce / count) * 100) : 0;
    results.push({
      name: dept.name, path: dept.path,
      sessions: sessions, newUsers: newUsers,
      avgDuration: avgDur, bounceRate: avgBounce
    });
  });

  results.sort(function(a, b) { return b.sessions - a.sessions; });
  return results;
}

// Per-department trend over time — for the line chart view
function fetchGA4DeptTrend(propertyId, days, token) {
  var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var buckets    = Math.min(6, Math.ceil(days / 30));
  var labels     = [];
  var deptData   = {};

  DEPT_PATHS.forEach(function(d) { deptData[d.name] = []; });

  for (var i = buckets - 1; i >= 0; i--) {
    var endD   = new Date();
    endD.setDate(endD.getDate() - (i * Math.ceil(days / buckets)));
    var startD = new Date(endD);
    startD.setDate(startD.getDate() - Math.ceil(days / buckets) + 1);
    labels.push(monthNames[endD.getMonth()]);

    var body = {
      dateRanges: [{ startDate: formatDate(startD), endDate: formatDate(endD) }],
      metrics:    [{ name: 'sessions' }],
      dimensions: [{ name: 'pagePath' }],
      dimensionFilter: {
        filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: '[your-domain.edu]' } }
      },
      limit: 500
    };

    var resp = ga4Request(propertyId, body, token);
    if (!resp.rows) {
      DEPT_PATHS.forEach(function(d) { deptData[d.name].push(0); });
      continue;
    }

    DEPT_PATHS.forEach(function(dept) {
      var total = 0;
      resp.rows.forEach(function(row) {
        var path = row.dimensionValues[0].value;
        if (path.indexOf(dept.path) === 0) total += parseInt(row.metricValues[0].value);
      });
      deptData[dept.name].push(total);
    });
  }

  return { labels: labels, departments: deptData };
}

function fetchGA4FilteredPageViews(propertyId, period, token, hostnameFilter, keywords) {
  var body = {
    dateRanges:      [{ startDate: period.startDate, endDate: period.endDate }],
    metrics:         [{ name: 'screenPageViews' }],
    dimensions:      [{ name: 'pagePath' }],
    dimensionFilter: hostnameFilter,
    limit: 200
  };
  var resp  = ga4Request(propertyId, body, token);
  if (!resp.rows) return 0;
  var total = 0;
  resp.rows.forEach(function(row) {
    var path = row.dimensionValues[0].value.toLowerCase();
    if (keywords.some(function(kw) { return path.indexOf(kw) !== -1; })) {
      total += parseInt(row.metricValues[0].value);
    }
  });
  return total;
}

function ga4Request(propertyId, body, token) {
  var url     = 'https://analyticsdata.googleapis.com/v1beta/properties/' + propertyId + ':runReport';
  var options = {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(body), muteHttpExceptions: true
  };
  var resp = UrlFetchApp.fetch(url, options);
  var data = JSON.parse(resp.getContentText());
  if (data.error) throw new Error('GA4 API error: ' + data.error.message);
  return data;
}

function getSampleGA4Data() {
  return {
    sessions: { value: '\u2014', raw: 0 }, newUsers: { value: '\u2014', raw: 0 },
    engagementRate: { value: '\u2014', raw: 0 }, avgDuration: { value: '\u2014', raw: 0 },
    pageViews: { value: '\u2014', raw: 0 }, bounceRate: { value: '\u2014', raw: 0 },
    admissionsVisits: { value: '\u2014', raw: 0 },
    topPages: [], monthlyTrend: { buckets: [], labels: [] },
    deptBreakdown: [], deptTrend: { labels: [], departments: {} }
  };
}

// ============================================================
// SITEIMPROVE — REST API (EU server)
// CONFIRMED: /dci/overview is the only reliable endpoint
// for scores on this account.
// ============================================================
function fetchSiteimproveData() {
  Logger.log('Fetching Siteimprove data for [your-domain].[your-domain.edu]...');

  var props    = PropertiesService.getScriptProperties();
  var username = props.getProperty('SI_USERNAME');
  var apiKey   = props.getProperty('SI_API_KEY');
  var siteId   = props.getProperty('SI_SITE_ID');
  var apiBase  = props.getProperty('SI_API_URL') || 'https://api.eu.siteimprove.com/v2';

  var credentials = Utilities.base64Encode(username + ':' + apiKey);
  var headers     = { 'Authorization': 'Basic ' + credentials, 'Accept': 'application/json' };
  var options     = { method: 'get', headers: headers, muteHttpExceptions: true };
  var base        = apiBase + '/sites/' + siteId;

  var dciResp = UrlFetchApp.fetch(base + '/dci/overview', options);
  Logger.log('DCI status: ' + dciResp.getResponseCode());
  var dciData = JSON.parse(dciResp.getContentText());

  var qaResp  = UrlFetchApp.fetch(base + '/quality_assurance/overview/summary', options);
  Logger.log('QA status: ' + qaResp.getResponseCode());
  var qaData  = JSON.parse(qaResp.getContentText());

  var accessScore = dciData.a11y  ? Math.round(dciData.a11y.aa    || dciData.a11y.total || 0) : 0;
  var seoScore    = dciData.seo   ? Math.round(dciData.seo.total  || 0) : 0;
  var mobileScore = dciData.seo   ? Math.round(dciData.seo.mobile || 0) : 0;
  var qaScore     = dciData.qa    ? Math.round(dciData.qa.total   || 0) : 0;
  var dciTotal    = dciData.total ? Math.round(dciData.total)            : 0;
  var brokenLinks = qaData.broken_links !== undefined ? qaData.broken_links : 0;
  var misspellings= qaData.misspellings !== undefined ? qaData.misspellings : 0;

  Logger.log('Scores — A11y (WCAG AA): ' + accessScore + ', SEO: ' + seoScore + ', QA: ' + qaScore + ', DCI: ' + dciTotal);

  return {
    scope:              '[your-domain].[your-domain.edu] (Cascade sites)',
    accessibilityScore: { value: String(accessScore), raw: accessScore },
    accessibilityAA:    { value: String(accessScore), raw: accessScore },
    accessibilityTotal: { value: String(Math.round(dciData.a11y ? dciData.a11y.total || 0 : 0)), raw: dciData.a11y ? Math.round(dciData.a11y.total || 0) : 0 },
    seoScore:           { value: String(seoScore),    raw: seoScore },
    mobileScore:        { value: String(mobileScore), raw: mobileScore },
    qaScore:            { value: String(qaScore),     raw: qaScore },
    dciTotal:           { value: String(dciTotal),    raw: dciTotal },
    brokenLinks:        { value: String(brokenLinks),  raw: brokenLinks },
    qualityIssues:      { value: String(misspellings), raw: misspellings }
  };
}

// ============================================================
// FRESHDESK — REST API v2
// CONFIRMED: [your-subdomain].freshdesk.com
// Auth: apikey: (apikey + empty password)
// Date: full ISO8601
// ============================================================
function fetchFreshdeskData(period) {
  Logger.log('Fetching Freshdesk data...');

  var props   = PropertiesService.getScriptProperties();
  var apiKey  = props.getProperty('FD_API_KEY');
  var email   = props.getProperty('FD_EMAIL');
  var baseUrl = props.getProperty('FD_BASE_URL');

  var credentials = Utilities.base64Encode(apiKey + ':');
  var headers     = { 'Authorization': 'Basic ' + credentials, 'Content-Type': 'application/json' };
  var options     = { method: 'get', headers: headers, muteHttpExceptions: true };
  var base        = baseUrl + '/api/v2';
  var sinceStr    = period ? period.startISO : new Date(Date.now() - 90*24*60*60*1000).toISOString();

  Logger.log('Fetching tickets since: ' + sinceStr);

  // Fetch up to 3 pages (300 tickets) to handle longer date ranges
  var tickets = [];
  var page = 1;
  var maxPages = 3;
  while (page <= maxPages) {
    var ticketsResp = UrlFetchApp.fetch(
      base + '/tickets?updated_since=' + sinceStr + '&per_page=100&page=' + page + '&include=stats',
      options
    );
    Logger.log('Tickets page ' + page + ' status: ' + ticketsResp.getResponseCode());
    var pageTickets = JSON.parse(ticketsResp.getContentText());
    if (!Array.isArray(pageTickets)) {
      if (page === 1) throw new Error('Freshdesk API error: ' + (pageTickets.message || 'unexpected response'));
      break;
    }
    tickets = tickets.concat(pageTickets);
    if (pageTickets.length < 100) break; // no more pages
    page++;
  }
  Logger.log('Total tickets fetched: ' + tickets.length);

  var totalTickets   = tickets.length;
  var resolved       = tickets.filter(function(t) { return t.status === 4 || t.status === 5; }).length;
  var resolutionRate = totalTickets > 0 ? Math.round((resolved / totalTickets) * 100) : 0;

  var responseTimes = tickets
    .filter(function(t) { return t.stats && t.stats.first_responded_at && t.created_at; })
    .map(function(t) {
      return (new Date(t.stats.first_responded_at) - new Date(t.created_at)) / (1000 * 60 * 60);
    });

  var avgResponseTime = responseTimes.length > 0
    ? (responseTimes.reduce(function(a,b){return a+b;},0) / responseTimes.length).toFixed(1)
    : 'N/A';

  // Department breakdown from ticket subject/email — extract dept name from to_emails or group
  var deptCounts = {};
  tickets.forEach(function(t) {
    var dept = extractDeptFromTicket(t);
    if (dept) deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });
  var deptBreakdown = Object.keys(deptCounts)
    .map(function(k) { return { name: k, count: deptCounts[k] }; })
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, 10);

  // Ticket trend over time — group by week
  var trendBuckets = buildTicketTrend(tickets, period);

  // CSAT
  var csatScore = 'N/A';
  try {
    var csatResp = UrlFetchApp.fetch(
      base + '/surveys/satisfaction_ratings?updated_since=' + sinceStr + '&per_page=100',
      options
    );
    if (csatResp.getResponseCode() === 200) {
      var csatData = JSON.parse(csatResp.getContentText());
      if (Array.isArray(csatData) && csatData.length > 0) {
        var satisfied = csatData.filter(function(r) {
          return r.rating === 'happy' || r.rating === 'neutral';
        }).length;
        csatScore = Math.round((satisfied / csatData.length) * 100) + '%';
      }
    }
  } catch(e) { Logger.log('CSAT skipped: ' + e.message); }

  return {
    ticketVolume:    { value: String(totalTickets),  raw: totalTickets },
    resolutionRate:  { value: resolutionRate + '%',  raw: resolutionRate },
    avgResponseTime: { value: avgResponseTime + 'h', raw: avgResponseTime },
    csatScore:       { value: csatScore,             raw: csatScore },
    deptBreakdown:   deptBreakdown,
    ticketTrend:     trendBuckets
  };
}

// Extract department name from Freshdesk ticket
function extractDeptFromTicket(ticket) {
  // Try subject line first — many tickets include dept name
  var subject = (ticket.subject || '').toLowerCase();
  for (var i = 0; i < DEPT_PATHS.length; i++) {
    var deptLower = DEPT_PATHS[i].name.toLowerCase();
    var keywords  = deptLower.split(' ');
    // Match on the most distinctive keyword (skip short words)
    for (var j = 0; j < keywords.length; j++) {
      if (keywords[j].length > 4 && subject.indexOf(keywords[j]) !== -1) {
        return DEPT_PATHS[i].name;
      }
    }
  }
  // Fall back to requester email domain hints
  return 'Other / Unclassified';
}

// Build weekly ticket volume buckets for trend chart
function buildTicketTrend(tickets, period) {
  var days    = period ? period.days : 90;
  var buckets = Math.min(12, Math.ceil(days / 7));
  var result  = [];
  var now     = new Date();

  for (var i = buckets - 1; i >= 0; i--) {
    var bucketEnd   = new Date(now);
    bucketEnd.setDate(bucketEnd.getDate() - (i * 7));
    var bucketStart = new Date(bucketEnd);
    bucketStart.setDate(bucketStart.getDate() - 7);

    var count = tickets.filter(function(t) {
      var created = new Date(t.created_at);
      return created >= bucketStart && created <= bucketEnd;
    }).length;

    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    result.push({
      label: monthNames[bucketEnd.getMonth()] + ' ' + bucketEnd.getDate(),
      count: count
    });
  }
  return result;
}

// ============================================================
// ============================================================
// MICROSOFT CLARITY — Data Export API
// Docs: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
// Auth: Bearer token (store in CLARITY_TOKEN script property)
// Project ID: [YOUR_CLARITY_PROJECT_ID] (store in CLARITY_PROJECT)
//
// CONFIRMED ENDPOINT (Nov 2024 docs):
//   GET https://www.clarity.ms/export-data/api/v1/project-live-insights
//   Params: numOfDays (1, 2, or 3 only — API limitation)
//           dimension1, dimension2, dimension3 (optional)
//
// IMPORTANT LIMITATIONS:
//   - Max 3 days of data per request (API hard limit)
//   - Max 10 requests per project per day
//   - Data has ~48 hour delay for new projects
//   - Only sessions/recordings data, not page-level breakdown
// ============================================================
function fetchClarityData(period) {
  Logger.log('Fetching Microsoft Clarity data...');

  var props     = PropertiesService.getScriptProperties();
  var token     = props.getProperty('CLARITY_TOKEN');
  var projectId = props.getProperty('CLARITY_PROJECT') || '[YOUR_CLARITY_PROJECT_ID]';

  if (!token) {
    Logger.log('CLARITY_TOKEN not set — returning empty Clarity data');
    return getClarityPlaceholder('Token not configured. Add CLARITY_TOKEN to Script Properties.');
  }

  // Clarity API only supports 1, 2, or 3 days — always use 3 for max data
  // projectId is REQUIRED — without it the API returns 404
  var numOfDays = 3;

  var url = 'https://www.clarity.ms/export-data/api/v1/project-live-insights' +
    '?projectId=' + projectId +
    '&numOfDays=' + numOfDays +
    '&dimension1=Browser' +
    '&dimension2=Device';

  var headers = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  };
  var options = { method: 'get', headers: headers, muteHttpExceptions: true };

  try {
    Logger.log('Clarity URL: ' + url);
    var resp = UrlFetchApp.fetch(url, options);
    Logger.log('Clarity status: ' + resp.getResponseCode());
    Logger.log('Clarity body: ' + resp.getContentText().substring(0, 400));

    if (resp.getResponseCode() === 401) {
      return getClarityPlaceholder('Authentication failed. Regenerate CLARITY_TOKEN in Script Properties.');
    }
    if (resp.getResponseCode() === 404) {
      return getClarityPlaceholder('Endpoint not found. Check Clarity API documentation for current URL.');
    }
    if (resp.getResponseCode() !== 200) {
      return getClarityPlaceholder('API returned status ' + resp.getResponseCode() + '. ' + resp.getContentText().substring(0, 200));
    }

    var data = JSON.parse(resp.getContentText());
    Logger.log('Clarity data length: ' + (Array.isArray(data) ? data.length : 'not array'));
    if (Array.isArray(data) && data.length > 0) {
      Logger.log('First metricName: ' + data[0].metricName);
      Logger.log('First info rows: ' + (data[0].information ? data[0].information.length : 0));
    }

    var totalSessions = 0, totalDeadClicks = 0, totalPages = 0;

    // API returns array of metric blocks, each with an information array
    // Each information row = one dimension combo (e.g. Chrome/Mobile)
    // sessionsCount in each row = sessions for that dimension combo
    // Sum across all rows of first metric block = total unique sessions
    if (Array.isArray(data) && data.length > 0) {
      // Use first metric block to get session totals (sessionsCount is same across metric blocks)
      var firstBlock = data[0];
      var info = firstBlock.information || [];
      info.forEach(function(row) {
        totalSessions   += parseInt(row.sessionsCount || '0');
        totalDeadClicks += parseInt(row.subTotal      || '0');
        totalPages      += parseInt(row.pagesViews    || '0');
      });
    }

    var deadClickRate = totalSessions > 0 ? Math.round((totalDeadClicks / totalSessions) * 100) : 0;
    Logger.log('Clarity parsed — sessions: ' + totalSessions + ', dead clicks: ' + totalDeadClicks + ', pages: ' + totalPages);

    return {
      status:        'active',
      hasData:       totalSessions > 0,
      dataWindow:    'Last ' + numOfDays + ' days (API limit)',
      totalSessions: { value: formatNumber(totalSessions),   raw: totalSessions },
      uniqueUsers:   { value: '\u2014',                      raw: 0 },
      scrollDepth:   { value: '\u2014',                      raw: 0 },
      deadClicks:    { value: formatNumber(totalDeadClicks), raw: totalDeadClicks },
      deadClickRate: { value: deadClickRate + '%',           raw: deadClickRate },
      rageClicks:    { value: '\u2014',                      raw: 0 },
      recordings:    { value: '\u2014',                      raw: 0 },
      pageViews:     { value: formatNumber(totalPages),      raw: totalPages },
      topPages:      [],
      rawData:       data ? (data[0] ? (data[0].information || []).slice(0,3) : []) : []
    };

  } catch (e) {
    Logger.log('Clarity error: ' + e.message);
    return getClarityPlaceholder('Error: ' + e.message);
  }
}

function getClarityPlaceholder(reason) {
  return {
    status:        'pending',
    hasData:       false,
    reason:        reason,
    totalSessions: { value: '\u2014', raw: 0 },
    uniqueUsers:   { value: '\u2014', raw: 0 },
    scrollDepth:   { value: '\u2014', raw: 0 },
    deadClicks:    { value: '\u2014', raw: 0 },
    rageClicks:    { value: '\u2014', raw: 0 },
    recordings:    { value: '\u2014', raw: 0 },
    topPages:      []
  };
}

// ============================================================
// GITHUB — Write any file to the GitHub Pages repo
// ============================================================
function writeFileToGitHub(filename, jsonString) {
  Logger.log('Writing ' + filename + ' to GitHub...');

  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('GITHUB_TOKEN');
  var repo  = props.getProperty('GITHUB_REPO');

  if (!token || !repo) {
    Logger.log('GitHub credentials not set — skipping write.');
    return;
  }

  var url     = 'https://api.github.com/repos/' + repo + '/contents/' + filename;
  var getResp = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' },
    muteHttpExceptions: true
  });

  var sha = null;
  if (getResp.getResponseCode() === 200) {
    sha = JSON.parse(getResp.getContentText()).sha;
  }

  var body = {
    message: 'Auto-update ' + filename + ' \u2014 ' + new Date().toISOString(),
    content: Utilities.base64Encode(jsonString),
    branch:  'main'
  };
  if (sha) body.sha = sha;

  var putResp = UrlFetchApp.fetch(url, {
    method: 'put',
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  Logger.log(filename + ' write status: ' + putResp.getResponseCode());

  if (putResp.getResponseCode() !== 200 && putResp.getResponseCode() !== 201) {
    throw new Error('GitHub write failed for ' + filename + ': ' + putResp.getContentText());
  }
  Logger.log(filename + ' successfully written to GitHub.');
}

// Keep old name as alias so nothing else breaks
function writeToGitHub(jsonString) {
  writeFileToGitHub('data.json', jsonString);
}

// ============================================================
// TRIGGER SETUP — run once manually
// ============================================================
function createDailyTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'fetchAllData') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger('fetchAllData')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .inTimezone('America/Chicago')
    .create();
  Logger.log('Daily trigger created. fetchAllData runs at 6am Central every day.');
}

// ============================================================
// BUILD EMAIL HTML WITH EDITS FROM MODAL
// Called by doGet when action=sendWeeklyBrief
// ============================================================
function buildEmailHTMLWithEdits(week, trend30, si, wowSessions, wowTickets,
                                  period, paragraph, priorityLines, note,
                                  weekGA4, weekFD, fmt, fmtDur, arrow, arrowColor) {
  var d = new Date();
  var dayNames   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var dateLabel  = dayNames[d.getDay()] + ', ' + monthNames[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  var periodLabel = period.startDate + ' \u2014 ' + period.endDate;
  var MAROON='#500000'; var GRAY_BG='#f4f4f4'; var GRAY_BDR='#dddddd';
  var GRAY_TXT='#444444'; var GRAY_LT='#888888'; var WHITE='#ffffff';
  var GREEN='#1a7a3f'; var RED='#c0392b'; var AMBER='#b07800';

  // Delegate to the full email builder with the edited content
  // Reuse buildEmailHTML but override the brief and priorities
  return buildEmailHTML(
    week, trend30, si, wowSessions, wowTickets,
    period, paragraph, weekGA4, weekFD, fmt, fmtDur, arrow, arrowColor,
    priorityLines, note
  );
}


// ============================================================
// WEEKLY EMAIL BRIEF
// Sends every Monday at 9am CT to WEEKLY_RECIPIENTS
// (comma-separated list in Script Properties)
//
// Add WEEKLY_RECIPIENTS to Script Properties:
//   Key: WEEKLY_RECIPIENTS
//   Value: email1@[your-domain.edu],email2@[your-domain.edu]
//
// Run createWeeklyEmailTrigger() once to schedule it.
// Run sendWeeklyBrief() manually to test anytime.
// ============================================================

function createWeeklyEmailTrigger() {
  // Remove any existing weekly email triggers
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sendWeeklyBrief') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // Schedule every Monday at 9am Central
  ScriptApp.newTrigger('sendWeeklyBrief')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .inTimezone('America/Chicago')
    .create();
  Logger.log('Weekly email trigger created — sends every Monday at 9am CT.');
}

// ============================================================
// MAIN EMAIL FUNCTION
// ============================================================
function sendWeeklyBrief() {
  Logger.log('Starting weekly brief...');

  var props      = PropertiesService.getScriptProperties();
  var recipients = props.getProperty('WEEKLY_RECIPIENTS') || Session.getActiveUser().getEmail();

  // ── 1. Fresh 7-day data from APIs ──────────────────────────
  var weekPeriod = buildPeriod(7, null, null);
  Logger.log('Fetching 7-day data for week: ' + weekPeriod.startDate + ' to ' + weekPeriod.endDate);

  var weekGA4 = fetchGA4Data(weekPeriod);
  var weekFD  = fetchFreshdeskData(weekPeriod);

  // ── 2. Trend context from GitHub data-30.json ──────────────
  var trendData  = null;
  var githubRepo = props.getProperty('GITHUB_REPO');
  if (githubRepo) {
    try {
      var ghUrl  = 'https://raw.githubusercontent.com/' + githubRepo + '/main/data-30.json';
      var ghResp = UrlFetchApp.fetch(ghUrl, { muteHttpExceptions: true });
      if (ghResp.getResponseCode() === 200) {
        trendData = JSON.parse(ghResp.getContentText());
        Logger.log('Loaded 30-day trend context from GitHub');
      }
    } catch(e) {
      Logger.log('Could not load trend data: ' + e.message);
    }
  }

  // ── 3. Siteimprove scores (don't change daily, reuse) ──────
  var siScores = null;
  if (trendData && trendData.siteimprove) {
    siScores = trendData.siteimprove;
  } else {
    siScores = fetchSiteimproveData();
  }

  // ── 4. Build metric objects ─────────────────────────────────
  var week = {
    sessions:       weekGA4.sessions        ? weekGA4.sessions.raw        : 0,
    newUsers:       weekGA4.newUsers         ? weekGA4.newUsers.raw         : 0,
    engagementRate: weekGA4.engagementRate   ? weekGA4.engagementRate.raw   : 0,
    avgDuration:    weekGA4.avgDuration      ? weekGA4.avgDuration.raw      : 0,
    bounceRate:     weekGA4.bounceRate       ? weekGA4.bounceRate.raw       : 0,
    tickets:        weekFD.ticketVolume      ? weekFD.ticketVolume.raw      : 0,
    resolutionRate: weekFD.resolutionRate    ? weekFD.resolutionRate.raw    : 0,
    responseTime:   weekFD.avgResponseTime   ? weekFD.avgResponseTime.raw   : 'N/A',
    topDept:        weekGA4.deptBreakdown && weekGA4.deptBreakdown[0] ? weekGA4.deptBreakdown[0].name : null,
    topDeptSessions:weekGA4.deptBreakdown && weekGA4.deptBreakdown[0] ? weekGA4.deptBreakdown[0].sessions : 0
  };

  var trend30 = {};
  if (trendData && trendData.ga4) {
    trend30 = {
      sessions:       trendData.ga4.sessions        ? trendData.ga4.sessions.raw        : 0,
      newUsers:       trendData.ga4.newUsers         ? trendData.ga4.newUsers.raw         : 0,
      engagementRate: trendData.ga4.engagementRate   ? trendData.ga4.engagementRate.raw   : 0,
      tickets:        trendData.freshdesk && trendData.freshdesk.ticketVolume ? trendData.freshdesk.ticketVolume.raw : 0
    };
  }

  var si = {
    accessibility: siScores && siScores.accessibilityScore ? siScores.accessibilityScore.raw : 0,
    seo:           siScores && siScores.seoScore            ? siScores.seoScore.raw            : 0,
    mobile:        siScores && siScores.mobileScore         ? siScores.mobileScore.raw         : 0,
    dci:           siScores && siScores.dciTotal            ? siScores.dciTotal.raw            : 0,
    brokenLinks:   siScores && siScores.brokenLinks         ? siScores.brokenLinks.raw         : 0
  };

  // ── 5. WoW change calculations ──────────────────────────────
  // Approximate prior week = (30-day total - 7-day total) / (30/7 - 1)
  function wowPct(weekVal, month30Val) {
    if (!weekVal || !month30Val) return null;
    var priorWeekApprox = (month30Val - weekVal) / (30/7 - 1);
    if (priorWeekApprox <= 0) return null;
    return Math.round(((weekVal - priorWeekApprox) / priorWeekApprox) * 100);
  }

  var wowSessions = wowPct(week.sessions, trend30.sessions);
  var wowTickets  = wowPct(week.tickets,  trend30.tickets);

  // ── 6. Format helpers ───────────────────────────────────────
  function fmt(n) {
    if (!n || n === 0) return '—';
    return n >= 1000 ? (n/1000).toFixed(1) + 'k' : String(n);
  }
  function fmtDur(s) {
    if (!s) return '—';
    return Math.floor(s/60) + ':' + String(Math.round(s%60)).padStart(2,'0');
  }
  function arrow(pct, higherIsBetter) {
    if (pct === null) return '';
    var up = higherIsBetter ? pct > 0 : pct < 0;
    var sym = pct > 0 ? '▲' : '▼';
    var abs = Math.abs(pct);
    return sym + ' ' + abs + '%';
  }
  function arrowColor(pct, higherIsBetter) {
    if (pct === null) return '#666666';
    var good = higherIsBetter ? pct >= 0 : pct <= 0;
    return good ? '#1a7a3f' : '#c0392b';
  }

  // ── 7. AI-generated brief paragraph ────────────────────────
  var aiBrief = generateWeeklyAIBrief(week, trend30, si, weekPeriod);

  // ── 8. Build and send email ─────────────────────────────────
  var subject  = buildEmailSubject(week, wowSessions);
  var htmlBody = buildEmailHTML(week, trend30, si, wowSessions, wowTickets,
                                weekPeriod, aiBrief, weekGA4, weekFD, fmt, fmtDur, arrow, arrowColor);

  var recipientList = recipients.split(',').map(function(r){ return r.trim(); });

  recipientList.forEach(function(recipient) {
    MailApp.sendEmail({
      to:       recipient,
      subject:  subject,
      htmlBody: htmlBody,
      name:     '[Your Unit] Web Team'
    });
  });

  Logger.log('Weekly brief sent to: ' + recipients);
}

// ============================================================
// AI BRIEF — calls Claude API for a one-paragraph summary
// ============================================================
function generateWeeklyAIBrief(week, trend30, si, period) {
  try {
    var prompt = 'You are writing the opening paragraph of a Monday morning web team brief for the [Your College/Unit] at [Your University]. ' +
      'The audience is a mix of leadership (deans, chairs) and web/MarComm staff. ' +
      'Write exactly one paragraph, 3-4 sentences. Journalistic tone — open with the most notable number or trend, build to what it means for the College, end with one forward-looking note. ' +
      'Be specific. No jargon. No bullet points. No greeting, no sign-off — just the paragraph. ' +
      'Do not start with "This week" — find a more compelling opening.\n\n' +
      'CRITICAL: All metrics below are for the 7-day period ' + period.startDate + ' to ' + period.endDate + '. ' +
      'You MUST refer to this as "this week", "the past 7 days", or "the week of ' + period.startDate + '". ' +
      'NEVER say "90 days", "last 90 days", "this period", or any other time frame. Only "this week" or "7 days".\n\n' +
      '7-day data (' + period.startDate + ' to ' + period.endDate + '):\n' +
      '- Sessions this week: ' + (week.sessions || 0) + '\n' +
      '- New users this week: ' + (week.newUsers || 0) + '\n' +
      '- Engagement rate: ' + (week.engagementRate || 0) + '%\n' +
      '- Avg session duration: ' + (week.avgDuration ? Math.floor(week.avgDuration/60) + ':' + String(Math.round(week.avgDuration%60)).padStart(2,'0') : 'N/A') + '\n' +
      '- Freshdesk tickets this week: ' + (week.tickets || 0) + '\n' +
      '- Resolution rate: ' + (week.resolutionRate || 0) + '%\n' +
      '- Top department by traffic: ' + (week.topDept || 'N/A') + ' (' + (week.topDeptSessions || 0) + ' sessions)\n' +
      '- Siteimprove accessibility score: ' + (si.accessibility || 0) + ' (peer avg: 85, does not change weekly)\n' +
      '- Siteimprove SEO score: ' + (si.seo || 0) + ' (peer avg: 85, does not change weekly)\n' +
      '- Mobile score: ' + (si.mobile || 0) + ' (target: 70, does not change weekly)\n' +
      '- Broken links: ' + (si.brokenLinks || 0) + ' (does not change weekly)\n\n' +
      'Background context (do NOT cite these as this week\'s numbers):\n' +
      '- 30-day total sessions: ' + (trend30.sessions || 0) + ' (for week-over-week context only)\n' +
      '- 30-day total tickets: ' + (trend30.tickets || 0) + ' (for week-over-week context only)';

    var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY') || '' },
      payload: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 200,
        messages:   [{ role: 'user', content: prompt }]
      }),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() === 200) {
      var data = JSON.parse(response.getContentText());
      return data.content && data.content[0] ? data.content[0].text.trim() : null;
    }
    Logger.log('AI brief API returned: ' + response.getResponseCode());
    return null;
  } catch(e) {
    Logger.log('AI brief error: ' + e.message);
    return null;
  }
}

// ============================================================
// EMAIL SUBJECT LINE — changes based on data
// ============================================================
function buildEmailSubject(week, wowSessions) {
  var d = new Date();
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var dateStr = months[d.getMonth()] + ' ' + d.getDate();

  // Subject varies based on the most notable signal
  if (wowSessions !== null && wowSessions >= 10) {
    return 'COAS Web Brief - ' + dateStr + ' - Traffic up ' + wowSessions + '% WoW';
  }
  if (wowSessions !== null && wowSessions <= -10) {
    return 'COAS Web Brief - ' + dateStr + ' - Traffic dip worth watching';
  }
  if (week.tickets > 30) {
    return 'COAS Web Brief - ' + dateStr + ' - High support volume this week';
  }
  return 'COAS Web Brief - ' + dateStr;
}

// ============================================================
// EMAIL HTML BUILDER
// Outlook-safe: table layouts, inline styles only,
// no CSS variables, no flexbox, max-width 600px
// ============================================================
function buildEmailHTML(week, trend30, si, wowSessions, wowTickets,
                        period, aiBrief, weekGA4, weekFD, fmt, fmtDur, arrow, arrowColor,
                        priorityOverride, noteOverride) {

  var d = new Date();
  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var dateLabel = days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  var periodLabel = period.startDate + ' — ' + period.endDate;

  // Fallback brief if AI didn't run
  var brief = aiBrief ||
    'The COAS websites recorded ' + fmt(week.sessions) + ' sessions this week with a ' + week.engagementRate + '% engagement rate. ' +
    'The web team handled ' + week.tickets + ' support requests, resolving ' + week.resolutionRate + '% of them. ' +
    'Siteimprove scores remain at ' + si.accessibility + ' (accessibility) and ' + si.seo + ' (SEO) — both within range of the 85 peer average.';

  // Color palette — all hex, no variables
  var MAROON   = '#500000';
  var MAROON_L = '#7a0000';
  var GRAY_BG  = '#f4f4f4';
  var GRAY_BDR = '#dddddd';
  var GRAY_TXT = '#444444';
  var GRAY_LT  = '#888888';
  var WHITE    = '#ffffff';
  var GREEN    = '#1a7a3f';
  var RED      = '#c0392b';
  var AMBER    = '#b07800';

  // KPI stat cell builder
  function kpi(label, value, note, noteColor) {
    noteColor = noteColor || GRAY_LT;
    return '<td style="width:25%;padding:12px 10px;text-align:center;border-right:1px solid ' + GRAY_BDR + ';">' +
      '<div style="font-family:Georgia,serif;font-size:26px;font-weight:bold;color:' + MAROON + ';line-height:1;margin-bottom:4px;">' + value + '</div>' +
      '<div style="font-family:Arial,sans-serif;font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:0.08em;color:' + GRAY_TXT + ';margin-bottom:3px;">' + label + '</div>' +
      (note ? '<div style="font-family:Arial,sans-serif;font-size:10px;color:' + noteColor + ';">' + note + '</div>' : '') +
      '</td>';
  }

  // Section header builder
  function secHead(title, subtitle) {
    return '<tr><td colspan="4" style="padding:18px 20px 6px;background:' + WHITE + ';">' +
      '<div style="font-family:Arial,sans-serif;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.1em;color:' + MAROON + ';border-bottom:2px solid ' + MAROON + ';padding-bottom:6px;margin-bottom:2px;">' + title + '</div>' +
      (subtitle ? '<div style="font-family:Arial,sans-serif;font-size:12px;color:' + GRAY_LT + ';margin-top:3px;">' + subtitle + '</div>' : '') +
      '</td></tr>';
  }

  // Top departments table rows
  var deptRows = '';
  if (weekGA4.deptBreakdown && weekGA4.deptBreakdown.length) {
    var topDepts = weekGA4.deptBreakdown.slice(0, 5);
    var maxSess  = topDepts[0].sessions || 1;
    topDepts.forEach(function(dept, i) {
      var barWidth = Math.round((dept.sessions / maxSess) * 120);
      var bg = i % 2 === 0 ? WHITE : GRAY_BG;
      deptRows += '<tr style="background:' + bg + ';">' +
        '<td style="font-family:Arial,sans-serif;font-size:12px;color:' + GRAY_TXT + ';padding:6px 12px;border-bottom:1px solid ' + GRAY_BDR + ';">' + dept.name + '</td>' +
        '<td style="padding:6px 12px;border-bottom:1px solid ' + GRAY_BDR + ';">' +
          '<table cellpadding="0" cellspacing="0" border="0"><tr>' +
            '<td style="background:' + MAROON + ';height:8px;width:' + barWidth + 'px;font-size:0;">&nbsp;</td>' +
            '<td style="font-family:Arial,sans-serif;font-size:11px;color:' + GRAY_TXT + ';padding-left:6px;">' + fmt(dept.sessions) + '</td>' +
          '</tr></table>' +
        '</td>' +
        '<td style="font-family:Arial,sans-serif;font-size:11px;color:' + GRAY_LT + ';padding:6px 12px;border-bottom:1px solid ' + GRAY_BDR + ';text-align:right;">' + dept.bounceRate + '% bounce</td>' +
      '</tr>';
    });
  }

  // Freshdesk dept breakdown rows
  var fdDeptRows = '';
  if (weekFD.deptBreakdown && weekFD.deptBreakdown.length) {
    weekFD.deptBreakdown.slice(0, 5).forEach(function(dept, i) {
      var bg = i % 2 === 0 ? WHITE : GRAY_BG;
      fdDeptRows += '<tr style="background:' + bg + ';">' +
        '<td style="font-family:Arial,sans-serif;font-size:12px;color:' + GRAY_TXT + ';padding:5px 12px;border-bottom:1px solid ' + GRAY_BDR + ';">' + dept.name + '</td>' +
        '<td style="font-family:Arial,sans-serif;font-size:12px;font-weight:bold;color:' + MAROON + ';padding:5px 12px;border-bottom:1px solid ' + GRAY_BDR + ';text-align:right;">' + dept.count + '</td>' +
      '</tr>';
    });
  }

  // Score bar for email (table-based, Outlook safe)
  function scoreBar(label, score, peerAvg, excellence) {
    var pct        = Math.round(Math.min(score, 100));
    var peerPct    = peerAvg;
    var excPct     = excellence;
    var scoreColor = score >= excellence ? GREEN : score >= peerAvg ? AMBER : RED;
    var statusTxt  = score >= excellence ? '&#9650; Top 5%' : score >= peerAvg ? 'At peer avg' : (peerAvg - score) + ' below peer avg';
    return '<tr><td colspan="4" style="padding:4px 20px 10px;">' +
      '<table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' +
        '<td style="font-family:Arial,sans-serif;font-size:11px;font-weight:bold;color:' + GRAY_TXT + ';width:140px;">' + label + '</td>' +
        '<td style="padding:0 10px;">' +
          '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#e8e8e8;height:10px;">' +
            '<tr><td style="background:' + MAROON + ';width:' + pct + '%;height:10px;font-size:0;">&nbsp;</td>' +
            '<td style="height:10px;font-size:0;">&nbsp;</td></tr>' +
          '</table>' +
          '<table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' +
            '<td style="font-family:Arial,sans-serif;font-size:9px;color:' + GRAY_LT + ';width:' + peerPct + '%;">&nbsp;</td>' +
            '<td style="font-family:Arial,sans-serif;font-size:9px;color:' + GRAY_LT + ';">&#9474;' + peerPct + '</td>' +
            '<td></td>' +
          '</tr></table>' +
        '</td>' +
        '<td style="font-family:Georgia,serif;font-size:20px;font-weight:bold;color:' + scoreColor + ';width:44px;text-align:right;">' + score + '</td>' +
        '<td style="font-family:Arial,sans-serif;font-size:10px;color:' + scoreColor + ';width:90px;padding-left:6px;">' + statusTxt + '</td>' +
      '</tr></table>' +
    '</td></tr>';
  }

  // Recommendations — use override from modal if provided, otherwise auto-generate
  var recs = [];
  if (priorityOverride && priorityOverride.length) {
    // Use edited priorities from modal
    recs = priorityOverride.map(function(line) {
      var isRed   = line.indexOf('\uD83D\uDD34') !== -1 || line.indexOf('🔴') !== -1;
      var isGreen = line.indexOf('\u2705')       !== -1;
      return { color: isRed ? RED : isGreen ? GREEN : AMBER, text: line.replace(/^[\s\S]{1,2}\s/, '') };
    });
  } else {
    // Auto-generate from thresholds
    if (si.brokenLinks > 100) recs.push({ color: RED,   text: 'Broken links (' + si.brokenLinks + ') are above the critical threshold of 100. Prioritize a fix sprint this week.' });
    else if (si.brokenLinks > 20) recs.push({ color: AMBER, text: si.brokenLinks + ' broken links detected. Schedule a fix before count grows.' });
    if (si.accessibility < 80)  recs.push({ color: RED,   text: 'Accessibility score (' + si.accessibility + ') is below 80 — ADA Title II compliance risk. Escalate to department editors.' });
    else if (si.accessibility < 85) recs.push({ color: AMBER, text: 'Accessibility at ' + si.accessibility + ', just below the 85 peer average. One sprint could close this gap.' });
    if (si.mobile < 60)         recs.push({ color: RED,   text: 'Mobile score (' + si.mobile + ') is critically low. Mobile-first visitors — including prospective students — are getting a poor experience.' });
    else if (si.mobile < 70)    recs.push({ color: AMBER, text: 'Mobile score (' + si.mobile + ') is below the 70 target. Worth a focused review.' });
    if (week.engagementRate < 40) recs.push({ color: AMBER, text: 'Engagement rate (' + week.engagementRate + '%) is well below the 50% higher ed average. Review top landing pages for clarity and CTAs.' });
    if (weekFD.resolutionRate && weekFD.resolutionRate.raw < 70) recs.push({ color: AMBER, text: 'Resolution rate (' + week.resolutionRate + '%) dipped this week. Review open tickets for blockers.' });
    if (recs.length === 0) recs.push({ color: GREEN, text: 'No critical issues this week. All key metrics are within acceptable range. Good week to focus on proactive content improvements.' });
  }

  var recRows = recs.map(function(r) {
    return '<tr><td colspan="4" style="padding:3px 20px;">' +
      '<table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' +
        '<td style="width:4px;background:' + r.color + ';font-size:0;">&nbsp;</td>' +
        '<td style="font-family:Arial,sans-serif;font-size:12px;color:' + GRAY_TXT + ';padding:7px 10px;background:' + GRAY_BG + ';border-bottom:2px solid ' + WHITE + ';">' + r.text + '</td>' +
      '</tr></table>' +
    '</td></tr>';
  }).join('');

  var wowSessionsStr = wowSessions !== null ? arrow(wowSessions, true) + ' vs prior week' : '30-day trend';
  var wowSessionsColor = arrowColor(wowSessions, true);
  var footerNote = noteOverride || '';

  var html =
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
    '<html xmlns="http://www.w3.org/1999/xhtml"><head>' +
    '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0"/>' +
    '<title>COAS Web Brief</title>' +
    '</head><body style="margin:0;padding:0;background-color:' + GRAY_BG + ';font-family:Arial,sans-serif;">' +

    // Outer wrapper
    '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:' + GRAY_BG + ';">' +
    '<tr><td align="center" style="padding:24px 12px;">' +

    // Email container
    '<table cellpadding="0" cellspacing="0" border="0" width="600" style="background-color:' + WHITE + ';border:1px solid ' + GRAY_BDR + ';">' +

    // ── HEADER ──────────────────────────────────────────────────
    '<tr><td style="background-color:' + MAROON + ';padding:22px 24px;">' +
      '<table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' +
        '<td>' +
          '<div style="font-family:Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#d1a0a0;margin-bottom:4px;">Texas A&amp;M University &bull; College of Arts &amp; Sciences</div>' +
          '<div style="font-family:Georgia,serif;font-size:22px;font-weight:bold;color:' + WHITE + ';line-height:1.2;">COAS Web Team<br/>Monday Brief</div>' +
        '</td>' +
        '<td align="right" valign="top">' +
          '<div style="font-family:Arial,sans-serif;font-size:11px;color:#d1a0a0;text-align:right;line-height:1.5;">' + dateLabel + '<br/>' +
          '<span style="font-size:10px;color:#a07070;">Week of ' + periodLabel + '</span></div>' +
        '</td>' +
      '</tr></table>' +
    '</td></tr>' +

    // ── AI BRIEF ────────────────────────────────────────────────
    '<tr><td style="padding:18px 24px 12px;border-bottom:1px solid ' + GRAY_BDR + ';">' +
      '<p style="font-family:Georgia,serif;font-size:14px;line-height:1.75;color:' + GRAY_TXT + ';margin:0;">' + brief + '</p>' +
    '</td></tr>' +

    // ── TRAFFIC THIS WEEK ────────────────────────────────────────
    '<tr><td style="padding:0;">' +
    '<table cellpadding="0" cellspacing="0" border="0" width="100%">' +
      secHead('Traffic &mdash; This Week', periodLabel) +
      '<tr style="background:' + GRAY_BG + ';border-bottom:1px solid ' + GRAY_BDR + ';">' +
        kpi('Sessions',       fmt(week.sessions),       wowSessionsStr,                                     wowSessionsColor) +
        kpi('New Visitors',   fmt(week.newUsers),        'Discovering COAS',                                GRAY_LT) +
        kpi('Engagement Rate',week.engagementRate + '%', week.engagementRate >= 50 ? '&#9650; Above avg' : 'Avg: 50%', week.engagementRate >= 50 ? GREEN : AMBER) +
        kpi('Avg. Time on Site', fmtDur(week.avgDuration), 'Per session',                                   GRAY_LT) +
      '</tr>' +
    '</table>' +
    '</td></tr>' +

    // ── TOP DEPARTMENTS ──────────────────────────────────────────
    (deptRows ? (
      '<tr><td style="padding:0;">' +
      '<table cellpadding="0" cellspacing="0" border="0" width="100%">' +
        secHead('Top Departments by Traffic', 'Top 5 this week') +
        '<tr><td colspan="4" style="padding:0 20px 12px;">' +
          '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ' + GRAY_BDR + ';">' +
            '<tr style="background:' + MAROON + ';">' +
              '<td style="font-family:Arial,sans-serif;font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;color:#fff;padding:6px 12px;">Department</td>' +
              '<td style="font-family:Arial,sans-serif;font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;color:#fff;padding:6px 12px;">Sessions</td>' +
              '<td style="font-family:Arial,sans-serif;font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;color:#fff;padding:6px 12px;text-align:right;">Bounce Rate</td>' +
            '</tr>' +
            deptRows +
          '</table>' +
        '</td></tr>' +
      '</table></td></tr>'
    ) : '') +

    // ── SITE QUALITY ─────────────────────────────────────────────
    '<tr><td style="padding:0;">' +
    '<table cellpadding="0" cellspacing="0" border="0" width="100%">' +
      secHead('Site Quality', 'Siteimprove scores &bull; Peer avg: 85 &bull; Excellence: 90') +
      scoreBar('Accessibility (WCAG AA)', si.accessibility, 85, 90) +
      scoreBar('SEO', si.seo, 85, 90) +
      scoreBar('Mobile', si.mobile, 70, 80) +
      '<tr><td colspan="4" style="padding:0 20px 12px;">' +
        '<table cellpadding="0" cellspacing="0" border="0">' +
          '<tr>' +
            '<td style="font-family:Arial,sans-serif;font-size:11px;color:' + (si.brokenLinks > 100 ? RED : si.brokenLinks > 20 ? AMBER : GREEN) + ';padding:4px 16px 4px 0;">' +
              '<strong>' + si.brokenLinks + '</strong> broken links' +
            '</td>' +
            '<td style="font-family:Arial,sans-serif;font-size:11px;color:' + GRAY_LT + ';padding:4px 16px 4px 0;">' +
              'DCI overall: <strong>' + si.dci + '/100</strong>' +
            '</td>' +
          '</tr>' +
        '</table>' +
      '</td></tr>' +
    '</table>' +
    '</td></tr>' +

    // ── TEAM CAPACITY ────────────────────────────────────────────
    '<tr><td style="padding:0;">' +
    '<table cellpadding="0" cellspacing="0" border="0" width="100%">' +
      secHead('Team Capacity &mdash; Freshdesk', 'Support requests this week') +
      '<tr style="background:' + GRAY_BG + ';border-bottom:1px solid ' + GRAY_BDR + ';">' +
        kpi('Tickets',         fmt(week.tickets),           wowTickets !== null ? arrow(wowTickets, false) + ' vs prior' : '', arrowColor(wowTickets, false)) +
        kpi('Resolution Rate', week.resolutionRate + '%',   week.resolutionRate >= 80 ? '&#9650; Good' : 'Target: 85%', week.resolutionRate >= 80 ? GREEN : AMBER) +
        kpi('Avg. First Response', week.responseTime + 'h', week.responseTime <= 4 ? '&#9650; Under 4h' : 'Target: under 4h', parseFloat(week.responseTime) <= 4 ? GREEN : AMBER) +
        kpi('Satisfaction',    'N/A',                       'When surveys available', GRAY_LT) +
      '</tr>' +
      (fdDeptRows ? (
        '<tr><td colspan="4" style="padding:0 20px 12px;">' +
          '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ' + GRAY_BDR + ';">' +
            '<tr style="background:' + MAROON + ';">' +
              '<td style="font-family:Arial,sans-serif;font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;color:#fff;padding:5px 12px;">Department</td>' +
              '<td style="font-family:Arial,sans-serif;font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:0.06em;color:#fff;padding:5px 12px;text-align:right;">Tickets</td>' +
            '</tr>' +
            fdDeptRows +
          '</table>' +
        '</td></tr>'
      ) : '') +
    '</table>' +
    '</td></tr>' +

    // ── RECOMMENDATIONS ──────────────────────────────────────────
    '<tr><td style="padding:0;">' +
    '<table cellpadding="0" cellspacing="0" border="0" width="100%">' +
      secHead('This Week\'s Priorities', priorityOverride && priorityOverride.length ? 'Reviewed before sending' : 'Auto-generated from current data') +
      recRows +
      '<tr><td colspan="4" style="padding:6px 0 4px;"></td></tr>' +
    '</table>' +
    '</td></tr>' +

    // ── OPTIONAL NOTE ────────────────────────────────────────────
    (footerNote ? (
    '<tr><td style="padding:12px 24px;background:' + GRAY_BG + ';border-top:1px solid ' + GRAY_BDR + ';">' +
      '<p style="font-family:Arial,sans-serif;font-size:13px;color:' + GRAY_TXT + ';margin:0;font-style:italic;line-height:1.6;">' + footerNote + '</p>' +
    '</td></tr>'
    ) : '') +
    '<tr><td style="background-color:' + MAROON + ';padding:14px 24px;">' +
      '<table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' +
        '<td>' +
          '<div style="font-family:Arial,sans-serif;font-size:10px;color:#d1a0a0;">COAS Web Team &bull; Texas A&amp;M University</div>' +
          '<div style="font-family:Arial,sans-serif;font-size:10px;color:#a07070;margin-top:2px;">Generated automatically &bull; Data: GA4 + Siteimprove + Freshdesk</div>' +
        '</td>' +
        '<td align="right">' +
          '<div style="font-family:Arial,sans-serif;font-size:10px;color:#d1a0a0;">View full dashboards at the links below:</div>' +
          '<div style="font-family:Arial,sans-serif;font-size:10px;margin-top:2px;">' +
            '<a href="[YOUR-STAKEHOLDER-DASHBOARD-URL]" style="color:#d1a0a0;text-decoration:underline;">Stakeholder Report</a>' +
            ' &bull; ' +
            '<a href="[YOUR-OPS-DASHBOARD-URL]" style="color:#d1a0a0;text-decoration:underline;">Ops Dashboard</a>' +
          '</div>' +
        '</td>' +
      '</tr></table>' +
    '</td></tr>' +

    '</table>' + // email container
    '</td></tr></table>' + // outer wrapper
    '</body></html>';

  return html;
}

