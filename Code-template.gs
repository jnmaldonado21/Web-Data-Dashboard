// ============================================================
// Web Ecosystem Dashboard — Google Apps Script
// Version 2.0
//
// SETUP INSTRUCTIONS:
//   1. Add all Script Properties listed below
//      (Project Settings → Script Properties)
//   2. Update DEPT_PATHS to match your site structure
//   3. Update CENTERS_INVENTORY with your external sites
//   4. Update HOSTNAME to your primary domain
//   5. Run fetchAllData() once to generate initial data
//   6. Run createDailyTrigger() once to schedule daily updates
//
// REQUIRED SCRIPT PROPERTIES:
//   GA4_PROPERTY_ID   — GA4 numeric property ID (e.g. 123456789)
//   SI_USERNAME       — Siteimprove login email
//   SI_API_KEY        — Siteimprove API key
//   SI_SITE_ID        — Siteimprove site ID for your domain
//   SI_API_URL        — https://api.eu.siteimprove.com/v2 (EU)
//                       or https://api.siteimprove.com/v2 (US)
//   FD_API_KEY        — Freshdesk API key
//   FD_EMAIL          — Your Freshdesk account email
//   FD_BASE_URL       — https://YOUR-COMPANY.freshdesk.com
//   CLARITY_TOKEN     — Microsoft Clarity Bearer token
//   CLARITY_PROJECT   — Clarity project ID
//   GITHUB_TOKEN      — GitHub personal access token (repo scope)
//   GITHUB_REPO       — username/repo-name
// ============================================================

// ------------------------------------------------------------
// HOSTNAME — update to your primary domain (no https://)
// ------------------------------------------------------------
var HOSTNAME = '[YOUR-DOMAIN.edu]';

// ------------------------------------------------------------
// DEPARTMENT PATHS — one entry per section of your site
// ------------------------------------------------------------
var DEPT_PATHS = [
  { name: '[Department Name 1]', path: '/[path-1]/' },
  { name: '[Department Name 2]', path: '/[path-2]/' },
  { name: '[Department Name 3]', path: '/[path-3]/' }
  // Add more as needed
];

// ------------------------------------------------------------
// EXTERNAL SITES INVENTORY — sites you track but don't manage
// ------------------------------------------------------------
var CENTERS_INVENTORY = [
  { name: '[Site Name]', url: 'https://[site-url]', platform: 'WordPress', monitored: false }
  // Add more as needed
  // platform: 'WordPress', 'Cascade', 'Google Sites', 'HTML/CSS', 'Unknown'
  // monitored: true = in Siteimprove, false = external only
];

