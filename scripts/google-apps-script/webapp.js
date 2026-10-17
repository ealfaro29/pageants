/* ---------- Web app entry point (appended after the layout builder) ---------- */

var MAX_SHEETS_PER_HOUR = 60;
var FOLDER_NAME = 'Pageants App – Scoresheets';

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonResponse({ ok: true, service: 'pageants-scoresheets' });
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
    Sheets.Spreadsheets.batchUpdate({ requests: request.batchRequests }, created.spreadsheetId);

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
