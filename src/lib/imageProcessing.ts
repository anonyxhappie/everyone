// Load an image from a File or URL, return HTMLImageElement
export function loadImage(source: File | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    if (typeof source === 'string') {
      img.src = source;
    } else {
      img.src = URL.createObjectURL(source);
    }
  });
}

// Create a square thumbnail of an image at a target size, return canvas
export function createThumbnail(img: HTMLImageElement | HTMLCanvasElement, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Crop to square aspect ratio
  const minDim = Math.min(img.width, img.height);
  const sx = (img.width - minDim) / 2;
  const sy = (img.height - minDim) / 2;
  
  ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
  return canvas;
}

// Get ImageData from a canvas
export function getCanvasImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d')!;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// Resize image to fit within maxWidth x maxHeight maintaining aspect ratio
export function resizeImage(img: HTMLImageElement | HTMLCanvasElement, maxWidth: number, maxHeight: number): HTMLCanvasElement {
  let ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
  if (ratio > 1) ratio = 1;
  
  const width = Math.round(img.width * ratio);
  const height = Math.round(img.height * ratio);
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  
  return canvas;
}

// Extract a cropped region from an image
export function cropImage(
  img: HTMLImageElement | HTMLCanvasElement, 
  cropX: number, cropY: number, 
  cropWidth: number, cropHeight: number,
  outputWidth: number, outputHeight: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
  
  return canvas;
}

/**
 * Systematic Multi-Scale Self-Crop Generator:
 * Generates 180-260 distinct square crops strictly from the SAME image.
 * 
 * NO random or stock photos are ever used.
 * Captures all scales:
 * - Micro details (pupil, iris, eyelashes, lips, hair strands, skin textures)
 * - Fine features (full eye, smile, nose, cheekbone, ear, clothing detail)
 * - Medium features (jawline, forehead, hair mass, collar)
 * - Broad context (facial silhouette, background ambiance)
 */
