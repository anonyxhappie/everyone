import { chromium } from 'playwright';
import fs from 'fs';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => console.log(`[PAGE LOG]: ${msg.text()}`));
  page.on('pageerror', err => console.error('[PAGE ERR]:', err));

  await page.goto('http://localhost:5173/');

  const result = await page.evaluate(async () => {
    // 1. Load sample portrait image
    const img = new Image();
    img.src = '/portraits/sample-portrait-1.jpg';
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    console.log(`Image loaded: ${img.width}x${img.height}`);

    // Dynamically import depthMap
    const { computeTileDepthMap } = await import('/src/lib/depthMap.ts');

    const cols = 50;
    const rows = Math.round(50 * (img.height / img.width));
    console.log(`Testing depth map for grid: ${cols}x${rows}`);

    const depth = await computeTileDepthMap(canvas, cols, rows, 'dome');
    console.log(`Depth map computed! Length: ${depth.length}`);

    // Sample depth grid to see where elevation is high vs low
    const grid = [];
    for (let r = 0; r < rows; r += 5) {
      const rowVals = [];
      for (let c = 0; c < cols; c += 5) {
        rowVals.push(depth[r * cols + c].toFixed(2));
      }
      grid.push(`R${r.toString().padStart(2, '0')}: ` + rowVals.join(' '));
    }

    return {
      width: img.width,
      height: img.height,
      cols,
      rows,
      gridSample: grid
    };
  });

  console.log('Result:', result);
  console.log('Sampled Grid Elevations (every 5th cell):');
  console.log(result.gridSample.join('\n'));

  await browser.close();
}

run().catch(console.error);
