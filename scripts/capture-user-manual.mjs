import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const BASE_URL = process.env.MANUAL_BASE_URL || 'http://127.0.0.1:4173';
const OUT_DIR = path.resolve('public/manual');
const VIEWPORT = { width: 1366, height: 820 };

async function ensureDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

async function setEnglishLightStorage(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('pageants-scoring-language', 'en');
    window.localStorage.setItem('pageants-scoring-theme', 'light');
    window.localStorage.setItem('pageants-scoring-accent', '#fbbf24');
  });
}

function escapeXml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function markScreenshot(filename, markers = []) {
  if (!markers.length) return;
  if (process.env.MANUAL_ENABLE_MARKERS !== '1') return;
  const filePath = path.join(OUT_DIR, filename);
  const image = sharp(filePath);
  const metadata = await image.metadata();
  const width = metadata.width || VIEWPORT.width;
  const height = metadata.height || VIEWPORT.height;

  const callouts = markers.map((marker) => {
    const label = escapeXml(marker.label || '');
    const pad = Number.isFinite(marker.pad) ? marker.pad : 6;
    const rectX = Math.max(1, marker.x - pad);
    const rectY = Math.max(1, marker.y - pad);
    const rectW = Math.min(width - rectX - 1, marker.width + pad * 2);
    const rectH = Math.min(height - rectY - 1, marker.height + pad * 2);
    const labelWidth = Math.max(92, label.length * 7.2 + 22);
    const labelHeight = 24;
    const labelX = Math.max(4, Math.min(width - labelWidth - 4, rectX));
    const labelY = rectY > labelHeight + 6 ? rectY - (labelHeight + 4) : rectY + 4;
    const textX = labelX + labelWidth / 2;
    const textY = labelY + 16;

    return `
      <g>
        <rect x="${rectX}" y="${rectY}" rx="8" ry="8" width="${rectW}" height="${rectH}" fill="rgba(251,191,36,0.16)" stroke="rgba(251,191,36,0.95)" stroke-width="2.5" />
        <rect x="${labelX}" y="${labelY}" rx="6" ry="6" width="${labelWidth}" height="${labelHeight}" fill="rgba(15,23,42,0.94)" stroke="rgba(251,191,36,0.95)" stroke-width="1.5" />
        <text x="${textX}" y="${textY}" fill="#f9fafb" font-size="12" font-family="Arial, sans-serif" text-anchor="middle" font-weight="700">${label}</text>
      </g>
    `;
  }).join('\n');

  const overlaySvg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${callouts}
    </svg>
  `;

  await image
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png({ quality: 88 })
    .toFile(filePath + '.tmp.png');

  await fs.rename(filePath + '.tmp.png', filePath);
}

async function markerFromLocator(locator, label, { pad = 6 } = {}) {
  const target = locator.first();
  await target.waitFor({ state: 'visible', timeout: 8000 });
  const box = await target.boundingBox();
  if (!box) throw new Error(`Could not get marker bounds for ${label}`);

  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.max(10, Math.round(box.width)),
    height: Math.max(10, Math.round(box.height)),
    label,
    pad
  };
}

async function main() {
  await ensureDir();
  const browser = await chromium.launch({ headless: true });

  const hostContext = await browser.newContext({ viewport: VIEWPORT });
  const judgeContext = await browser.newContext({ viewport: VIEWPORT });

  const hostPage = await hostContext.newPage();
  await setEnglishLightStorage(hostPage);

  await hostPage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await hostPage.waitForTimeout(1200);
  await hostPage.screenshot({ path: path.join(OUT_DIR, '01-welcome-splash.png') });
  await markScreenshot('01-welcome-splash.png', [
    await markerFromLocator(hostPage.getByRole('button', { name: /Enter system/i }), 'Enter system'),
    await markerFromLocator(hostPage.locator(':is(button,a):has-text(\"How to Use\")'), 'How to Use'),
    await markerFromLocator(hostPage.getByText(/professional system to create sessions/i), 'Welcome info')
  ]);

  await hostPage.click('button:has-text("Enter system")');
  await hostPage.waitForTimeout(700);
  await hostPage.screenshot({ path: path.join(OUT_DIR, '02-landing-roles.png') });
  await markScreenshot('02-landing-roles.png', [
    await markerFromLocator(hostPage.getByText(/^I'm a host$/i), 'Host'),
    await markerFromLocator(hostPage.getByText(/^I'm a judge$/i), 'Judge'),
    await markerFromLocator(hostPage.getByText(/^I'm a spectator$/i), 'Audience')
  ]);

  await hostPage.click("button:has-text(\"I'm a host\")");
  await hostPage.waitForTimeout(500);
  await hostPage.fill('input[placeholder="Example: Admin"]', 'Manual Host');
  await hostPage.fill('input[placeholder="Example: Miss Universe 2026"]', 'Manual Demo Session');
  await hostPage.click('button:has-text("Per Phase")');
  await hostPage.waitForTimeout(400);
  await hostPage.screenshot({ path: path.join(OUT_DIR, '03-create-session.png') });
  await markScreenshot('03-create-session.png', [
    await markerFromLocator(hostPage.locator('select').first(), 'Session type'),
    await markerFromLocator(hostPage.getByRole('button', { name: /Per Phase/i }), 'Scoring mode'),
    await markerFromLocator(hostPage.getByRole('button', { name: /Host admin only/i }), 'Host voting')
  ]);

  await hostPage.click('button:has-text("Create Session")');
  await hostPage.waitForURL(/\/session\/[^/?]+\?judge=/, { timeout: 30000 });
  await hostPage.waitForTimeout(2000);

  const sessionUrl = hostPage.url();
  const sessionMatch = sessionUrl.match(/\/session\/([^/?]+)/);
  if (!sessionMatch) throw new Error(`Unable to parse session id from URL: ${sessionUrl}`);
  const sessionId = sessionMatch[1];
  const sessionSuffix = sessionId.split('-')[1] || sessionId;
  await hostPage.screenshot({ path: path.join(OUT_DIR, '04-host-session-code.png') });
  await markScreenshot('04-host-session-code.png', [
    await markerFromLocator(hostPage.getByRole('button', { name: /^Settings$/i }), 'Settings'),
    await markerFromLocator(hostPage.getByText(/^MU-[A-Z0-9]{6}$/), 'Session code')
  ]);

  await hostPage.click('button:has-text("Add from list")');
  await hostPage.waitForTimeout(400);
  await hostPage.fill('textarea', `1.PHILIPPINES 🇵🇭 - Mara Ana - CE #1
RUSSIA 🇷🇺 - Kiannnnmnnnn - CE #2
PUETO RICO 🇵🇷 - Valentina Marisol - CE#8
ARGENTINA 🇦🇷- SHAMCEY LOUISIANA/CE#9`);
  await hostPage.click('button:has-text("Generate preview")');
  await hostPage.waitForTimeout(500);
  await hostPage.screenshot({ path: path.join(OUT_DIR, '05-add-from-list.png') });
  await markScreenshot('05-add-from-list.png', [
    await markerFromLocator(hostPage.getByRole('button', { name: /Add from list/i }), 'Bulk workflow'),
    await markerFromLocator(hostPage.locator('textarea').first(), 'Paste chaotic list'),
    await markerFromLocator(hostPage.getByRole('button', { name: /Generate preview/i }), 'Generate preview'),
    await markerFromLocator(hostPage.getByText(/^Preview:/i), 'Review before approve')
  ]);
  await hostPage.click('button:has-text("Close")');
  await hostPage.waitForTimeout(300);

  const addCountryInput = hostPage.locator('input[placeholder="Add country..."]');
  await addCountryInput.fill('Scotland');
  await hostPage.waitForTimeout(800);
  await hostPage.click('button:has-text("Scotland")');
  await hostPage.waitForTimeout(600);

  await addCountryInput.fill('California');
  await hostPage.waitForTimeout(800);
  await hostPage.click('button:has-text("California")');
  await hostPage.waitForTimeout(600);

  const judgePage = await judgeContext.newPage();
  await setEnglishLightStorage(judgePage);
  await judgePage.goto(`${BASE_URL}/join`, { waitUntil: 'networkidle' });
  await judgePage.fill('input[placeholder="Example: Jane Doe"]', 'Judge Alpha');
  await judgePage.fill('input[placeholder="XXXXXX"]', sessionSuffix);
  await judgePage.click('button:has-text("Join Panel")');
  await judgePage.waitForTimeout(2500);
  await judgePage.screenshot({ path: path.join(OUT_DIR, '06-judge-awaiting-approval.png') });
  await markScreenshot('06-judge-awaiting-approval.png', [
    await markerFromLocator(judgePage.getByText(/Waiting for approval/i), 'Waiting status'),
    await markerFromLocator(judgePage.getByText(/approved by the host/i), 'Pending message')
  ]);

  await hostPage.waitForTimeout(1000);
  await hostPage.screenshot({ path: path.join(OUT_DIR, '07-host-pending-notification.png') });
  await markScreenshot('07-host-pending-notification.png', [
    await markerFromLocator(hostPage.getByText(/is waiting for approval/i), 'Judge request alert'),
    await markerFromLocator(hostPage.getByRole('button', { name: /Approve now/i }), 'Approve'),
    await markerFromLocator(hostPage.getByRole('button', { name: /^Reject$/i }), 'Reject')
  ]);
  await hostPage.click('button:has-text("Approve now")');
  await hostPage.waitForTimeout(1500);

  await judgePage.waitForURL(/\/session\/[^/?]+\?judge=/, { timeout: 30000 });
  await judgePage.waitForTimeout(1500);
  await judgePage.screenshot({ path: path.join(OUT_DIR, '08-judge-scoring.png') });
  await markScreenshot('08-judge-scoring.png', [
    await markerFromLocator(judgePage.locator('input[type="number"][step="0.01"]').first(), 'Score input'),
    await markerFromLocator(judgePage.getByText(/Last submitted results/i), 'Last submitted results')
  ]);

  await hostPage.click('button:has-text("Advance Phase")');
  await hostPage.waitForTimeout(800);
  await hostPage.screenshot({ path: path.join(OUT_DIR, '09-cutoff-modal.png') });
  await markScreenshot('09-cutoff-modal.png', [
    await markerFromLocator(hostPage.locator('input[type="number"]').nth(0), 'Set advancing count'),
    await markerFromLocator(hostPage.getByRole('button', { name: /Save and continue/i }), 'Save and continue')
  ]);
  await hostPage.click('button:has-text("Cancel")');
  await hostPage.waitForTimeout(600);

  await hostPage.fill('input[placeholder="—"]', '1');
  await hostPage.waitForTimeout(500);

  const hostScoreInputs = hostPage.locator('input[type="number"][step="0.01"]');
  await hostScoreInputs.nth(0).fill('9.20');
  await hostScoreInputs.nth(1).fill('8.60');
  await hostPage.waitForTimeout(500);

  const judgeScoreInputs = judgePage.locator('input[type="number"][step="0.01"]');
  await judgeScoreInputs.nth(0).fill('9.50');
  await judgeScoreInputs.nth(1).fill('8.40');
  await judgePage.waitForTimeout(800);

  await hostPage.click('button:has-text("View Winner")');
  await hostPage.waitForTimeout(2000);
  await hostPage.screenshot({ path: path.join(OUT_DIR, '10-winner-view.png') });
  await markScreenshot('10-winner-view.png', [
    await markerFromLocator(hostPage.getByRole('heading', { name: /Scotland/i }), 'Winner profile'),
    await markerFromLocator(hostPage.getByText(/Final average/i), 'Final metrics')
  ]);

  const publicPage = await hostContext.newPage();
  await setEnglishLightStorage(publicPage);
  await publicPage.goto(`${BASE_URL}/session/${sessionId}/results`, { waitUntil: 'domcontentloaded' });
  await publicPage.waitForTimeout(1500);
  await publicPage.screenshot({ path: path.join(OUT_DIR, '11-public-results.png') });
  await markScreenshot('11-public-results.png', [
    await markerFromLocator(publicPage.getByText(/^Judges \(2\)$/i), 'Public summary'),
    await markerFromLocator(publicPage.getByText(/Official Winner/i), 'Published winner card')
  ]);

  await browser.close();
  console.log(`Saved manual screenshots to ${OUT_DIR}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
