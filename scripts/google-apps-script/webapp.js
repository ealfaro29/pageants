/* ---------- Web app entry point (appended after the layout builder) ---------- */

var MAX_SHEETS_PER_HOUR = 60;
var FOLDER_NAME = 'Pageants App – Scoresheets';

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (!params.sheet) return jsonResponse({ ok: true, service: 'pageants-scoresheets' });
  try {
    return jsonResponse(readResults(String(params.sheet), String(params.tab || '')));
  } catch (error) {
    return jsonResponse({ ok: false, code: error && error.code || 'request-failed', error: String(error && error.message || error) });
  }
}

// Only spreadsheets this web app created (they live in the scoresheet folder) can be read.
function isScoresheetFile(sheetId) {
  const folderId = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (!folderId) return false;
  try {
    const parents = DriveApp.getFileById(sheetId).getParents();
    while (parents.hasNext()) {
      if (parents.next().getId() === folderId) return true;
    }
  } catch (error) {
    return false;
  }
  return false;
}

function NotFoundError() {
  this.message = 'Scoresheet not found';
  this.code = 'not-found';
}

// Results of one phase tab for the shareable image: judges are returned only as a count
// and score columns, never by name.
function readResults(sheetId, tabName) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(sheetId) || !isScoresheetFile(sheetId)) throw new NotFoundError();

  const meta = Sheets.Spreadsheets.get(sheetId, { fields: 'sheets.properties(sheetId,title,index)' });
  const phases = meta.sheets
    .map(sheet => sheet.properties)
    .filter(props => props.sheetId >= 10 && props.sheetId < 99)
    .sort((a, b) => a.index - b.index)
    .map(props => props.title);
  if (!phases.length) throw new NotFoundError();
  const tab = phases.indexOf(tabName) >= 0 ? tabName : phases[0];
  const quoted = "'" + tab.replace(/'/g, "''") + "'";

  const response = Sheets.Spreadsheets.Values.batchGet(sheetId, {
    ranges: [quoted + '!A1:AZ4', quoted + '!A5:AZ400'],
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const head = response.valueRanges[0].values || [];
  const body = response.valueRanges[1].values || [];
  const headers = head[3] || [];
  const commentsCol = headers.findIndex(value => String(value).indexOf('COMENTARIOS') === 0);
  const helperCol = name => headers.findIndex((value, index) => index > commentsCol && value === name);
  const totalCol = helperCol('TOTAL');
  const rankCol = helperCol('RANK');
  const statusCol = helperCol('STATUS');
  const judgeCols = [];
  for (let col = 3; col < commentsCol; col += 1) {
    if (String(headers[col] || '').trim()) judgeCols.push(col);
  }

  const number = value => (typeof value === 'number' ? value : null);
  const rows = body
    .filter(row => String(row[2] || '').trim())
    .map(row => ({
      delegate: String(row[2]).trim(),
      scores: judgeCols.map(col => number(row[col])),
      total: number(row[totalCol]),
      rank: number(row[rankCol]),
      status: String(row[statusCol] || '')
    }))
    .sort((a, b) => (a.rank === null) - (b.rank === null) || (a.rank || 0) - (b.rank || 0));

  return {
    ok: true,
    title: String((head[0] || [])[1] || ''),
    phase: tab,
    phases: phases,
    judgeCount: judgeCols.length,
    qualify: number((head[2] || [])[3]) || 0,
    wildcard: number((head[2] || [])[5]) || 0,
    rows: rows
  };
}

function cleanInput(raw) {
  const title = String(raw && raw.title || '').trim().slice(0, 120);
  if (!title) throw new GoogleSheetsInputError('Missing pageant name');
  const judgeCount = Math.min(20, Math.max(1, Math.floor(Number(raw.judgeCount) || 5)));
  const delegates = (Array.isArray(raw.delegates) ? raw.delegates : [])
    .map(name => String(name || '').trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 300);
  const language = raw.language === 'es' ? 'es' : 'en';
  return { title, judgeCount, delegates, language };
}

function GoogleSheetsInputError(message) {
  this.message = message;
  this.code = 'invalid-input';
}

// Global hourly cap so a public endpoint can't flood the owner's Drive.
function takeRateLimitSlot() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    const key = 'count:' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
    const used = Number(cache.get(key) || 0);
    if (used >= MAX_SHEETS_PER_HOUR) return false;
    cache.put(key, String(used + 1), 3600);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function getScoresheetFolder() {
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty('FOLDER_ID');
  if (folderId) {
    try {
      const existing = DriveApp.getFolderById(folderId);
      if (!existing.isTrashed()) return existing;
    } catch (error) {
      // Folder was deleted: create a new one below.
    }
  }
  const folder = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

function doPost(e) {
  try {
    const input = cleanInput(JSON.parse(e.postData.contents || '{}'));
    if (!takeRateLimitSlot()) {
      return jsonResponse({ ok: false, code: 'rate-limited', error: 'Too many scoresheets this hour. Try again later.' });
    }

    const judgeNames = [];
    for (let index = 0; index < input.judgeCount; index += 1) judgeNames.push('JUDGE ' + (index + 1));
    const request = buildGoogleSpreadsheet({
      title: input.title,
      judgeNames: judgeNames,
      delegates: input.delegates,
      language: input.language
    });

    const created = Sheets.Spreadsheets.create(request.createBody);
    // The export-image links need the new spreadsheet's id, which only exists now.
    const requests = request.batchRequests.concat([{
      findReplace: { find: SHEET_ID_PLACEHOLDER, replacement: created.spreadsheetId, includeFormulas: true, allSheets: true }
    }]);
    Sheets.Spreadsheets.batchUpdate({ requests: requests }, created.spreadsheetId);

    const file = DriveApp.getFileById(created.spreadsheetId);
    try {
      file.moveTo(getScoresheetFolder());
    } catch (error) {
      console.warn('Could not move scoresheet into folder: ' + error);
    }

    let shared = true;
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
    } catch (error) {
      shared = false;
      console.warn('Could not share scoresheet: ' + error);
    }

    return jsonResponse({ ok: true, spreadsheetId: created.spreadsheetId, spreadsheetUrl: created.spreadsheetUrl, shared: shared });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, code: error && error.code || 'request-failed', error: String(error && error.message || error) });
  }
}
