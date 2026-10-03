import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log(`[BROWSER ${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.error('[PAGE ERROR]:', err));

  console.log('Navigating to 3D view...');
  await page.goto('http://localhost:5173/?stage=reveal&demo=1&view=3d&settings3d=1', { waitUntil: 'networkidle' });

  // Wait for loading overlay to disappear
  console.log('Waiting for loading overlay to disappear...');
  await page.waitForSelector('.mosaic-3d__loading-overlay', { state: 'detached', timeout: 30000 });
  console.log('Loading overlay disappeared!');

  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/pw_3d_dome_fixed.png' });
  console.log('Saved /tmp/pw_3d_dome_fixed.png');

  // Click on Architectural button
  console.log('Clicking Architectural mode button...');
  const archBtn = page.getByRole('button', { name: '🧱 Architectural' });
  await archBtn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/pw_3d_architectural_fixed.png' });
  console.log('Saved /tmp/pw_3d_architectural_fixed.png');

  await browser.close();
}

run().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
