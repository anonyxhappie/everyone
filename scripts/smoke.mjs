import { chromium } from 'playwright';

const baseURL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', error => failures.push(error.message));
  const response = await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 30000 });
  if (!response?.ok()) throw new Error(`Homepage returned HTTP ${response?.status()}`);
  await page.locator('.intro').waitFor({ timeout: 15000 });
  await page.goto(`${baseURL}/?stage=upload`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('.uploader').waitFor({ timeout: 15000 });
  await page.goto(`${baseURL}/?stage=reveal&demo=1`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('.mosaic-viewer__toolbar').waitFor({ timeout: 30000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) failures.push('Horizontal overflow at 390px viewport');
  if (failures.length) throw new Error(failures.join('\n'));
  console.log('Smoke checks passed: intro, upload, demo mosaic and mobile overflow.');
} finally {
  await browser.close();
}