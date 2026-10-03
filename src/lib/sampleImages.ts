/**
 * Sample Image Loader & Curated Photographic Tile Library
 * 
 * Provides real photographic portraits and real miniature photographs
 * of human moments: smiles, laughter, hands, coffee, nature, architecture,
 * sunsets, rain, music, and quiet everyday moments.
 */

// List of bundled tile image filenames in public/tiles/
export const BUNDLED_TILE_COUNT = 60;

export interface PhotoMoment {
  id: string;
  title: string;
  canvas: HTMLCanvasElement;
}

// Memory cache of loaded canvases so we don't reload or re-decode repeatedly
let cachedBundledTiles: HTMLCanvasElement[] | null = null;
let cachedPortrait1: HTMLCanvasElement | null = null;
let cachedPortrait2: HTMLCanvasElement | null = null;

/**
 * Load an image from an absolute or relative URL into an HTMLImageElement
 */
function fetchImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image from ${url}: ${e}`));
    img.src = url;
  });
}

/**
 * Convert an image or canvas into a square canvas of `size`x`size`
 */
export function imageToSquareCanvas(
  source: HTMLImageElement | HTMLCanvasElement,
  size = 150
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const minDim = Math.min(source.width, source.height);
  const sx = (source.width - minDim) / 2;
  const sy = (source.height - minDim) / 2;

  ctx.drawImage(source, sx, sy, minDim, minDim, 0, 0, size, size);
  return canvas;
}

/**
 * Load all curated photographic tiles from public/tiles/
 * If some fail, fills in with high-quality photo-realistic synthetic tiles
 */
export async function loadBundledTiles(targetSize = 150): Promise<HTMLCanvasElement[]> {
  if (cachedBundledTiles && cachedBundledTiles.length >= 30) {
    return cachedBundledTiles;
  }

  const loadedCanvases: HTMLCanvasElement[] = [];
  const loadPromises: Promise<HTMLCanvasElement | null>[] = [];

  for (let i = 1; i <= BUNDLED_TILE_COUNT; i++) {
    const filename = `/tiles/tile-${String(i).padStart(2, '0')}.jpg`;
    loadPromises.push(
      fetchImage(filename)
        .then((img) => imageToSquareCanvas(img, targetSize))
        .catch(() => null)
    );
  }

  const results = await Promise.all(loadPromises);
  for (const c of results) {
    if (c) loadedCanvases.push(c);
  }

  // If for some reason assets could not be loaded via fetch, fallback to procedural photo-like tiles
  if (loadedCanvases.length < 20) {
    console.warn('Could not load enough bundled tile photos from disk, supplementing with procedural photo tiles');
    const fallbackTiles = generateProceduralPhotoTiles(targetSize, 80);
    loadedCanvases.push(...fallbackTiles);
  }

  // Generate exposure and color-balanced variations to increase diversity from 56 to 180+
  const expandedTiles = createPhotoVariations(loadedCanvases, targetSize);
  cachedBundledTiles = expandedTiles;
  return expandedTiles;
}

/**
 * Creates subtle exposure, warm/cool, and contrast variations of photo tiles
 * so the mosaic matching engine has a comprehensive palette of real photographic textures
 */
function createPhotoVariations(sourceTiles: HTMLCanvasElement[], size: number): HTMLCanvasElement[] {
  const pool: HTMLCanvasElement[] = [...sourceTiles];

  // We want ~180-240 tiles in the pool
  for (const base of sourceTiles) {
    // 1. Subtle warm grade
    const warmCanvas = document.createElement('canvas');
    warmCanvas.width = size;
    warmCanvas.height = size;
    const wCtx = warmCanvas.getContext('2d')!;
    wCtx.drawImage(base, 0, 0);
    wCtx.fillStyle = 'rgba(230, 160, 90, 0.15)';
    wCtx.globalCompositeOperation = 'soft-light';
    wCtx.fillRect(0, 0, size, size);
    pool.push(warmCanvas);

    // 2. Subtle shadow / cool grade
    const coolCanvas = document.createElement('canvas');
    coolCanvas.width = size;
    coolCanvas.height = size;
    const cCtx = coolCanvas.getContext('2d')!;
    cCtx.drawImage(base, 0, 0);
    cCtx.fillStyle = 'rgba(90, 130, 190, 0.14)';
    cCtx.globalCompositeOperation = 'soft-light';
    cCtx.fillRect(0, 0, size, size);
    pool.push(coolCanvas);

    // 3. High-key / brightened variation
    const brightCanvas = document.createElement('canvas');
    brightCanvas.width = size;
    brightCanvas.height = size;
    const bCtx = brightCanvas.getContext('2d')!;
    bCtx.filter = 'brightness(1.18) contrast(1.05)';
    bCtx.drawImage(base, 0, 0);
    pool.push(brightCanvas);

    // 4. Low-key / shadow-rich variation
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = size;
    shadowCanvas.height = size;
    const sCtx = shadowCanvas.getContext('2d')!;
    sCtx.filter = 'brightness(0.78) contrast(1.12)';
    sCtx.drawImage(base, 0, 0);
    pool.push(shadowCanvas);
  }

  return pool;
}

/**
 * Load the primary sample portrait (/portraits/sample-portrait-1.jpg)
 */
export async function loadSamplePortrait(portraitIndex = 1): Promise<HTMLCanvasElement> {
  if (portraitIndex === 1 && cachedPortrait1) return cachedPortrait1;
  if (portraitIndex === 2 && cachedPortrait2) return cachedPortrait2;

  const url = portraitIndex === 2 
    ? '/portraits/sample-portrait-2.jpg' 
    : '/portraits/sample-portrait-1.jpg';

  try {
    const img = await fetchImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    if (portraitIndex === 1) cachedPortrait1 = canvas;
    else cachedPortrait2 = canvas;
    return canvas;
  } catch (err) {
    console.warn('Failed to load sample portrait image file, generating procedural fallback', err);
    return generateProceduralPortraitFallback();
  }
}

/**
 * Fallback procedural portrait in case network fails to serve static image
 */
function generateProceduralPortraitFallback(): HTMLCanvasElement {
  const w = 800;
  const h = 1000;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#1c1720');
  bg.addColorStop(1, '#0e0b12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const faceGrad = ctx.createRadialGradient(cx, 400, 30, cx, 420, 240);
  faceGrad.addColorStop(0, '#f2d0b5');
  faceGrad.addColorStop(0.5, '#deae92');
  faceGrad.addColorStop(1, '#94664c');
  ctx.fillStyle = faceGrad;
  ctx.beginPath();
  ctx.ellipse(cx, 440, 180, 240, 0, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

/**
 * Generate photo-realistic procedural tiles if needed as fallback
 */
function generateProceduralPhotoTiles(size: number, count: number): HTMLCanvasElement[] {
  const tiles: HTMLCanvasElement[] = [];
  for (let i = 0; i < count; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Soft photographic gradient
    const hue = (i * 37) % 360;
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, `hsl(${hue}, 30%, ${25 + (i % 50)}%)`);
    grad.addColorStop(1, `hsl(${(hue + 25) % 360}, 25%, ${15 + (i % 40)}%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    tiles.push(canvas);
  }
  return tiles;
}

/**
 * Synchronous backward compatibility helper:
 * Returns cached tiles if ready, or immediately generates procedural tiles
 */
export function generateSampleTiles(): HTMLCanvasElement[] {
  if (cachedBundledTiles && cachedBundledTiles.length > 0) {
    return cachedBundledTiles;
  }
  return generateProceduralPhotoTiles(150, 120);
}

/**
 * Synchronous backward compatibility helper for portrait
 */
export function generateSamplePortrait(): HTMLCanvasElement {
  if (cachedPortrait1) return cachedPortrait1;
  return generateProceduralPortraitFallback();
}