// ============================================================
// WEB APP ENDPOINT — doGet
// Deploy as Web App (Execute as: Me, Who has access: Anyone)
// to enable dynamic date-range switching on the ops dashboard.
// ============================================================
function doGet(e) {
  var params    = e ? (e.parameter || {}) : {};
  var source    = params.source   || 'all';
  var days      = parseInt(params.days || '90');
  var callback  = params.callback || null;
  var period    = buildPeriod(days, params.startDate || null, params.endDate || null);
  var result    = {};

  try {
    if (source === 'ga4'         || source === 'all') result.ga4         = fetchGA4Data(period);
    if (source === 'siteimprove' || source === 'all') result.siteimprove = fetchSiteimproveData();
    if (source === 'freshdesk'   || source === 'all') result.freshdesk   = fetchFreshdeskData(period);
    if (source === 'clarity'     || source === 'all') result.clarity     = fetchClarityData(period);
    result.lastUpdated  = new Date().toISOString();
    result.reportPeriod = period;
    if (source === 'all') result.centersInventory = CENTERS_INVENTORY;
  } catch (err) {
    result.error = err.message;
  }

  var json = JSON.stringify(result);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// DAILY JOB — writes 4 period files to GitHub each morning
// ============================================================
function fetchAllData() {
  try {
    Logger.log('Starting dashboard data fetch...');

    var siData = fetchSiteimproveData();
    var clData = fetchClarityData(buildPeriod(3, null, null));

    [30, 60, 90, 180].forEach(function(days) {
      Logger.log('Fetching ' + days + '-day data...');
      var period  = buildPeriod(days, null, null);
      var payload = {
        lastUpdated:      new Date().toISOString(),
        reportPeriod:     period,
        ga4:              fetchGA4Data(period),
        siteimprove:      siData,
        freshdesk:        fetchFreshdeskData(period),
        clarity:          clData,
        centersInventory: CENTERS_INVENTORY
      };
      var filename = days === 90 ? 'data.json' : 'data-' + days + '.json';
      writeFileToGitHub(filename, JSON.stringify(payload, null, 2));
      Logger.log('Wrote ' + filename);
    });

    Logger.log('Dashboard data fetch complete — all periods written.');
  } catch (e) {
    Logger.log('ERROR: ' + e.message);
    MailApp.sendEmail(
      Session.getActiveUser().getEmail(),
      'Web Dashboard: Data fetch failed',
      'The dashboard data fetch failed:\n\n' + e.message +
      '\n\nCheck Apps Script logs at script.google.com'
    );
  }
}

// ============================================================
// PERIOD BUILDER
// ============================================================
function buildPeriod(days, startOverride, endOverride) {
  var end   = endOverride   ? new Date(endOverride)   : new Date();
  var start = startOverride ? new Date(startOverride) : new Date();
  if (!startOverride) start.setDate(start.getDate() - days);
  return {
    days:      days,
    startDate: formatDate(start),
    endDate:   formatDate(end),
    startISO:  start.toISOString(),
    endISO:    end.toISOString(),
    label:     formatDisplayDate(start) + ' \u2013 ' + formatDisplayDate(end)
  };
}

function formatDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function formatDisplayDate(d) {
  var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return m[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

function formatNumber(n) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}

// ============================================================
// GA4
// ============================================================
function fetchGA4Data(period) {
  Logger.log('Fetching GA4 data... Period: ' + period.startDate + ' to ' + period.endDate);

  var props      = PropertiesService.getScriptProperties();
  var propertyId = props.getProperty('GA4_PROPERTY_ID');
  var token      = ScriptApp.getOAuthToken();

  var hostnameFilter = {
    filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: HOSTNAME } }
  };

  var resp = ga4Request(propertyId, {
    dateRanges: [{ startDate: period.startDate, endDate: period.endDate }],
    metrics: [
      { name: 'sessions' }, { name: 'newUsers' }, { name: 'engagementRate' },
      { name: 'averageSessionDuration' }, { name: 'screenPageViews' }, { name: 'bounceRate' }
    ],
    dimensionFilter: hostnameFilter,
    limit: 1
  }, token);

  if (!resp.rows) {
    Logger.log('No GA4 rows returned. Check Property ID and hostname.');
    return getEmptyGA4();
  }

  var c           = resp.rows[0].metricValues;
  var sessions    = parseInt(c[0].value);
  var newUsers    = parseInt(c[1].value);
  var engageRate  = Math.round(parseFloat(c[2].value) * 100);
  var avgDuration = parseInt(c[3].value);
  var pageViews   = parseInt(c[4].value);
  var bounceRate  = Math.round(parseFloat(c[5].value) * 100);
  var minutes     = Math.floor(avgDuration / 60);
  var seconds     = String(avgDuration % 60).padStart(2, '0');

  return {
    sessions:         { value: formatNumber(sessions),  raw: sessions },
    newUsers:         { value: formatNumber(newUsers),   raw: newUsers },
    engagementRate:   { value: engageRate + '%',         raw: engageRate },
    avgDuration:      { value: minutes + ':' + seconds,  raw: avgDuration },
    pageViews:        { value: formatNumber(pageViews),  raw: pageViews },
    bounceRate:       { value: bounceRate + '%',         raw: bounceRate },
    admissionsVisits: { value: formatNumber(fetchGA4Keywords(propertyId, period, token, hostnameFilter,
                          ['admissions','prospective','apply'])), // Update these keywords
                        raw: 0 },
    topPages:      fetchGA4TopPages(propertyId, period, token, hostnameFilter),
    monthlyTrend:  fetchGA4MonthlyTrend(propertyId, period.days, token, hostnameFilter),
    deptBreakdown: fetchGA4DeptBreakdown(propertyId, period, token),
    deptTrend:     fetchGA4DeptTrend(propertyId, period.days, token)
  };
}

function fetchGA4TopPages(pid, period, token, filter) {
  var resp = ga4Request(pid, {
    dateRanges: [{ startDate: period.startDate, endDate: period.endDate }],
    metrics: [{ name: 'screenPageViews' }], dimensions: [{ name: 'pagePath' }],
    dimensionFilter: filter,
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 5
  }, token);
  if (!resp.rows) return [];
  return resp.rows.map(function(r) {
    return { path: r.dimensionValues[0].value, views: parseInt(r.metricValues[0].value) };
  });
}

