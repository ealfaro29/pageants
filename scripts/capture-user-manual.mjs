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

async function markScreenshot(filename, markers = []) {
  const filePath = path.join(OUT_DIR, filename);
  const image = sharp(filePath);
  const metadata = await image.metadata();
  const width = metadata.width || VIEWPORT.width;
  const height = metadata.height || VIEWPORT.height;

  const circles = markers.map((marker, idx) => `
    <g>
      <circle cx="${marker.x}" cy="${marker.y}" r="24" fill="rgba(251,191,36,0.28)" stroke="rgba(251,191,36,0.95)" stroke-width="3" />
      <circle cx="${marker.x}" cy="${marker.y}" r="12" fill="rgba(17,24,39,0.85)" />
      <text x="${marker.x}" y="${marker.y + 4}" fill="#ffffff" font-size="12" font-family="Arial, sans-serif" text-anchor="middle" font-weight="700">${idx + 1}</text>
    </g>
  `).join('\n');

  const overlaySvg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${circles}
    </svg>
  `;

  await image
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png({ quality: 88 })
    .toFile(filePath + '.tmp.png');

  await fs.rename(filePath + '.tmp.png', filePath);
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
    { x: 920, y: 630 },
    { x: 1065, y: 632 },
    { x: 870, y: 530 }
  ]);

  await hostPage.click('button:has-text("Enter system")');
  await hostPage.waitForTimeout(700);
  await hostPage.screenshot({ path: path.join(OUT_DIR, '02-landing-roles.png') });
  await markScreenshot('02-landing-roles.png', [
    { x: 485, y: 490 },
    { x: 684, y: 490 },
    { x: 885, y: 490 }
  ]);

  await hostPage.click("button:has-text(\"I'm a host\")");
  await hostPage.waitForTimeout(500);
  await hostPage.fill('input[placeholder="Example: Admin"]', 'Manual Host');
  await hostPage.fill('input[placeholder="Example: Miss Universe 2026"]', 'Manual Demo Session');
  await hostPage.click('button:has-text("Per Phase")');
  await hostPage.waitForTimeout(400);
  await hostPage.screenshot({ path: path.join(OUT_DIR, '03-create-session.png') });
  await markScreenshot('03-create-session.png', [
    { x: 690, y: 430 },
    { x: 690, y: 550 },
    { x: 822, y: 650 }
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
    { x: 1228, y: 35 },
    { x: 1020, y: 35 }
  ]);

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
  await judgePage.screenshot({ path: path.join(OUT_DIR, '05-judge-awaiting-approval.png') });
  await markScreenshot('05-judge-awaiting-approval.png', [
    { x: 683, y: 315 },
    { x: 684, y: 425 }
  ]);

  await hostPage.waitForTimeout(1000);
  await hostPage.screenshot({ path: path.join(OUT_DIR, '06-host-pending-notification.png') });
  await markScreenshot('06-host-pending-notification.png', [
    { x: 256, y: 87 },
    { x: 1050, y: 90 },
    { x: 1162, y: 90 }
  ]);
  await hostPage.click('button:has-text("Approve now")');
  await hostPage.waitForTimeout(1500);

  await judgePage.waitForURL(/\/session\/[^/?]+\?judge=/, { timeout: 30000 });
  await judgePage.waitForTimeout(1500);
  await judgePage.screenshot({ path: path.join(OUT_DIR, '07-judge-scoring.png') });
  await markScreenshot('07-judge-scoring.png', [
    { x: 778, y: 478 },
    { x: 1179, y: 188 }
  ]);

  await hostPage.click('button:has-text("Advance Phase")');
  await hostPage.waitForTimeout(800);
  await hostPage.screenshot({ path: path.join(OUT_DIR, '08-cutoff-modal.png') });
  await markScreenshot('08-cutoff-modal.png', [
    { x: 683, y: 375 },
    { x: 765, y: 530 }
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
  await hostPage.screenshot({ path: path.join(OUT_DIR, '09-winner-view.png') });
  await markScreenshot('09-winner-view.png', [
    { x: 667, y: 300 },
    { x: 670, y: 470 }
  ]);

  const publicPage = await hostContext.newPage();
  await setEnglishLightStorage(publicPage);
  await publicPage.goto(`${BASE_URL}/session/${sessionId}/results`, { waitUntil: 'domcontentloaded' });
  await publicPage.waitForTimeout(1500);
  await publicPage.screenshot({ path: path.join(OUT_DIR, '10-public-results.png') });
  await markScreenshot('10-public-results.png', [
    { x: 238, y: 202 },
    { x: 1118, y: 204 }
  ]);

  await browser.close();
  console.log(`Saved manual screenshots to ${OUT_DIR}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
