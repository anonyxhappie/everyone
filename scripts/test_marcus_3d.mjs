import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log(`[BROWSER ${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.error('[PAGE ERROR]:', err));

  console.log('Navigating to Marcus (?stage=reveal&demo=2&view=3d)');
  await page.goto('http://localhost:5173/?stage=reveal&demo=2&view=3d', { waitUntil: 'networkidle' });

  await page.waitForTimeout(6000);
  await page.screenshot({ path: '/tmp/test_marcus_dome.png' });

  // Open settings drawer
  console.log('Opening settings drawer...');
  const settingsToggle = page.locator('.mosaic-3d__settings-toggle');
  await settingsToggle.click();
  await page.waitForTimeout(1000);

  // Click Architectural
  console.log('Clicking Architectural...');
  await page.getByRole('button', { name: '🧱 Architectural' }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/test_marcus_arch.png' });

  // Click Cameo
  console.log('Clicking Cameo Medallion...');
  await page.getByRole('button', { name: '👤 Cameo Medallion' }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/test_marcus_cameo.png' });

  await browser.close();
}

run().catch(console.error);
