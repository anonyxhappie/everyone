import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log(`[BROWSER ${msg.type()}]:`, msg.text()));
  page.on('pageerror', err => console.error('[PAGE ERROR]:', err));

  console.log('Navigating to ?stage=reveal&demo=1&view=3d');
  await page.goto('http://localhost:5173/?stage=reveal&demo=1&view=3d', { waitUntil: 'networkidle' });

  await page.waitForTimeout(6000);
  await page.screenshot({ path: '/tmp/test_view_3d_dome.png' });

  // Click Architectural mode
  const archBtn = page.getByRole('button', { name: '🧱 Architectural' });
  if (await archBtn.count() > 0) {
    console.log('Clicking Architectural button...');
    await archBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/test_view_3d_arch.png' });
  } else {
    // Open settings drawer first
    console.log('Opening settings drawer...');
    const settingsToggle = page.locator('.mosaic-3d__settings-toggle');
    await settingsToggle.click();
    await page.waitForTimeout(1000);
    console.log('Clicking Architectural button in drawer...');
    await page.getByRole('button', { name: '🧱 Architectural' }).click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/test_view_3d_arch.png' });
  }

  await browser.close();
}

run().catch(console.error);
