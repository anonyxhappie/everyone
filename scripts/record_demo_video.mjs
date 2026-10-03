import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const recordingsDir = path.resolve(__dirname, '../recordings');

if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// Clean old webm files in recordings directory
for (const file of fs.readdirSync(recordingsDir)) {
  if (file.endsWith('.webm') || file.endsWith('.mp4')) {
    fs.unlinkSync(path.join(recordingsDir, file));
  }
}

async function run() {
  console.log('🚀 Starting Automated Demo Video Recording...');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-webgl',
      '--use-gl=angle',
      '--use-angle=metal',
      '--enable-features=Vulkan,DefaultANGLEMetal',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: recordingsDir,
      size: { width: 1920, height: 1080 }
    }
  });

  const page = await context.newPage();

  page.on('console', msg => console.log(`[BROWSER]: ${msg.text()}`));
  page.on('pageerror', err => console.error('[PAGE ERROR]:', err));

  // Inject Virtual Presenter Cursor and Cinematic Chapter HUD
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      // 1. Virtual Cursor
      const cursor = document.createElement('div');
      cursor.id = 'demo-virtual-cursor';
      cursor.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(214, 192, 160, 0.9) 0%, rgba(214, 192, 160, 0.4) 60%, transparent 100%);
        border: 2px solid rgba(255, 255, 255, 0.9);
        box-shadow: 0 0 16px rgba(214, 192, 160, 0.8), 0 2px 8px rgba(0, 0, 0, 0.6);
        pointer-events: none;
        z-index: 2147483647;
        transform: translate(-50%, -50%);
        transition: transform 0.04s ease-out;
      `;
      document.body.appendChild(cursor);

      // Track mouse
      window.addEventListener('mousemove', (e) => {
        cursor.style.left = `${e.clientX}px`;
        cursor.style.top = `${e.clientY}px`;
      });

      // Click ripple
      window.addEventListener('mousedown', (e) => {
        const ripple = document.createElement('div');
        ripple.style.cssText = `
          position: fixed;
          top: ${e.clientY}px;
          left: ${e.clientX}px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid rgba(214, 192, 160, 0.95);
          background: rgba(214, 192, 160, 0.35);
          pointer-events: none;
          z-index: 2147483646;
          transform: translate(-50%, -50%) scale(1);
          animation: demo-click-ripple 0.55s cubic-bezier(0.1, 0.8, 0.2, 1) forwards;
        `;
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
      });

      // Keyframes
      const style = document.createElement('style');
      style.textContent = `
        @keyframes demo-click-ripple {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(4.5); opacity: 0; }
        }
      `;
      document.head.appendChild(style);

      // 2. Cinematic Chapter HUD
      const hud = document.createElement('div');
      hud.id = 'demo-hud';
      hud.style.cssText = `
        position: fixed;
        bottom: 28px;
        left: 32px;
        z-index: 2147483640;
        background: rgba(14, 14, 17, 0.85);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(214, 192, 160, 0.25);
        border-radius: 100px;
        padding: 10px 22px;
        display: flex;
        align-items: center;
        gap: 14px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 2px 8px rgba(0, 0, 0, 0.4);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #f0ebe2;
        pointer-events: none;
        transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      `;
      hud.innerHTML = `
        <div style="width: 10px; height: 10px; border-radius: 50%; background: #d6c0a0; box-shadow: 0 0 10px #d6c0a0; flex-shrink: 0;"></div>
        <div>
          <div id="demo-hud-title" style="font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #d6c0a0; margin-bottom: 2px;">01 // ATMOSPHERIC INTRO</div>
          <div id="demo-hud-sub" style="font-size: 13px; font-weight: 400; color: #f0ebe2; opacity: 0.9;">Interactive Drifting Memory Field</div>
        </div>
      `;
      document.body.appendChild(hud);

      window.__setDemoHud = (title, sub) => {
        const titleEl = document.getElementById('demo-hud-title');
        const subEl = document.getElementById('demo-hud-sub');
        if (titleEl && subEl) {
          hud.style.opacity = '0';
          hud.style.transform = 'translateY(8px)';
          setTimeout(() => {
            titleEl.textContent = title;
            subEl.textContent = sub;
            hud.style.opacity = '1';
            hud.style.transform = 'translateY(0)';
          }, 200);
        }
      };
    });
  });

  // Helpers for smooth mouse choreography
  async function setChapter(title, sub) {
    console.log(`🎬 [CHAPTER]: ${title} - ${sub}`);
    await page.evaluate(({ t, s }) => {
      if (window.__setDemoHud) window.__setDemoHud(t, s);
    }, { t: title, s: sub });
    await page.waitForTimeout(600);
  }

  async function smoothMove(x, y, steps = 30) {
    await page.mouse.move(x, y, { steps });
  }

  async function smoothMoveToElement(locator, steps = 30) {
    const box = await locator.first().boundingBox();
    if (!box) return null;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await smoothMove(x, y, steps);
    return { x, y, box };
  }

  async function clickLocator(locator, preDelay = 350, postDelay = 500) {
    const pos = await smoothMoveToElement(locator, 25);
    if (!pos) return;
    await page.waitForTimeout(preDelay);
    await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(postDelay);
  }

  // ==========================================
  // SCENE 1: ATMOSPHERIC INTRO & FLOATING PARTICLES
  // ==========================================
  console.log('📍 Navigating to application root...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  await setChapter('01 // ATMOSPHERIC INTRO', 'Interactive Memory Cloud & Parallax');

  // Move cursor around the floating canvas to demonstrate physics repulsion
  await smoothMove(960, 450, 25);
  await page.waitForTimeout(400);
  await smoothMove(650, 350, 35);
  await page.waitForTimeout(300);
  await smoothMove(1280, 500, 35);
  await page.waitForTimeout(400);
  await smoothMove(960, 550, 25);
  await page.waitForTimeout(600);

  // Switch demo portrait to Marcus (2), then back to Sophia (1)
  const pillMarcus = page.locator('.intro__demo-pill').nth(1);
  await clickLocator(pillMarcus, 400, 800);

  const pillSophia = page.locator('.intro__demo-pill').nth(0);
  await clickLocator(pillSophia, 350, 600);

  // Click Explore Demo (Sophia)
  const exploreBtn = page.locator('.intro__demo-btn');
  await clickLocator(exploreBtn, 400, 1000);

  // ==========================================
  // SCENE 2: CINEMATIC REVEAL SEQUENCE
  // ==========================================
  await setChapter('02 // PROGRESSIVE REVEAL', 'Face Recognition to Photo Mosaic');

  // Wait for mosaic generation & phase reveal
  await page.waitForSelector('.mosaic-viewer__loading', { state: 'attached', timeout: 8000 }).catch(() => {});
  await page.waitForSelector('.mosaic-viewer__loading', { state: 'detached', timeout: 25000 }).catch(() => {});

  // Wait for viewport canvas to appear
  await page.waitForSelector('canvas.mosaic-viewer__viewport-canvas', { state: 'visible', timeout: 15000 });

  // Let the 4 reveal phases play out (Portrait -> Points -> Tiles -> Pullback)
  await page.waitForTimeout(6000);

  // Let idle shimmer catch the eye
  await smoothMove(960, 540, 20);
  await page.waitForTimeout(3000);

  // ==========================================
  // SCENE 3: DEEP ZOOM & TILE INSPECTION
  // ==========================================
  await setChapter('03 // DEEP ZOOM & INSPECT', 'Pinch-to-Zoom into Individual Memories');

  const canvas = page.locator('canvas.mosaic-viewer__viewport-canvas');
  const canvasBox = await canvas.boundingBox();
  const centerX = canvasBox ? canvasBox.x + canvasBox.width * 0.5 : 960;
  const centerY = canvasBox ? canvasBox.y + canvasBox.height * 0.45 : 480;

  await smoothMove(centerX, centerY, 30);
  await page.waitForTimeout(400);

  // Deep zoom via wheel events centered on the eye / face
  for (let i = 0; i < 7; i++) {
    await page.mouse.wheel(0, -180);
    await page.waitForTimeout(160);
  }
  await page.waitForTimeout(1000);

  // Slight pan across to show tile micro-detail
  await page.mouse.down();
  await smoothMove(centerX - 90, centerY + 30, 25);
  await page.mouse.up();
  await page.waitForTimeout(800);

  // Click on a tile to trigger the Single Photo Tile Inspector
  await page.mouse.click(centerX - 10, centerY);
  await page.waitForTimeout(700);

  // Wait for the Tile Inspector dialog if opened
  const inspector = page.locator('.mosaic-inspector__card');
  if (await inspector.isVisible()) {
    await page.waitForTimeout(1800);
    // Smoothly click 'Return to mosaic'
    const returnBtn = page.locator('.mosaic-inspector__action');
    await clickLocator(returnBtn, 300, 500);
  }

  // Open controls drawer to use Reset View
  const tuneToggle = page.locator('.mosaic-viewer__tune-toggle');
  await clickLocator(tuneToggle, 300, 500);

  // Click reset zoom button
  const resetBtn = page.locator('button[title="Reset view to 100%"]');
  if (await resetBtn.isVisible()) {
    await clickLocator(resetBtn, 300, 800);
  }

  // ==========================================
  // SCENE 4: SHAPES, 3D SHADING & FILTERS
  // ==========================================
  await setChapter('04 // SHAPES & 3D STYLES', 'Hexagons, Prisms, Bevels & Compare Mode');

  // Select Hexagon shape
  const hexBtn = page.locator('.mosaic-viewer__shape-btn').filter({ hasText: 'Hexagon' });
  if (await hexBtn.isVisible()) {
    await clickLocator(hexBtn, 300, 1000);
  }

  // Select Rounded modern shape
  const roundedBtn = page.locator('.mosaic-viewer__shape-btn').filter({ hasText: 'Rounded' });
  if (await roundedBtn.isVisible()) {
    await clickLocator(roundedBtn, 300, 1000);
  }

  // Select 3D Beveled Glass effect
  const beveledChip = page.locator('.mosaic-viewer__3d-chip').filter({ hasText: 'Beveled Glass' });
  if (await beveledChip.isVisible()) {
    await clickLocator(beveledChip, 300, 1000);
  }

  // Select Floating Tiles effect
  const floatingChip = page.locator('.mosaic-viewer__3d-chip').filter({ hasText: 'Floating Tiles' });
  if (await floatingChip.isVisible()) {
    await clickLocator(floatingChip, 300, 1000);
  }

  // Select Cinematic filter
  const cinematicChip = page.locator('.mosaic-viewer__filter-chip').filter({ hasText: 'Cinematic' });
  if (await cinematicChip.isVisible()) {
    await clickLocator(cinematicChip, 300, 1000);
  }

  // Close fine-tune drawer
  const closeDrawerBtn = page.locator('.mosaic-viewer__controls-header button');
  if (await closeDrawerBtn.isVisible()) {
    await clickLocator(closeDrawerBtn, 250, 400);
  }

  // Toggle Compare Mode
  const compareBtn = page.locator('.mosaic-viewer__compare-btn');
  if (await compareBtn.isVisible()) {
    await clickLocator(compareBtn, 400, 1400);
    // Click again to return to mosaic
    await clickLocator(compareBtn, 400, 800);
  }

  // ==========================================
  // SCENE 5: 360° 3D RELIEF STUDIO (THREE.JS)
  // ==========================================
  await setChapter('05 // 3D RELIEF STUDIO', 'Physical Bas-Relief Sculpture in Three.js');

  const btn3D = page.locator('.mosaic-viewer__3d-studio-btn');
  await clickLocator(btn3D, 400, 2500);

  // Wait for 3D container and canvas to appear
  await page.waitForSelector('.mosaic-3d canvas', { timeout: 15000 }).catch(() => {});
  // Wait for depth map computation overlay to vanish
  await page.waitForSelector('.mosaic-3d__loading-overlay', { state: 'detached', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // Rotate camera gently by dragging in 3D viewport
  await page.mouse.move(960, 500);
  await page.mouse.down();
  await smoothMove(1180, 420, 35);
  await page.mouse.up();
  await page.waitForTimeout(800);

  // Open 3D settings drawer
  const settings3DToggle = page.locator('.mosaic-3d__settings-toggle');
  if (await settings3DToggle.isVisible()) {
    await clickLocator(settings3DToggle, 300, 600);

    // Switch to Cameo Medallion mode
    const cameoBtn = page.locator('.mosaic-3d__mode-btn').filter({ hasText: 'Cameo Medallion' });
    if (await cameoBtn.isVisible()) {
      await clickLocator(cameoBtn, 300, 1200);
    }

    // Switch to Architectural mode
    const archBtn = page.locator('.mosaic-3d__mode-btn').filter({ hasText: 'Architectural' });
    if (await archBtn.isVisible()) {
      await clickLocator(archBtn, 300, 1200);
    }

    // Close 3D drawer
    const close3DDrawer = page.locator('.mosaic-3d__drawer-header button');
    if (await close3DDrawer.isVisible()) {
      await clickLocator(close3DDrawer, 250, 400);
    }
  }

  // Cycle Camera Presets
  const heroPreset = page.locator('.mosaic-3d__preset-btn').filter({ hasText: 'Hero Low' });
  if (await heroPreset.isVisible()) {
    await clickLocator(heroPreset, 300, 1000);
  }

  const profilePreset = page.locator('.mosaic-3d__preset-btn').filter({ hasText: 'Side Profile' });
  if (await profilePreset.isVisible()) {
    await clickLocator(profilePreset, 300, 1200);
  }

  // Turn on 360 Turntable rotation for 4 seconds
  const turntableBtn = page.locator('.mosaic-3d__turntable-btn');
  if (await turntableBtn.isVisible()) {
    await clickLocator(turntableBtn, 300, 4000);
    // Pause turntable
    await clickLocator(turntableBtn, 200, 400);
  }

  // Hover over a tile in 3D to show hover tooltip
  await smoothMove(960, 520, 25);
  await page.waitForTimeout(1000);

  // Close 3D Studio and return to 2D view
  const close3D = page.locator('.mosaic-3d__back-btn');
  if (await close3D.isVisible()) {
    await clickLocator(close3D, 400, 1200);
  }

  // ==========================================
  // SCENE 6: WALL PRINT STUDIO & EXPORT
  // ==========================================
  await setChapter('06 // WALL PRINT & EXPORT', 'Fine Art Gallery Mockup & 300 DPI PDF');

  const wallPrintBtn = page.locator('.mosaic-viewer__export-btn');
  if (await wallPrintBtn.isVisible()) {
    await clickLocator(wallPrintBtn, 400, 1400);

    // Click A3 size option
    const a3Option = page.locator('.wall-modal__size-card').filter({ hasText: 'A3' });
    if (await a3Option.isVisible()) {
      await clickLocator(a3Option, 300, 1000);
    }

    // Click 24x36 Gallery Poster option
    const galleryOption = page.locator('.wall-modal__size-card').filter({ hasText: '24×36"' });
    if (await galleryOption.isVisible()) {
      await clickLocator(galleryOption, 300, 1200);
    }

    // Close Wall Print modal
    const closeWallModal = page.locator('.wall-modal__close');
    if (await closeWallModal.isVisible()) {
      await clickLocator(closeWallModal, 300, 800);
    }
  }

  // Hover over Macro Detail button
  const macroBtn = page.locator('.mosaic-viewer__macro-btn');
  if (await macroBtn.isVisible()) {
    await smoothMoveToElement(macroBtn, 25);
    await page.waitForTimeout(800);
  }

  // Click Copy Link
  const copyBtn = page.locator('button[title*="Copy"]');
  if (await copyBtn.isVisible()) {
    await clickLocator(copyBtn, 300, 1000);
  }

  // Return to Intro by clicking '← New portrait'
  await setChapter('07 // INFINITE CREATIVITY', 'Your Memories. Your Masterpiece.');
  const newPortraitBtn = page.locator('.mosaic-viewer__back-btn');
  if (await newPortraitBtn.isVisible()) {
    await clickLocator(newPortraitBtn, 400, 2000);
  }

  // Final hold on atmospheric intro
  await smoothMove(960, 500, 30);
  await page.waitForTimeout(2500);

  console.log('🏁 Choreography completed! Flushing video recording...');
  await context.close();
  await browser.close();

  console.log('✅ Browser recording finished.');
}

run().catch((err) => {
  console.error('❌ Recording script failed:', err);
  process.exit(1);
});