export function generateSelfCrops(
  sourceCanvas: HTMLCanvasElement,
  targetTileSize = 360
): HTMLCanvasElement[] {
  const crops: HTMLCanvasElement[] = [];
  const W = sourceCanvas.width;
  const H = sourceCanvas.height;
  const minDim = Math.min(W, H);

  // Fast check on source canvas pixel data for feature detection
  const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const srcData = srcCtx ? srcCtx.getImageData(0, 0, W, H).data : null;

  const faceCenterX = W * 0.5;
  const faceCenterY = H * 0.44;

  // Helper to compute local luminance variance in candidate region
  const checkVariance = (sx: number, sy: number, size: number): number => {
    if (!srcData) return 10;
    const step = Math.max(2, Math.floor(size / 16));
    let sum = 0, sumSq = 0, count = 0;
    const endX = Math.min(W, sx + size);
    const endY = Math.min(H, sy + size);
    for (let y = sy; y < endY; y += step) {
      for (let x = sx; x < endX; x += step) {
        const idx = (y * W + x) * 4;
        const lum = 0.299 * srcData[idx] + 0.587 * srcData[idx + 1] + 0.114 * srcData[idx + 2];
        sum += lum;
        sumSq += lum * lum;
        count++;
      }
    }
    if (count === 0) return 0;
    const mean = sum / count;
    return Math.sqrt(Math.max(0, sumSq / count - mean * mean));
  };

  // Helper to safely extract a square crop, nudging flat regions towards subject features
  const addCrop = (centerX: number, centerY: number, cropSize: number) => {
    let size = Math.max(24, Math.min(minDim, Math.round(cropSize)));
    let half = size / 2;
    let cx = centerX;
    let cy = centerY;

    let sx = Math.max(0, Math.min(W - size, Math.round(cx - half)));
    let sy = Math.max(0, Math.min(H - size, Math.round(cy - half)));

    // If region is completely uniform (flat background / flat dark fabric),
    // nudge towards face center to include contour, hair, or edge
    if (srcData) {
      let v = checkVariance(sx, sy, size);
      let attempts = 0;
      while (v < 5.5 && attempts < 3) {
        cx = cx * 0.65 + faceCenterX * 0.35;
        cy = cy * 0.65 + faceCenterY * 0.35;
        size = Math.min(minDim, Math.round(size * 1.15));
        half = size / 2;
        sx = Math.max(0, Math.min(W - size, Math.round(cx - half)));
        sy = Math.max(0, Math.min(H - size, Math.round(cy - half)));
        v = checkVariance(sx, sy, size);
        attempts++;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetTileSize;
    canvas.height = targetTileSize;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(sourceCanvas, sx, sy, size, size, 0, 0, targetTileSize, targetTileSize);
    crops.push(canvas);
  };

  // 1. High-Density Facial Core Scale (eyes, nose, lips, smile, expressions)
  const facialSizes = [minDim * 0.11, minDim * 0.15, minDim * 0.20, minDim * 0.26];
  for (let i = 0; i < 48; i++) {
    const size = facialSizes[i % facialSizes.length];
    const jitterX = (Math.random() - 0.5) * W * 0.42;
    const jitterY = (Math.random() - 0.5) * H * 0.45;
    addCrop(faceCenterX + jitterX, faceCenterY + jitterY, size);
  }

  // 2. Micro Detail Scale (capturing eyes, lashes, skin, hair strands, fabric)
  const microSize = minDim * 0.12;
  const colsMicro = 8;
  const rowsMicro = 10;
  for (let r = 0; r < rowsMicro; r++) {
    const cy = ((r + 0.5) / rowsMicro) * H;
    for (let c = 0; c < colsMicro; c++) {
      const cx = ((c + 0.5) / colsMicro) * W;
      addCrop(cx, cy, microSize);
    }
  }

  // 3. Feature Scale (full eyes, nose, smile, ears, cheek contours)
  const featureSize = minDim * 0.22;
  const colsFeature = 6;
  const rowsFeature = 7;
  for (let r = 0; r < rowsFeature; r++) {
    const cy = ((r + 0.5) / rowsFeature) * H;
    for (let c = 0; c < colsFeature; c++) {
      const cx = ((c + 0.5) / colsFeature) * W;
      addCrop(cx, cy, featureSize);
    }
  }

  // 4. Medium Scale (half face, jawline, forehead, hair volume, collar)
  const medSize = minDim * 0.36;
  const colsMed = 4;
  const rowsMed = 4;
  for (let r = 0; r < rowsMed; r++) {
    const cy = ((r + 0.5) / rowsMed) * H;
    for (let c = 0; c < colsMed; c++) {
      const cx = ((c + 0.5) / colsMed) * W;
      addCrop(cx, cy, medSize);
    }
  }

  // 5. Broad Context Scale (head and shoulders, overall portrait context)
  const broadSize = minDim * 0.58;
  for (let r = 0; r < 2; r++) {
    const cy = ((r + 0.5) / 2) * H;
    for (let c = 0; c < 2; c++) {
      const cx = ((c + 0.5) / 2) * W;
      addCrop(cx, cy, broadSize);
    }
  }

  return crops;
}

// Backward compatibility helper
export function extractPatchesFromPortrait(
  portraitCanvas: HTMLCanvasElement,
  count = 60,
  patchSize = 140
): HTMLCanvasElement[] {
  return generateSelfCrops(portraitCanvas, patchSize).slice(0, count);
}

// Revoke object URL safely
export function revokeURL(url: string): void {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

export type FilterPreset = 'none' | 'cinematic' | 'noir' | 'vintage' | 'editorial' | 'vivid' | 'golden';

export interface ImageAdjustments {
  contrast: number; // 0.7 to 1.6, default 1.10
  saturation: number; // 0.0 to 2.0, default 1.00
  warmth: number; // -50 to +50, default 0
  vignette: number; // 0.0 to 0.6, default 0.15
}

/**
 * Generate CSS filter string from preset and adjustments
 */
export function buildFilterCSS(
  preset: FilterPreset = 'none',
  adjustments: ImageAdjustments = { contrast: 1.1, saturation: 1.0, warmth: 0, vignette: 0.15 }
): string {
  const parts: string[] = [];

  let contrastMul = adjustments.contrast ?? 1.1;
  let satMul = adjustments.saturation ?? 1.0;
  let brightMul = 1.0;
  let sepiaVal = 0;
  let hueDeg = 0;

  switch (preset) {
    case 'cinematic':
      contrastMul *= 1.15;
      satMul *= 1.1;
      sepiaVal = 0.22;
      hueDeg = -8;
      break;
    case 'noir':
      parts.push('grayscale(100%)');
      contrastMul *= 1.35;
      brightMul = 1.04;
      break;
    case 'vintage':
      contrastMul *= 0.95;
      sepiaVal = 0.32;
      satMul *= 0.90;
      hueDeg = -12;
      break;
    case 'editorial':
      contrastMul *= 1.22;
      satMul *= 0.85;
      hueDeg = 10;
      break;
    case 'vivid':
      contrastMul *= 1.10;
      satMul *= 1.45;
      break;
    case 'golden':
      contrastMul *= 1.10;
      sepiaVal = 0.28;
      satMul *= 1.20;
      brightMul = 1.03;
      break;
    case 'none':
    default:
      break;
  }

  // Warmth adjustment
  if (adjustments.warmth > 0) {
    sepiaVal = Math.min(1, sepiaVal + adjustments.warmth * 0.006);
    hueDeg -= adjustments.warmth * 0.25;
  } else if (adjustments.warmth < 0) {
    hueDeg += Math.abs(adjustments.warmth) * 0.35;
  }

  if (contrastMul !== 1) parts.push(`contrast(${Math.round(contrastMul * 100)}%)`);
  if (satMul !== 1 && preset !== 'noir') parts.push(`saturate(${Math.round(satMul * 100)}%)`);
  if (brightMul !== 1) parts.push(`brightness(${Math.round(brightMul * 100)}%)`);
  if (sepiaVal > 0) parts.push(`sepia(${Math.round(sepiaVal * 100)}%)`);
  if (hueDeg !== 0) parts.push(`hue-rotate(${Math.round(hueDeg)}deg)`);

  return parts.join(' ') || 'none';
}

/**
 * Apply artistic filters and tone adjustments to a canvas
 */
export function applyImageFilters(
  sourceCanvas: HTMLCanvasElement,
  preset: FilterPreset = 'none',
  adjustments: ImageAdjustments = { contrast: 1.1, saturation: 1.0, warmth: 0, vignette: 0.15 }
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const filterString = buildFilterCSS(preset, adjustments);
  if (filterString !== 'none') {
    ctx.filter = filterString;
  }
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.filter = 'none';

  // Apply Vignette if specified
  const vig = adjustments.vignette ?? 0.15;
  if (vig > 0.01) {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.46;
    const rOuter = Math.max(w, h) * 0.72;
    const rInner = Math.min(w, h) * 0.28;
    const grad = ctx.createRadialGradient(cx, cy, rInner, cx, cy, rOuter);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.75, `rgba(0, 0, 0, ${vig * 0.6})`);
    grad.addColorStop(1, `rgba(0, 0, 0, ${vig})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  return canvas;
}
