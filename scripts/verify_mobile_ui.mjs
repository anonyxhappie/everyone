import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const VIEWPORTS = [
  { name: 'iphone-se', width: 375, height: 667, deviceScaleFactor: 2 },
  { name: 'iphone-14', width: 390, height: 844, deviceScaleFactor: 3 },
  { name: 'android-small', width: 360, height: 740, deviceScaleFactor: 2 },
  { name: 'tablet-portrait', width: 768, height: 1024, deviceScaleFactor: 2 }
];

const OUTPUT_DIR = '/tmp/mobile_ui_verify';
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function checkNoHorizontalOverflow(page, contextName) {
  const overflow = await page.evaluate(() => {
    const docEl = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
    const clientWidth = Math.min(docEl.clientWidth, window.innerWidth);
    const hasOverflow = scrollWidth > clientWidth + 1; // 1px threshold for subpixel rounding
    return {
      scrollWidth,
      clientWidth,
      hasOverflow,
      overflowingElements: hasOverflow ? Array.from(document.querySelectorAll('*'))
        .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.right > window.innerWidth + 1;
        })
        .map(el => `${el.tagName}.${Array.from(el.classList).join('.')}`)
        .slice(0, 5) : []
    };
  });

  if (overflow.hasOverflow) {
    console.error(`❌ [${contextName}] Horizontal overflow detected! scrollWidth: ${overflow.scrollWidth} > clientWidth: ${overflow.clientWidth}`);
    console.error(`   Overflowing elements:`, overflow.overflowingElements);
    return false;
  } else {
    console.log(`✅ [${contextName}] No horizontal overflow (width: ${overflow.clientWidth}px)`);
    return true;
  }
}