function fetchGA4MonthlyTrend(pid, days, token, filter) {
  var months = [], labels = [];
  var mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var buckets = Math.min(6, Math.ceil(days / 30));
  var bDays   = Math.ceil(days / buckets);

  for (var i = buckets - 1; i >= 0; i--) {
    var endD   = new Date(); endD.setDate(endD.getDate() - i * bDays);
    var startD = new Date(endD); startD.setDate(startD.getDate() - bDays + 1);
    var resp   = ga4Request(pid, {
      dateRanges: [{ startDate: formatDate(startD), endDate: formatDate(endD) }],
      metrics: [{ name: 'sessions' }, { name: 'newUsers' }, { name: 'bounceRate' }],
      dimensionFilter: filter, limit: 1
    }, token);
    months.push({
      sessions:   resp.rows ? parseInt(resp.rows[0].metricValues[0].value)   : 0,
      newUsers:   resp.rows ? parseInt(resp.rows[0].metricValues[1].value)   : 0,
      bounceRate: resp.rows ? Math.round(parseFloat(resp.rows[0].metricValues[2].value) * 100) : 0
    });
    labels.push(mNames[endD.getMonth()]);
  }
  return { buckets: months, labels: labels };
}

function fetchGA4DeptBreakdown(pid, period, token) {
  var resp = ga4Request(pid, {
    dateRanges: [{ startDate: period.startDate, endDate: period.endDate }],
    metrics: [{ name: 'sessions' }, { name: 'newUsers' },
              { name: 'averageSessionDuration' }, { name: 'bounceRate' }],
    dimensions: [{ name: 'pagePath' }],
    dimensionFilter: { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: HOSTNAME } } },
    limit: 500
  }, token);
  if (!resp.rows) return [];

  var results = [];
  DEPT_PATHS.forEach(function(dept) {
    var s = 0, n = 0, td = 0, tb = 0, c = 0;
    resp.rows.forEach(function(row) {
      var path = row.dimensionValues[0].value;
      if (path.indexOf(dept.path) === 0) {
        s += parseInt(row.metricValues[0].value);
        n += parseInt(row.metricValues[1].value);
        td += parseFloat(row.metricValues[2].value);
        tb += parseFloat(row.metricValues[3].value);
        c++;
      }
    });
    results.push({ name: dept.name, path: dept.path, sessions: s, newUsers: n,
      avgDuration: c > 0 ? Math.round(td/c) : 0, bounceRate: c > 0 ? Math.round((tb/c)*100) : 0 });
  });
  results.sort(function(a, b) { return b.sessions - a.sessions; });
  return results;
}

function fetchGA4DeptTrend(pid, days, token) {
  var mNames  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var buckets = Math.min(6, Math.ceil(days / 30));
  var labels  = [];
  var data    = {};
  DEPT_PATHS.forEach(function(d) { data[d.name] = []; });

  for (var i = buckets - 1; i >= 0; i--) {
    var endD   = new Date(); endD.setDate(endD.getDate() - i * Math.ceil(days / buckets));
    var startD = new Date(endD); startD.setDate(startD.getDate() - Math.ceil(days / buckets) + 1);
    labels.push(mNames[endD.getMonth()]);

    var resp = ga4Request(pid, {
      dateRanges: [{ startDate: formatDate(startD), endDate: formatDate(endD) }],
      metrics: [{ name: 'sessions' }], dimensions: [{ name: 'pagePath' }],
      dimensionFilter: { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: HOSTNAME } } },
      limit: 500
    }, token);

    DEPT_PATHS.forEach(function(dept) {
      var total = 0;
      if (resp.rows) resp.rows.forEach(function(row) {
        if (row.dimensionValues[0].value.indexOf(dept.path) === 0)
          total += parseInt(row.metricValues[0].value);
      });
      data[dept.name].push(total);
    });
  }
  return { labels: labels, departments: data };
}

function fetchGA4Keywords(pid, period, token, filter, keywords) {
  var resp = ga4Request(pid, {
    dateRanges: [{ startDate: period.startDate, endDate: period.endDate }],
    metrics: [{ name: 'screenPageViews' }], dimensions: [{ name: 'pagePath' }],
    dimensionFilter: filter, limit: 200
  }, token);
  if (!resp.rows) return 0;
  var total = 0;
  resp.rows.forEach(function(r) {
    var p = r.dimensionValues[0].value.toLowerCase();
    if (keywords.some(function(kw) { return p.indexOf(kw) !== -1; }))
      total += parseInt(r.metricValues[0].value);
  });
  return total;
}

