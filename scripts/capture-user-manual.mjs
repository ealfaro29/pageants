import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.MANUAL_BASE_URL || 'http://127.0.0.1:4173';
const OUT_DIR = path.resolve('public/manual');

async function ensureDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

async function setEnglishStorage(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('pageants-scoring-language', 'en');
    window.localStorage.setItem('pageants-scoring-theme', 'dark');
  });
}

async function main() {
  await ensureDir();
  const browser = await chromium.launch({ headless: true });

  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const judgeContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } });

  const hostPage = await hostContext.newPage();
  await setEnglishStorage(hostPage);

  await hostPage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await hostPage.screenshot({ path: path.join(OUT_DIR, '01-landing.png'), fullPage: true });

  await hostPage.goto(`${BASE_URL}/create`, { waitUntil: 'networkidle' });
  await hostPage.fill('input[placeholder="Example: Admin"]', 'Manual Host');
  await hostPage.fill('input[placeholder="Example: Miss Universe 2026"]', 'Manual Demo Session');
  await hostPage.screenshot({ path: path.join(OUT_DIR, '02-create-session.png'), fullPage: true });

  await hostPage.click('button:has-text("Create Session")');
  await hostPage.waitForURL(/\/session\/[^/?]+\?judge=/, { timeout: 30000 });
  await hostPage.waitForTimeout(2000);

  const sessionUrl = hostPage.url();
  const sessionMatch = sessionUrl.match(/\/session\/([^/?]+)/);
  if (!sessionMatch) throw new Error(`Unable to parse session id from URL: ${sessionUrl}`);
  const sessionId = sessionMatch[1];

  await hostPage.screenshot({ path: path.join(OUT_DIR, '03-host-board.png'), fullPage: true });

  const addCountryInput = hostPage.locator('input[placeholder="Add country..."]');
  await addCountryInput.fill('Scotland');
  await hostPage.waitForTimeout(800);
  await hostPage.click('button:has-text("Add \\"Scotland\\""), button:has-text("Scotland")');
  await hostPage.waitForTimeout(600);

  await addCountryInput.fill('California');
  await hostPage.waitForTimeout(800);
  await hostPage.click('button:has-text("Add \\"California\\""), button:has-text("California")');
  await hostPage.waitForTimeout(600);

  await hostPage.fill('input[placeholder="—"]', '1');
  await hostPage.waitForTimeout(500);
  await hostPage.screenshot({ path: path.join(OUT_DIR, '04-participants-and-cutoff.png'), fullPage: true });

  const judgePage = await judgeContext.newPage();
  await setEnglishStorage(judgePage);
  await judgePage.goto(`${BASE_URL}/join`, { waitUntil: 'networkidle' });
  await judgePage.fill('input[placeholder="Example: Jane Doe"]', 'Judge Alpha');
  await judgePage.fill('input[placeholder="MU-XXXXX"]', sessionId);
  await judgePage.click('button:has-text("Join Panel")');
  await judgePage.waitForTimeout(2500);
  await judgePage.screenshot({ path: path.join(OUT_DIR, '05-judge-awaiting-approval.png'), fullPage: true });

  await hostPage.click('button:has-text("Settings")');
  await hostPage.waitForTimeout(1000);
  await hostPage.screenshot({ path: path.join(OUT_DIR, '06-host-approves-judge.png'), fullPage: true });
  await hostPage.click('button:has-text("Approve")');
  await hostPage.waitForTimeout(1500);
  const closeSettingsButton = hostPage.locator('button[aria-label="Close settings"], button[aria-label="Close"]').first();
  if (await closeSettingsButton.isVisible().catch(() => false)) {
    await closeSettingsButton.click();
  } else {
    await hostPage.keyboard.press('Escape');
    await hostPage.keyboard.press('Escape');
  }
  await hostPage.waitForSelector('div.fixed.inset-0.z-50.flex.items-center.justify-center.p-4.bg-black\\/70.backdrop-blur-sm', { state: 'detached', timeout: 10000 }).catch(() => {});
  await hostPage.waitForTimeout(800);

  await judgePage.waitForURL(/\/session\/[^/?]+\?judge=/, { timeout: 30000 });
  await judgePage.waitForTimeout(1500);
  await judgePage.screenshot({ path: path.join(OUT_DIR, '07-judge-board.png'), fullPage: true });

  const hostScoreInputs = hostPage.locator('input[type="number"][step="0.01"]');
  await hostScoreInputs.nth(0).fill('9.20');
  await hostScoreInputs.nth(1).fill('8.60');
  await hostPage.waitForTimeout(500);

  const judgeScoreInputs = judgePage.locator('input[type="number"][step="0.01"]');
  await judgeScoreInputs.nth(0).fill('9.50');
  await judgeScoreInputs.nth(1).fill('8.40');
  await judgePage.waitForTimeout(800);

  await hostPage.screenshot({ path: path.join(OUT_DIR, '08-scoring-complete.png'), fullPage: true });
  await hostPage.click('button:has-text("View Winner")');
  await hostPage.waitForTimeout(2000);
  await hostPage.screenshot({ path: path.join(OUT_DIR, '09-winner-view.png'), fullPage: true });

  const publicPage = await hostContext.newPage();
  await setEnglishStorage(publicPage);
  await publicPage.goto(`${BASE_URL}/session/${sessionId}/results`, { waitUntil: 'domcontentloaded' });
  await publicPage.waitForTimeout(1500);
  await publicPage.screenshot({ path: path.join(OUT_DIR, '10-public-results.png'), fullPage: true });

  await browser.close();
  console.log(`Saved manual screenshots to ${OUT_DIR}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
