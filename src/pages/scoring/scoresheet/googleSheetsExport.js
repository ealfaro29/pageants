// Creates the scoresheet in Google Sheets through the Pageants Apps Script web app, which
// runs under the owner's Google account: visitors don't sign in, the file lives in the
// owner's Drive and is shared as "anyone with the link can edit".
// Script source: scripts/google-apps-script/Code.gs (setup steps in its header).
export const GOOGLE_SHEETS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxRproFmaTIzpC4Ndlc5C98DpU2SzyNrzit05LNdCBTFPsDML7RXhb6Dd8cCeBDr53i7A/exec';

export class GoogleSheetsError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

export async function createGoogleScoresheet({ title, judgeCount, delegates = [], language = 'en' }) {
  if (!GOOGLE_SHEETS_WEBAPP_URL) throw new GoogleSheetsError('not-configured');

  let response;
  try {
    // text/plain keeps this a "simple" request, so the browser skips the CORS preflight
    // that Apps Script web apps don't answer.
    response = await fetch(GOOGLE_SHEETS_WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ title, judgeCount, delegates, language })
    });
  } catch (error) {
    throw new GoogleSheetsError('network', error?.message);
  }

  const payload = await response.json().catch(() => null);
  if (!payload?.ok) {
    throw new GoogleSheetsError(payload?.code || 'request-failed', payload?.error || `HTTP ${response.status}`);
  }
  return { spreadsheetId: payload.spreadsheetId, spreadsheetUrl: payload.spreadsheetUrl, shared: Boolean(payload.shared) };
}