function ga4Request(pid, body, token) {
  var resp = UrlFetchApp.fetch(
    'https://analyticsdata.googleapis.com/v1beta/properties/' + pid + ':runReport',
    { method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(body), muteHttpExceptions: true }
  );
  var data = JSON.parse(resp.getContentText());
  if (data.error) throw new Error('GA4 error: ' + data.error.message);
  return data;
}

function getEmptyGA4() {
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
// SITEIMPROVE
// Uses /dci/overview — returns all scores in one API call.
// ============================================================
function fetchSiteimproveData() {
  Logger.log('Fetching Siteimprove data...');

  var props   = PropertiesService.getScriptProperties();
  var base    = (props.getProperty('SI_API_URL') || 'https://api.eu.siteimprove.com/v2') +
                '/sites/' + props.getProperty('SI_SITE_ID');
  var headers = {
    'Authorization': 'Basic ' + Utilities.base64Encode(
      props.getProperty('SI_USERNAME') + ':' + props.getProperty('SI_API_KEY')),
    'Accept': 'application/json'
  };
  var options = { method: 'get', headers: headers, muteHttpExceptions: true };

  var dciResp = UrlFetchApp.fetch(base + '/dci/overview', options);
  Logger.log('DCI status: ' + dciResp.getResponseCode());
  var dciData = JSON.parse(dciResp.getContentText());

  var qaResp  = UrlFetchApp.fetch(base + '/quality_assurance/overview/summary', options);
  Logger.log('QA status: ' + qaResp.getResponseCode());
  var qaData  = JSON.parse(qaResp.getContentText());

  var a = dciData.a11y  ? Math.round(dciData.a11y.aa    || dciData.a11y.total || 0) : 0;
  var s = dciData.seo   ? Math.round(dciData.seo.total  || 0) : 0;
  var m = dciData.seo   ? Math.round(dciData.seo.mobile || 0) : 0;
  var q = dciData.qa    ? Math.round(dciData.qa.total   || 0) : 0;
  var d = dciData.total ? Math.round(dciData.total)            : 0;

  Logger.log('Scores — A11y: ' + a + ', SEO: ' + s + ', Mobile: ' + m + ', QA: ' + q + ', DCI: ' + d);

  return {
    accessibilityScore: { value: String(a), raw: a },
    accessibilityAA:    { value: String(a), raw: a },
    accessibilityTotal: { value: String(Math.round(dciData.a11y ? dciData.a11y.total || 0 : 0)), raw: 0 },
    seoScore:           { value: String(s), raw: s },
    mobileScore:        { value: String(m), raw: m },
    qaScore:            { value: String(q), raw: q },
    dciTotal:           { value: String(d), raw: d },
    brokenLinks:        { value: String(qaData.broken_links || 0),  raw: qaData.broken_links  || 0 },
    qualityIssues:      { value: String(qaData.misspellings || 0),  raw: qaData.misspellings  || 0 }
  };
}

// ============================================================
// FRESHDESK
// Auth: apikey + empty password (base64)
// Date format: full ISO8601
// ============================================================
function fetchFreshdeskData(period) {
  Logger.log('Fetching Freshdesk data...');

  var props    = PropertiesService.getScriptProperties();
  var base     = props.getProperty('FD_BASE_URL') + '/api/v2';
  var headers  = {
    'Authorization': 'Basic ' + Utilities.base64Encode(props.getProperty('FD_API_KEY') + ':'),
    'Content-Type': 'application/json'
  };
  var options  = { method: 'get', headers: headers, muteHttpExceptions: true };
  var since    = period ? period.startISO : new Date(Date.now() - 90*24*60*60*1000).toISOString();

  Logger.log('Fetching tickets since: ' + since);

  var tickets = [];
  for (var page = 1; page <= 3; page++) {
    var resp = UrlFetchApp.fetch(
      base + '/tickets?updated_since=' + since + '&per_page=100&page=' + page + '&include=stats',
      options
    );
    Logger.log('Tickets page ' + page + ' status: ' + resp.getResponseCode());
    var batch = JSON.parse(resp.getContentText());
    if (!Array.isArray(batch)) {
      if (page === 1) throw new Error('Freshdesk error: ' + (batch.message || 'unexpected response'));
      break;
    }
    tickets = tickets.concat(batch);
    if (batch.length < 100) break;
  }
  Logger.log('Total tickets: ' + tickets.length);

  var resolved   = tickets.filter(function(t) { return t.status === 4 || t.status === 5; }).length;
  var respTimes  = tickets
    .filter(function(t) { return t.stats && t.stats.first_responded_at && t.created_at; })
    .map(function(t) { return (new Date(t.stats.first_responded_at) - new Date(t.created_at)) / 3600000; });
  var avgResp    = respTimes.length > 0
    ? (respTimes.reduce(function(a,b){return a+b;},0)/respTimes.length).toFixed(1) : 'N/A';

  var deptCounts = {};
  tickets.forEach(function(t) {
    var dept = extractDeptFromTicket(t);
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });

  var csatScore = 'N/A';
  try {
    var cr = UrlFetchApp.fetch(
      base + '/surveys/satisfaction_ratings?updated_since=' + since + '&per_page=100', options);
    if (cr.getResponseCode() === 200) {
      var cd = JSON.parse(cr.getContentText());
      if (Array.isArray(cd) && cd.length > 0) {
        var sat = cd.filter(function(r) { return r.rating === 'happy' || r.rating === 'neutral'; }).length;
        csatScore = Math.round((sat / cd.length) * 100) + '%';
      }
    }
  } catch(e) { Logger.log('CSAT skipped: ' + e.message); }

  return {
    ticketVolume:    { value: String(tickets.length), raw: tickets.length },
    resolutionRate:  { value: (tickets.length > 0 ? Math.round((resolved/tickets.length)*100) : 0) + '%',
                       raw: tickets.length > 0 ? Math.round((resolved/tickets.length)*100) : 0 },
    avgResponseTime: { value: avgResp + 'h', raw: avgResp },
    csatScore:       { value: csatScore, raw: csatScore },
    deptBreakdown:   Object.keys(deptCounts)
      .map(function(k) { return { name: k, count: deptCounts[k] }; })
      .sort(function(a,b) { return b.count - a.count; }).slice(0, 10),
    ticketTrend: buildTicketTrend(tickets, period)
  };
}

function extractDeptFromTicket(ticket) {
  var subject = (ticket.subject || '').toLowerCase();
  for (var i = 0; i < DEPT_PATHS.length; i++) {
    var words = DEPT_PATHS[i].name.toLowerCase().split(' ');
    for (var j = 0; j < words.length; j++) {
      if (words[j].length > 4 && subject.indexOf(words[j]) !== -1) return DEPT_PATHS[i].name;
    }
  }
  return 'Other / Unclassified';
}

function buildTicketTrend(tickets, period) {
  var days    = period ? period.days : 90;
  var buckets = Math.min(12, Math.ceil(days / 7));
  var result  = [];
  var now     = new Date();
  var mNames  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  for (var i = buckets - 1; i >= 0; i--) {
    var end   = new Date(now); end.setDate(end.getDate() - i * 7);
    var start = new Date(end); start.setDate(start.getDate() - 7);
    result.push({
      label: mNames[end.getMonth()] + ' ' + end.getDate(),
      count: tickets.filter(function(t) {
        var c = new Date(t.created_at); return c >= start && c <= end;
      }).length
    });
  }
  return result;
}

// ============================================================
// MICROSOFT CLARITY
// API limit: max 3 days, 10 requests/day per project
// projectId is REQUIRED as a query parameter
// ============================================================
function fetchClarityData(period) {
  Logger.log('Fetching Microsoft Clarity data...');

  var props     = PropertiesService.getScriptProperties();
  var token     = props.getProperty('CLARITY_TOKEN');
  var projectId = props.getProperty('CLARITY_PROJECT');

  if (!token)     return getClarityPlaceholder('Add CLARITY_TOKEN to Script Properties.');
  if (!projectId) return getClarityPlaceholder('Add CLARITY_PROJECT to Script Properties.');

  var url = 'https://www.clarity.ms/export-data/api/v1/project-live-insights' +
    '?projectId=' + projectId + '&numOfDays=3&dimension1=Browser&dimension2=Device';

  try {
    var resp = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      muteHttpExceptions: true
    });
    Logger.log('Clarity status: ' + resp.getResponseCode());
    Logger.log('Clarity body: ' + resp.getContentText().substring(0, 400));

    if (resp.getResponseCode() === 401) return getClarityPlaceholder('Authentication failed. Regenerate token.');
    if (resp.getResponseCode() === 404) return getClarityPlaceholder('Project not found. Verify CLARITY_PROJECT.');
    if (resp.getResponseCode() !== 200) return getClarityPlaceholder('API returned ' + resp.getResponseCode());

    var data = JSON.parse(resp.getContentText());
    var sessions = 0, deadClicks = 0, pages = 0;

    if (Array.isArray(data) && data.length > 0) {
      (data[0].information || []).forEach(function(row) {
        sessions   += parseInt(row.sessionsCount || '0');
        deadClicks += parseInt(row.subTotal      || '0');
        pages      += parseInt(row.pagesViews    || '0');
      });
    }

    var deadRate = sessions > 0 ? Math.round((deadClicks / sessions) * 100) : 0;
    Logger.log('Clarity — sessions: ' + sessions + ', dead clicks: ' + deadClicks);

    return {
      status: 'active', hasData: sessions > 0, dataWindow: 'Last 3 days (API limit)',
      totalSessions: { value: formatNumber(sessions),   raw: sessions },
      uniqueUsers:   { value: '\u2014', raw: 0 },
      scrollDepth:   { value: '\u2014', raw: 0 },
      deadClicks:    { value: formatNumber(deadClicks), raw: deadClicks },
      deadClickRate: { value: deadRate + '%',           raw: deadRate },
      rageClicks:    { value: '\u2014', raw: 0 },
      recordings:    { value: '\u2014', raw: 0 },
      pageViews:     { value: formatNumber(pages),      raw: pages },
      topPages:      []
    };
  } catch (e) {
    Logger.log('Clarity error: ' + e.message);
    return getClarityPlaceholder('Error: ' + e.message);
  }
}

