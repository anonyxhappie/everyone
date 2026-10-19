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

// Clean old story webm files
for (const file of fs.readdirSync(recordingsDir)) {
  if (file.startsWith('story_') && file.endsWith('.webm')) {
    fs.unlinkSync(path.join(recordingsDir, file));
  }
}

async function run() {
  console.log('🎬 Starting Seamless 18s Cinematic Story Video Recording...');

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

  // Inject Presenter Cursor and Cinematic Story Subtitle
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      // 1. Virtual Glowing Cursor
      const cursor = document.createElement('div');
      cursor.id = 'story-cursor';
      cursor.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(214, 192, 160, 0.95) 0%, rgba(214, 192, 160, 0.45) 60%, transparent 100%);
        border: 2px solid rgba(255, 255, 255, 0.95);
        box-shadow: 0 0 18px rgba(214, 192, 160, 0.85), 0 2px 10px rgba(0, 0, 0, 0.6);
        pointer-events: none;
        z-index: 2147483647;
        transform: translate(-50%, -50%);
        transition: transform 0.03s ease-out;
      `;
      document.body.appendChild(cursor);

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
          animation: story-click-ripple 0.5s cubic-bezier(0.1, 0.8, 0.2, 1) forwards;
        `;
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 550);
      });

      const style = document.createElement('style');
      style.textContent = `
        @keyframes story-click-ripple {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(4.2); opacity: 0; }
        }
      `;
      document.head.appendChild(style);

      // 2. Cinematic Story Subtitle
      const caption = document.createElement('div');
      caption.id = 'story-caption';
      caption.style.cssText = `
        position: fixed;
        bottom: 50px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483640;
        background: rgba(12, 12, 15, 0.85);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(214, 192, 160, 0.35);
        border-radius: 100px;
        padding: 11px 34px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Georgia, serif;
        font-size: 16px;
        letter-spacing: 0.05em;
        color: #f7f3ea;
        box-shadow: 0 16px 44px rgba(0, 0, 0, 0.8);
        pointer-events: none;
        text-align: center;
        opacity: 0;
        transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      `;
      document.body.appendChild(caption);

      window.__setStoryCaption = (text) => {
        caption.style.opacity = '0';
        caption.style.transform = 'translate(-50%, 6px)';
        setTimeout(() => {
          caption.textContent = text;
          caption.style.opacity = '1';
          caption.style.transform = 'translate(-50%, 0)';
        }, 160);
      };
    });
  });

  async function setCaption(text) {
    console.log(`💬 [STORY]: ${text}`);
    await page.evaluate((t) => {
      if (window.__setStoryCaption) window.__setStoryCaption(t);
    }, text);
    await page.waitForTimeout(200);
  }

  async function smoothMove(x, y, steps = 18) {
    await page.mouse.move(x, y, { steps });
  }

  async function clickLocator(locator, preDelay = 120, postDelay = 200) {
    const box = await locator.first().boundingBox();
    if (!box) return;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await smoothMove(x, y, 16);
    if (preDelay) await page.waitForTimeout(preDelay);
    await page.mouse.click(x, y);
    if (postDelay) await page.waitForTimeout(postDelay);
  }

  // ----------------------------------------------------
  // ACT 1 (0.0s - 3.2s): THE CONCEPT & FLOATING MEMORIES
  // ----------------------------------------------------
  console.log('🎬 Act I: The Concept...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);

  await setCaption('One face. A thousand little worlds.');
  await smoothMove(960, 480, 15);
  await page.waitForTimeout(200);
  await smoothMove(720, 360, 18);
  await page.waitForTimeout(150);
  await smoothMove(1200, 520, 18);

  // Click explore demo
  const exploreBtn = page.locator('.intro__demo-btn');
  await clickLocator(exploreBtn, 120, 350);

  // ----------------------------------------------------
  // ACT 2 (3.2s - 6.5s): THE SYNTHESIZED PORTRAIT
  // ----------------------------------------------------
  console.log('🎬 Act II: The Portrait Emergence...');
  // Wait for loading overlay to vanish
  await page.waitForSelector('.mosaic-viewer__loading', { state: 'detached', timeout: 20000 }).catch(() => {});
  await page.waitForSelector('canvas.mosaic-viewer__viewport-canvas', { state: 'visible', timeout: 15000 });

  await setCaption('A human portrait woven from life moments.');
  await page.waitForTimeout(1800);

  // ----------------------------------------------------
  // ACT 3 (6.5s - 11.5s): DEEP DIVE INTO MICRO-PHOTOS
  // ----------------------------------------------------
  console.log('🎬 Act III: Macro Deep Zoom & Discovery...');
  await setCaption('Zoom in... every single tile is a real memory.');

  const eyeX = 960;
  const eyeY = 480;
  await smoothMove(eyeX, eyeY, 18);

  // Rapid smooth zoom into the eye (6x magnification)
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -180);
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(500);

  // Click on a tile to reveal inspected card
  await page.mouse.click(eyeX - 15, eyeY + 5);
  await page.waitForTimeout(400);

  const inspector = page.locator('.mosaic-inspector__card');
  if (await inspector.isVisible()) {
    await setCaption('Every photograph has its own story.');
    await page.waitForTimeout(1500);
    const returnBtn = page.locator('.mosaic-inspector__action');
    await clickLocator(returnBtn, 100, 250);
  }

  // Open drawer and click reset view
  const tuneToggle = page.locator('.mosaic-viewer__tune-toggle');
  await clickLocator(tuneToggle, 100, 250);

  const resetBtn = page.locator('button[title="Reset view to 100%"]');
  if (await resetBtn.isVisible()) {
    await clickLocator(resetBtn, 100, 350);
  }

  // Close drawer
  const closeDrawerBtn = page.locator('.mosaic-viewer__controls-header button');
  if (await closeDrawerBtn.isVisible()) {
    await clickLocator(closeDrawerBtn, 100, 250);
  }

  // ----------------------------------------------------
  // ACT 4 (11.5s - 16.5s): THE PHYSICAL 3D SCULPTURE
  // ----------------------------------------------------
  console.log('🎬 Act IV: Physical 3D Topographic Sculpture...');
  await setCaption('Now touch it in physical 3D.');

  // Seamlessly launch 3D Studio without page reload!
  const btn3D = page.locator('.mosaic-viewer__3d-studio-btn');
  await clickLocator(btn3D, 150, 800);

  // Wait for 3D canvas and depth overlay to vanish
  await page.waitForSelector('.mosaic-3d canvas', { timeout: 15000 }).catch(() => {});
  await page.waitForSelector('.mosaic-3d__loading-overlay', { state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);

  // Switch to Hero Low dramatic angle
  const heroPreset = page.locator('.mosaic-3d__preset-btn').filter({ hasText: 'Hero Low' });
  if (await heroPreset.isVisible()) {
    await clickLocator(heroPreset, 100, 400);
  }

  // Turn on 360 Turntable rotation for 3.0s of smooth cinematic spin
  const turntableBtn = page.locator('.mosaic-3d__turntable-btn');
  if (await turntableBtn.isVisible()) {
    await clickLocator(turntableBtn, 100, 2800);
    // Pause turntable
    await clickLocator(turntableBtn, 50, 150);
  }

  // Return to 2D view seamlessly!
  const close3D = page.locator('.mosaic-3d__back-btn');
  if (await close3D.isVisible()) {
    await clickLocator(close3D, 150, 400);
  }

  // ----------------------------------------------------
  // ACT 5 (16.5s - 19.0s): FINALE & SIGNATURE
  // ----------------------------------------------------
  console.log('🎬 Act V: Finale...');
  await setCaption('EVERYONE IS PART OF YOU · Your memories. Your masterpiece.');
  await smoothMove(960, 520, 20);
  await page.waitForTimeout(2000);

  console.log('🏁 Closing recording context...');
  await context.close();
  await browser.close();
  console.log('✅ Seamless story video recording completed!');
}

run().catch((err) => {
  console.error('❌ Story recording failed:', err);
  process.exit(1);
});