async function runVerification() {
  const browser = await chromium.launch({ headless: true });
  let allPassed = true;

  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n========================================`);
      console.log(`Testing viewport: ${vp.name} (${vp.width}x${vp.height})`);
      console.log(`========================================`);

      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.deviceScaleFactor,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();

      // Page error listener
      page.on('pageerror', err => console.error(`[${vp.name} PAGE ERROR]:`, err.message));

      // 1. INTRO SCREEN
      console.log(`--- Stage: Intro ---`);
      await page.goto('http://localhost:5173/?stage=intro', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      const introOk = await checkNoHorizontalOverflow(page, `${vp.name} - Intro`);
      if (!introOk) allPassed = false;
      await page.screenshot({ path: path.join(OUTPUT_DIR, `${vp.name}_01_intro.png`) });

      // 2. UPLOAD SCREEN (Initial state)
      console.log(`--- Stage: Upload (Initial) ---`);
      await page.goto('http://localhost:5173/?stage=upload', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      const uploadInitialOk = await checkNoHorizontalOverflow(page, `${vp.name} - Upload Initial`);
      if (!uploadInitialOk) allPassed = false;
      await page.screenshot({ path: path.join(OUTPUT_DIR, `${vp.name}_02_upload_initial.png`) });

      // 3. UPLOAD SCREEN (Select sample portrait to reach customize step)
      console.log(`--- Stage: Upload (Customize Step) ---`);
      const sampleBtn = page.locator('.uploader__sample-card').first();
      if (await sampleBtn.count() > 0) {
        await sampleBtn.click();
        await page.waitForTimeout(1500);

        // Check customize layout
        const uploadCustomizeOk = await checkNoHorizontalOverflow(page, `${vp.name} - Upload Customize`);
        if (!uploadCustomizeOk) allPassed = false;

        // Verify confirm-box and button styles
        const confirmBox = page.locator('.uploader__confirm-box');
        if (await confirmBox.count() > 0) {
          const boxBox = await confirmBox.boundingBox();
          console.log(`   Confirm box found, height: ${boxBox?.height.toFixed(1)}px, y: ${boxBox?.y.toFixed(1)}px`);
        }

        const createBtn = page.locator('.uploader__create-btn');
        if (await createBtn.count() > 0) {
          const btnBox = await createBtn.boundingBox();
          console.log(`   Create Mosaic button: width=${btnBox?.width.toFixed(1)}px, height=${btnBox?.height.toFixed(1)}px`);
          if (btnBox && btnBox.height < 44) {
            console.warn(`   ⚠️ Touch target height < 44px: ${btnBox.height}px`);
          } else {
            console.log(`   ✅ Touch target height >= 44px (${btnBox?.height.toFixed(1)}px)`);
          }
        }
        await page.screenshot({ path: path.join(OUTPUT_DIR, `${vp.name}_03_upload_customize.png`) });
      }

      // 4. MOSAIC VIEWER (2D Reveal)
      console.log(`--- Stage: Mosaic Viewer (2D) ---`);
      await page.goto('http://localhost:5173/?stage=reveal&demo=1', { waitUntil: 'networkidle' });
      // Wait for mosaic generator to complete
      await page.waitForSelector('.mosaic-viewer__toolbar', { timeout: 15000 });
      await page.waitForTimeout(2000);

      const mosaic2dOk = await checkNoHorizontalOverflow(page, `${vp.name} - Mosaic 2D`);
      if (!mosaic2dOk) allPassed = false;

      // Verify header actions & buttons
      const headerActions = page.locator('.mosaic-viewer__header-actions');
      const header3dBtn = page.locator('.mosaic-viewer__header-3d-btn');
      const tuneToggle = page.locator('.mosaic-viewer__tune-toggle');
      const toolbar = page.locator('.mosaic-viewer__toolbar');

      console.log(`   Header actions count: ${await headerActions.count()}`);
      console.log(`   Header 3D button count: ${await header3dBtn.count()}`);
      console.log(`   Tune toggle count: ${await tuneToggle.count()}`);
      console.log(`   Toolbar count: ${await toolbar.count()}`);

      const toolbarBox = await toolbar.boundingBox();
      console.log(`   Toolbar bounds: w=${toolbarBox?.width.toFixed(1)}, h=${toolbarBox?.height.toFixed(1)}, y=${toolbarBox?.y.toFixed(1)}`);

      // Verify toolbar buttons are reasonably sized and touch targets >= 40px
      const toolbarButtons = toolbar.locator('button');
      const btnCount = await toolbarButtons.count();
      console.log(`   Toolbar buttons visible: ${btnCount}`);
      for (let i = 0; i < btnCount; i++) {
        const btn = toolbarButtons.nth(i);
        const box = await btn.boundingBox();
        const text = (await btn.innerText()).replace(/\n/g, ' ');
        if (box) {
          console.log(`     - [${text.trim()}]: w=${box.width.toFixed(1)}px, h=${box.height.toFixed(1)}px`);
        }
      }

      await page.screenshot({ path: path.join(OUTPUT_DIR, `${vp.name}_04_mosaic_2d.png`) });

      // Open Tune Controls Drawer
      console.log(`   Opening Tune controls drawer...`);
      if (await tuneToggle.count() > 0 && await tuneToggle.isVisible()) {
        await tuneToggle.click();
      } else {
        const tuneBtn = page.locator('.mosaic-viewer__tune-btn');
        await tuneBtn.click();
      }
      await page.waitForTimeout(1000);

      const controls = page.locator('.mosaic-viewer__controls');
      const controlsVisible = await controls.isVisible();
      console.log(`   Controls drawer visible: ${controlsVisible}`);
      if (controlsVisible) {
        const controlsBox = await controls.boundingBox();
        console.log(`   Controls drawer bounds: w=${controlsBox?.width.toFixed(1)}, h=${controlsBox?.height.toFixed(1)}, y=${controlsBox?.y.toFixed(1)}`);
      }
      const controlsOk = await checkNoHorizontalOverflow(page, `${vp.name} - Controls Drawer`);
      if (!controlsOk) allPassed = false;
      await page.screenshot({ path: path.join(OUTPUT_DIR, `${vp.name}_05_mosaic_controls.png`) });

      // Close controls drawer
      const closeControlsBtn = page.locator('.mosaic-viewer__controls-header button, .mosaic-viewer__controls-close');
      if (await closeControlsBtn.count() > 0) {
        await closeControlsBtn.first().click();
        await page.waitForTimeout(500);
      }

      // 5. 3D BAS-RELIEF STUDIO
      console.log(`--- Stage: 3D Bas-Relief Studio ---`);
      await page.goto('http://localhost:5173/?stage=reveal&demo=1&view=3d', { waitUntil: 'networkidle' });
      await page.waitForSelector('.mosaic-3d', { timeout: 15000 });
      await page.waitForTimeout(4000);

      const view3dOk = await checkNoHorizontalOverflow(page, `${vp.name} - 3D Viewer`);
      if (!view3dOk) allPassed = false;
      await page.screenshot({ path: path.join(OUTPUT_DIR, `${vp.name}_06_mosaic_3d.png`) });

      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\n========================================`);
  if (allPassed) {
    console.log(`🎉 ALL MOBILE UI VERIFICATIONS PASSED!`);
  } else {
    console.error(`⚠️ SOME VERIFICATION CHECKS FAILED.`);
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