function getClarityPlaceholder(reason) {
  return {
    status: 'pending', hasData: false, reason: reason,
    totalSessions: { value: '\u2014', raw: 0 }, uniqueUsers: { value: '\u2014', raw: 0 },
    scrollDepth: { value: '\u2014', raw: 0 }, deadClicks: { value: '\u2014', raw: 0 },
    deadClickRate: { value: '\u2014', raw: 0 }, rageClicks: { value: '\u2014', raw: 0 },
    recordings: { value: '\u2014', raw: 0 }, pageViews: { value: '\u2014', raw: 0 }, topPages: []
  };
}

// ============================================================
// GITHUB — Write files to your GitHub Pages repo
// ============================================================
function writeFileToGitHub(filename, jsonString) {
  Logger.log('Writing ' + filename + ' to GitHub...');

  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('GITHUB_TOKEN');
  var repo  = props.getProperty('GITHUB_REPO');

  if (!token || !repo) { Logger.log('GitHub credentials not set.'); return; }

  var url  = 'https://api.github.com/repos/' + repo + '/contents/' + filename;
  var auth = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' };

  var getResp = UrlFetchApp.fetch(url, { method:'get', headers:auth, muteHttpExceptions:true });
  var sha     = getResp.getResponseCode() === 200 ? JSON.parse(getResp.getContentText()).sha : null;

  var body = {
    message: 'Auto-update ' + filename + ' \u2014 ' + new Date().toISOString(),
    content: Utilities.base64Encode(jsonString),
    branch:  'main'
  };
  if (sha) body.sha = sha;

  var putResp = UrlFetchApp.fetch(url, {
    method: 'put', headers: Object.assign({}, auth, { 'Content-Type': 'application/json' }),
    payload: JSON.stringify(body), muteHttpExceptions: true
  });

  Logger.log(filename + ' status: ' + putResp.getResponseCode());
  if (putResp.getResponseCode() !== 200 && putResp.getResponseCode() !== 201)
    throw new Error('GitHub write failed: ' + putResp.getContentText());
  Logger.log(filename + ' written successfully.');
}

function writeToGitHub(jsonString) { writeFileToGitHub('data.json', jsonString); }

// ============================================================
// TRIGGER SETUP — run once manually
// ============================================================
function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'fetchAllData') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('fetchAllData')
    .timeBased().everyDays(1).atHour(6)
    .inTimezone('America/Chicago') // Change to your timezone
    .create();
  Logger.log('Daily trigger created. fetchAllData runs every day at 6am.');
}
