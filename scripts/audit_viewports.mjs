import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const VIEWPORTS = [
  { name: '320x568', width: 320, height: 568, isMobile: true },
  { name: '360x800', width: 360, height: 800, isMobile: true },
  { name: '390x844', width: 390, height: 844, isMobile: true },
  { name: '430x932', width: 430, height: 932, isMobile: true },
  { name: '768x1024', width: 768, height: 1024, isMobile: true },
  { name: '1440x900', width: 1440, height: 900, isMobile: false }
];

const OUTPUT_DIR = '/tmp/viewport_audit';
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function checkOverflow(page, label) {
  const result = await page.evaluate(() => {
    const docEl = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
    const clientWidth = Math.min(docEl.clientWidth, window.innerWidth);
    const hasOverflow = scrollWidth > clientWidth + 1;
    const overflowing = [];
    if (hasOverflow) {
      document.querySelectorAll('*').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.right > window.innerWidth + 1) {
          overflowing.push({
            tag: el.tagName,
            cls: el.className,
            right: rect.right,
            winWidth: window.innerWidth
          });
        }
      });
    }
    return { scrollWidth, clientWidth, hasOverflow, overflowing: overflowing.slice(0, 5) };
  });

  if (result.hasOverflow) {
    console.error(`❌ [${label}] Overflow! scrollWidth=${result.scrollWidth}, clientWidth=${result.clientWidth}`);
    console.error('   Elements:', result.overflowing);
    return false;
  }
  console.log(`✅ [${label}] No overflow (${result.clientWidth}px)`);
  return true;
}

async function audit() {
  const browser = await chromium.launch({ headless: true });
  let hasFailures = false;

  for (const vp of VIEWPORTS) {
    console.log(`\n========================================`);
    console.log(`Auditing: ${vp.name} (${vp.width}x${vp.height})`);
    console.log(`========================================`);

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile
    });
    const page = await context.newPage();

    // 1. Landing Screen
    await page.goto('http://localhost:5173/?stage=intro', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const introOk = await checkOverflow(page, `${vp.name} Intro`);
    if (!introOk) hasFailures = true;
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${vp.name}_intro.png`) });

    // Check primary button visibility without scroll
    const primaryBtn = page.locator('.intro__cta');
    const isVisible = await primaryBtn.isVisible();
    const btnBox = await primaryBtn.boundingBox();
    console.log(`   CTA visible: ${isVisible}, pos: y=${btnBox?.y.toFixed(1)}, h=${btnBox?.height.toFixed(1)}px, w=${btnBox?.width.toFixed(1)}px`);
    if (btnBox && (btnBox.y + btnBox.height > vp.height)) {
      console.warn(`⚠️ [${vp.name} Intro] Primary CTA extends below viewport! (${btnBox.y + btnBox.height} > ${vp.height})`);
    }

    // 2. Mosaic 2D View
    await page.goto('http://localhost:5173/?stage=reveal&demo=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('.mosaic-viewer__toolbar', { timeout: 15000 });
    await page.waitForTimeout(1000);
    const mosaicOk = await checkOverflow(page, `${vp.name} Mosaic 2D`);
    if (!mosaicOk) hasFailures = true;
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${vp.name}_mosaic.png`) });

    // Check toolbar buttons and touch target sizes
    const toolbar = page.locator('.mosaic-viewer__toolbar');
    const toolbarBox = await toolbar.boundingBox();
    console.log(`   Toolbar: w=${toolbarBox?.width.toFixed(1)}px, h=${toolbarBox?.height.toFixed(1)}px, y=${toolbarBox?.y.toFixed(1)}px`);

    const buttons = toolbar.locator('button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const b = buttons.nth(i);
      const box = await b.boundingBox();
      const txt = (await b.innerText()).replace(/\n/g, ' ').trim();
      if (box && (box.width < 36 || box.height < 36)) {
        console.warn(`   ⚠️ Button [${txt}] is small: ${box.width.toFixed(1)}x${box.height.toFixed(1)}px`);
      }
    }

    // 3. Open Controls
    const tuneToggle = page.locator('.mosaic-viewer__tune-toggle');
    if (await tuneToggle.isVisible()) {
      await tuneToggle.click();
    } else {
      const tuneBtn = page.locator('.mosaic-viewer__tune-btn');
      if (await tuneBtn.isVisible()) await tuneBtn.click();
    }
    await page.waitForTimeout(500);
    const controls = page.locator('.mosaic-viewer__controls');
    if (await controls.isVisible()) {
      const controlsBox = await controls.boundingBox();
      console.log(`   Controls drawer: w=${controlsBox?.width.toFixed(1)}px, h=${controlsBox?.height.toFixed(1)}px, y=${controlsBox?.y.toFixed(1)}px`);
      const controlsOk = await checkOverflow(page, `${vp.name} Controls`);
      if (!controlsOk) hasFailures = true;
      await page.screenshot({ path: path.join(OUTPUT_DIR, `${vp.name}_controls.png`) });
    }

    await context.close();
  }

  await browser.close();
  console.log(`\nAudit complete! Failures: ${hasFailures ? 'YES' : 'NONE'}`);
}

audit().catch(err => {
  console.error(err);
  process.exit(1);
});
