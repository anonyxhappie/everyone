import { RGBColor, LabColor, rgbToLab, getRegionStats } from './colorMatching';
import { getCanvasImageData, FilterPreset, ImageAdjustments } from './imageProcessing';

export type TileDensity = 'bold' | 'balanced' | 'fine';
export type TileShape = 'square' | 'rounded' | 'circle' | 'rectangle' | 'triangle' | 'hexagon' | 'diamond';

export interface TileData {
  id: number;
  thumbnail: HTMLCanvasElement; // High-resolution 480x480 square photo
  original?: HTMLCanvasElement | HTMLImageElement; // Full resolution photo for macro inspection & 300 DPI wall print
  avgColor: RGBColor;
  avgLab: LabColor;
}

export type Effect3D = 'none' | 'emboss' | 'floating' | 'extrude' | 'anaglyph';

export interface MosaicConfig {
  density: TileDensity;
  shape: TileShape;
  filterPreset: FilterPreset;
  adjustments: ImageAdjustments;
  overlayOpacity: number; // 0.0 to 0.60, default 0.35 (User's preferred setting)
  colorCorrection: number; // 0.0 to 0.80, default 0.45 (User's preferred setting)
  facialClarity: number; // 0.0 to 1.0, default 1.00 (Vastly enhanced face clarity on zoom out)
  effect3D?: Effect3D; // 'none' | 'emboss' | 'floating' | 'extrude' | 'anaglyph'
  depth3D?: number; // 0.0 to 1.0 (default 0.5)
  interactiveTilt?: boolean; // 3D perspective tilt on hover/device
  brightnessAdjust?: number; // legacy optional
  contrastAdjust?: number; // legacy optional
}

export interface MosaicResult {
  canvas: HTMLCanvasElement;
  gridCols: number;
  gridRows: number;
  renderTileSize: number;
  tileMap: number[][]; // [row][col] => tileIndex
  cellColors: RGBColor[][]; // [row][col] => RGBColor
  targetAspect: number;
  outputWidth: number;
  outputHeight: number;
}

/**
 * Compute optimal grid and canvas dimensions based on density and aspect ratio
 */
export function getGridDimensions(
  imageWidth: number,
  imageHeight: number,
  density: TileDensity,
  baseWidth = 2400
): { cols: number; rows: number; renderTileSize: number; outputWidth: number; outputHeight: number } {
  // Density columns: Bold = ~36, Balanced = ~56, Fine = ~84
  const densityCols: Record<TileDensity, number> = {
    bold: 36,
    balanced: 56,
    fine: 84,
  };

  const cols = densityCols[density] || 84;
  const aspect = imageHeight / imageWidth;
  const renderTileSize = Math.max(20, Math.round(baseWidth / cols));
  const outputWidth = cols * renderTileSize;
  const rows = Math.round(cols * aspect);
  const outputHeight = rows * renderTileSize;

  return { cols, rows, renderTileSize, outputWidth, outputHeight };
}

/**
 * Prepare tile metadata and compute average color in Lab space.
 * Default size is 480px so zoomed-in tiles and wall prints are needle-sharp!
 */
export function prepareTiles(
  tileImages: (HTMLCanvasElement | HTMLImageElement)[],
  size = 480,
  originals?: (HTMLCanvasElement | HTMLImageElement)[]
): TileData[] {
  return tileImages.map((img, id) => {
    let thumb: HTMLCanvasElement;
    if (img instanceof HTMLCanvasElement && img.width === size && img.height === size) {
      thumb = img;
    } else {
      thumb = document.createElement('canvas');
      thumb.width = size;
      thumb.height = size;
      const ctx = thumb.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
    }

    const imgData = getCanvasImageData(thumb);
    let rSum = 0, gSum = 0, bSum = 0;
    const count = imgData.data.length / 4;

    for (let i = 0; i < imgData.data.length; i += 4) {
      rSum += imgData.data[i];
      gSum += imgData.data[i + 1];
      bSum += imgData.data[i + 2];
    }

    const avgColor: RGBColor = {
      r: Math.round(rSum / count),
      g: Math.round(gSum / count),
      b: Math.round(bSum / count),
    };

    const orig = (originals && originals[id]) ? originals[id] : img;

    return {
      id,
      thumbnail: thumb,
      original: orig,
      avgColor,
      avgLab: rgbToLab(avgColor),
    };
  });
}

/**
 * Find the best tile for a target color with spatial repetition penalty
 * For salient features (high variance, eyes, lips, sharp edges anywhere in image),
 * uses strict luminance matching and 0 randomness
 */
export function findBestTile(
  targetLab: LabColor,
  tiles: TileData[],
  recentTiles: number[],
  randomness = 0.10,
  isSalientFeature = false
): number {
  if (tiles.length === 0) return 0;

  const recentSet = new Set(recentTiles);
  let bestIndex = 0;
  let minDistance = Infinity;

  const candidates: { index: number; dist: number }[] = [];

  for (let i = 0; i < tiles.length; i++) {
    // For salient features (contrast edges, pupils, highlights), weight luminance 3.2x higher
    const lWeight = isSalientFeature ? 3.2 : 1.6;
    const dL = (targetLab.L - tiles[i].avgLab.L) * lWeight;
    const da = targetLab.a - tiles[i].avgLab.a;
    const db = targetLab.b - tiles[i].avgLab.b;
    let dist = Math.sqrt(dL * dL + da * da + db * db);

    // In critical salient details, do NOT artificially penalize the best matching tones
    if (recentSet.has(i)) {
      dist += isSalientFeature ? 6 : 35;
    }

    if (dist < minDistance) {
      minDistance = dist;
      bestIndex = i;
    }

    candidates.push({ index: i, dist });
  }

  // In salient features, use ZERO randomness so details remain crisp and exact!
  if (!isSalientFeature && randomness > 0.01 && candidates.length > 5) {
    candidates.sort((a, b) => a.dist - b.dist);
    const poolSize = Math.min(5, Math.max(1, Math.floor(candidates.length * randomness * 0.2)));
    const selected = candidates[Math.floor(Math.random() * poolSize)];
    return selected.index;
  }

  return bestIndex;
}

/**
 * Construct vector shape path for any tile geometry (square, rounded, circle, rectangle, triangle, hexagon, diamond)
 */
export function buildShapePath(
  ctx: CanvasRenderingContext2D,
  shape: TileShape,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  c: number
): void {
  ctx.beginPath();
  switch (shape) {
    case 'square':
      ctx.rect(x, y, w, h);
      break;
    case 'rounded': {
      const radius = Math.min(w, h) * 0.22;
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, radius);
      } else {
        ctx.rect(x, y, w, h);
      }
      break;
    }
    case 'circle': {
      const radius = Math.min(w, h) / 2;
      ctx.arc(x + w / 2, y + h / 2, radius, 0, Math.PI * 2);
      break;
    }
    case 'rectangle': {
      const padY = h * 0.12;
      const radius = Math.min(w, h) * 0.14;
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y + padY, w, h - padY * 2, radius);
      } else {
        ctx.rect(x, y + padY, w, h - padY * 2);
      }
      break;
    }
    case 'triangle': {
      const isUp = (r + c) % 2 === 0;
      if (isUp) {
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
      } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w / 2, y + h);
      }
      break;
    }
    case 'hexagon': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rx = w / 2;
      const ry = h / 2;
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const px = cx + rx * Math.cos(angle);
        const py = cy + ry * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      break;
    }
    case 'diamond': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, cy);
      ctx.lineTo(cx, y + h);
      ctx.lineTo(x, cy);
      break;
    }
    default:
      ctx.rect(x, y, w, h);
      break;
  }
  ctx.closePath();
}

/**
 * Draw a photo tile clipped to any shape with optional 3D dimension and depth:
 * - 'emboss': Beveled 3D glass / ceramic tiles with specular rim lighting and directional shadow
 * - 'floating': Elevated 3D tiles with drop shadow cast onto background
 * - 'extrude': Thick architectural 3D blocks with shaded extrusion facets
 * - 'anaglyph': Stereoscopic optical 3D with chromatic depth shift
 * Preserves high-resolution center-cropping so original non-square photos are NEVER stretched or squished!
 */
export function drawTileWithShape(
  ctx: CanvasRenderingContext2D,
  shape: TileShape,
  source: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  c: number,
  effect3D: Effect3D = 'none',
  depth3D = 0.5
): void {
  // Determine source dimensions and center-crop if not 1:1 aspect
  const naturalW = (source as HTMLImageElement).naturalWidth || (source as HTMLCanvasElement).width || 0;
  const naturalH = (source as HTMLImageElement).naturalHeight || (source as HTMLCanvasElement).height || 0;
  let sx = 0, sy = 0, sw = naturalW, sh = naturalH;
  const hasDimensions = naturalW > 0 && naturalH > 0;

  if (hasDimensions && Math.abs(naturalW - naturalH) > 1) {
    const minDim = Math.min(naturalW, naturalH);
    sx = (naturalW - minDim) / 2;
    sy = (naturalH - minDim) / 2;
    sw = minDim;
    sh = minDim;
  }

  // 1. Floating Tiles with Drop Shadow
  if (effect3D === 'floating' && depth3D > 0.02) {
    const gap = Math.max(1, Math.round(Math.min(w, h) * 0.08 * depth3D));
    const fx = x + gap;
    const fy = y + gap;
    const fw = Math.max(2, w - gap * 2);
    const fh = Math.max(2, h - gap * 2);

    // Cast soft ambient drop shadow
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${Math.min(0.85, 0.40 + depth3D * 0.45)})`;
    ctx.shadowBlur = Math.max(2, Math.round(fw * 0.16 * depth3D));
    ctx.shadowOffsetX = Math.max(1, Math.round(fw * 0.06 * depth3D));
    ctx.shadowOffsetY = Math.max(1, Math.round(fh * 0.08 * depth3D));
    ctx.fillStyle = '#0a0a0a';
    buildShapePath(ctx, shape, fx, fy, fw, fh, r, c);
    ctx.fill();
    ctx.restore();

    // Draw main tile photo
    ctx.save();
    buildShapePath(ctx, shape, fx, fy, fw, fh, r, c);
    ctx.clip();
    if (hasDimensions) {
      ctx.drawImage(source, sx, sy, sw, sh, fx, fy, fw, fh);
    } else {
      ctx.drawImage(source, fx, fy, fw, fh);
    }

    // Top rim specular highlight
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.30 * depth3D})`;
    ctx.lineWidth = Math.max(1, Math.round(fw * 0.03));
    buildShapePath(ctx, shape, fx, fy, fw, fh, r, c);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // 2. Extruded 3D Blocks
  if (effect3D === 'extrude' && depth3D > 0.02) {
    const ext = Math.max(1, Math.round(Math.min(w, h) * 0.09 * depth3D));
    const fw = Math.max(2, w - ext);
    const fh = Math.max(2, h - ext);

    // Right-side 3D facet
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.68, 0.35 + depth3D * 0.32)})`;
    ctx.beginPath();
    ctx.moveTo(x + fw, y);
    ctx.lineTo(x + w, y + ext);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + fw, y + fh);
    ctx.closePath();
    ctx.fill();

    // Bottom 3D facet
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.85, 0.50 + depth3D * 0.35)})`;
    ctx.beginPath();
    ctx.moveTo(x, y + fh);
    ctx.lineTo(x + ext, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + fw, y + fh);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Front tile face
    ctx.save();
    buildShapePath(ctx, shape, x, y, fw, fh, r, c);
    ctx.clip();
    if (hasDimensions) {
      ctx.drawImage(source, sx, sy, sw, sh, x, y, fw, fh);
    } else {
      ctx.drawImage(source, x, y, fw, fh);
    }
    // Top-left block highlight
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.32 * depth3D})`;
    ctx.lineWidth = Math.max(1, Math.round(fw * 0.03));
    buildShapePath(ctx, shape, x, y, fw, fh, r, c);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // 3. Stereoscopic 3D / Anaglyph
  if (effect3D === 'anaglyph' && depth3D > 0.02) {
    const shift = Math.max(1, Math.round(w * 0.05 * depth3D));

    // Cyan right shift
    ctx.save();
    ctx.globalAlpha = 0.55 * depth3D;
    buildShapePath(ctx, shape, x + shift, y, w, h, r, c);
    ctx.clip();
    if (hasDimensions) {
      ctx.drawImage(source, sx, sy, sw, sh, x + shift, y, w, h);
    } else {
      ctx.drawImage(source, x + shift, y, w, h);
    }
    ctx.fillStyle = 'rgba(0, 220, 255, 0.42)';
    ctx.fill();
    ctx.restore();

    // Red left shift
    ctx.save();
    ctx.globalAlpha = 0.55 * depth3D;
    buildShapePath(ctx, shape, x - shift, y, w, h, r, c);
    ctx.clip();
    if (hasDimensions) {
      ctx.drawImage(source, sx, sy, sw, sh, x - shift, y, w, h);
    } else {
      ctx.drawImage(source, x - shift, y, w, h);
    }
    ctx.fillStyle = 'rgba(255, 20, 60, 0.42)';
    ctx.fill();
    ctx.restore();

    // Sharp center photo
    ctx.save();
    buildShapePath(ctx, shape, x, y, w, h, r, c);
    ctx.clip();
    if (hasDimensions) {
      ctx.drawImage(source, sx, sy, sw, sh, x, y, w, h);
    } else {
      ctx.drawImage(source, x, y, w, h);
    }
    ctx.restore();
    return;
  }

  // 4. Standard Flat or Beveled Glass/Embossed 3D Tiles
  ctx.save();
  buildShapePath(ctx, shape, x, y, w, h, r, c);
  ctx.clip();
  if (hasDimensions) {
    ctx.drawImage(source, sx, sy, sw, sh, x, y, w, h);
  } else {
    ctx.drawImage(source, x, y, w, h);
  }

  // If emboss 3D mode enabled, apply tactile glass / stone bevel lighting
  if (effect3D === 'emboss' && depth3D > 0.02) {
    const lightAlpha = Math.min(0.55, 0.20 + depth3D * 0.35);
    const shadowAlpha = Math.min(0.65, 0.25 + depth3D * 0.40);

    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, `rgba(255, 255, 255, ${lightAlpha})`);
    grad.addColorStop(0.35, `rgba(255, 255, 255, ${0.08 * depth3D})`);
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.75, `rgba(0, 0, 0, ${0.12 * depth3D})`);
    grad.addColorStop(1, `rgba(0, 0, 0, ${shadowAlpha})`);

    // Surface gradient sheen
    ctx.fillStyle = grad;
    ctx.fill();

    // Chamfered bevel edge stroke
    const bevelWidth = Math.max(1, Math.round(Math.min(w, h) * 0.06 * depth3D));
    ctx.lineWidth = bevelWidth;
    ctx.strokeStyle = grad;
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Fill a clipped tile shape with color tint, respecting 3D insets
 */
export function fillTileShape(
  ctx: CanvasRenderingContext2D,
  shape: TileShape,
  colorStyle: string,
  alpha: number,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  c: number,
  effect3D: Effect3D = 'none',
  depth3D = 0.5
): void {
  ctx.save();
  if (effect3D === 'floating' && depth3D > 0.02) {
    const gap = Math.max(1, Math.round(Math.min(w, h) * 0.08 * depth3D));
    buildShapePath(ctx, shape, x + gap, y + gap, Math.max(2, w - gap * 2), Math.max(2, h - gap * 2), r, c);
  } else if (effect3D === 'extrude' && depth3D > 0.02) {
    const ext = Math.max(1, Math.round(Math.min(w, h) * 0.09 * depth3D));
    buildShapePath(ctx, shape, x, y, Math.max(2, w - ext), Math.max(2, h - ext), r, c);
  } else {
    buildShapePath(ctx, shape, x, y, w, h, r, c);
  }
  ctx.fillStyle = colorStyle;
  ctx.globalAlpha = alpha;
  ctx.fill();
  ctx.restore();
}

/**
 * Generate the mosaic matching data
 */
export function generateMosaic(
  targetImage: HTMLCanvasElement,
  tiles: TileData[],
  config: MosaicConfig,
  onProgress?: (progress: number) => void
): MosaicResult {
  const { cols, rows, renderTileSize, outputWidth, outputHeight } = getGridDimensions(
    targetImage.width,
    targetImage.height,
    config.density,
    2400
  );

  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = outputWidth;
  resultCanvas.height = outputHeight;
  const ctx = resultCanvas.getContext('2d', { alpha: false })!;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const targetData = getCanvasImageData(targetImage);
  const targetW = targetImage.width;
  const targetH = targetImage.height;

  const sampleCellW = targetW / cols;
  const sampleCellH = targetH / rows;

  const tileMap: number[][] = [];
  const cellColors: RGBColor[][] = [];
  const recentQueue: number[] = [];
  const RECENT_MAX = Math.min(16, Math.floor(tiles.length * 0.15));

  const totalCells = rows * cols;
  let processed = 0;

  const tintAlpha = config.colorCorrection ?? 0.45;
  const tileShape = config.shape || 'square';

  for (let r = 0; r < rows; r++) {
    const rowMap: number[] = [];
    const colorRow: RGBColor[] = [];
    const sy = Math.floor(r * sampleCellH);
    const sh = Math.max(1, Math.min(Math.ceil(sampleCellH), targetH - sy));

    for (let c = 0; c < cols; c++) {
      const sx = Math.floor(c * sampleCellW);
      const sw = Math.max(1, Math.min(Math.ceil(sampleCellW), targetW - sx));

      const { avgColor: regionAvg, variance: regionVariance } = getRegionStats(targetData.data, targetW, sx, sy, sw, sh);
      const targetLab = rgbToLab(regionAvg);
      colorRow.push(regionAvg);

      // Salient high-contrast feature detection based purely on image variance & luminance
      // (NO artificial oval mask or hardcoded facial area dependency!)
      const isSalientFeature = regionVariance > 12 || targetLab.L < 36 || targetLab.L > 80;

      const tileIndex = findBestTile(targetLab, tiles, recentQueue, 0.10, isSalientFeature);
      rowMap.push(tileIndex);

      recentQueue.push(tileIndex);
      if (recentQueue.length > RECENT_MAX) {
        recentQueue.shift();
      }

      // Draw tile onto static preview canvas
      const dx = c * renderTileSize;
      const dy = r * renderTileSize;
      const tile = tiles[tileIndex] || tiles[0];

      drawTileWithShape(ctx, tileShape, tile.thumbnail, dx, dy, renderTileSize, renderTileSize, r, c, config.effect3D, config.depth3D);

      if (tintAlpha > 0.01) {
        fillTileShape(ctx, tileShape, `rgb(${regionAvg.r}, ${regionAvg.g}, ${regionAvg.b})`, tintAlpha, dx, dy, renderTileSize, renderTileSize, r, c, config.effect3D, config.depth3D);
      }

      processed++;
    }

    tileMap.push(rowMap);
    cellColors.push(colorRow);

    if (onProgress && r % 4 === 0) {
      onProgress(processed / totalCells);
    }
  }

  const overlay = config.overlayOpacity ?? 0.35;
  if (overlay > 0.01) {
    ctx.globalAlpha = Math.min(0.50, overlay);
    ctx.drawImage(targetImage, 0, 0, outputWidth, outputHeight);
    ctx.globalAlpha = 1.0;
  }

  if (onProgress) {
    onProgress(1.0);
  }

  return {
    canvas: resultCanvas,
    gridCols: cols,
    gridRows: rows,
    renderTileSize,
    tileMap,
    cellColors,
    targetAspect: targetW / targetH,
    outputWidth,
    outputHeight,
  };
}

/**
 * Dynamic Viewport Renderer:
 * Renders the visible tiles directly to the screen at native device resolution!
 * Ensures tiles are NEVER stretched or blurred, regardless of zoom level.
 */
export function renderMosaicViewport(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  mosaicResult: MosaicResult,
  tiles: TileData[],
  zoom: number,
  pan: { x: number; y: number },
  config: MosaicConfig,
  targetImage: HTMLCanvasElement,
  compareMode: boolean,
  highlightedTile?: { row: number; col: number; intensity: number } | null
): { artX: number; artY: number; artW: number; artH: number; tileScreenW: number; tileScreenH: number } {
  // Clear viewport canvas
  ctx.fillStyle = '#080808';
  ctx.fillRect(0, 0, viewW, viewH);

  // Compute base artwork size to fit viewport nicely (85% width / 80% height margin)
  const marginW = viewW * 0.85;
  const marginH = viewH * 0.80;
  const aspect = mosaicResult.targetAspect;

  let baseW = marginW;
  let baseH = baseW / aspect;
  if (baseH > marginH) {
    baseH = marginH;
    baseW = baseH * aspect;
  }

  // Scaled dimensions under current zoom
  const artW = baseW * zoom;
  const artH = baseH * zoom;

  // Artwork top-left coordinate on screen
  const artX = (viewW - artW) / 2 + pan.x;
  const artY = (viewH - artH) / 2 + pan.y;

  // Screen size of a single tile
  const tileScreenW = artW / mosaicResult.gridCols;
  const tileScreenH = artH / mosaicResult.gridRows;

  // If in comparison mode, render original portrait image
  if (compareMode) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(targetImage, artX, artY, artW, artH);
    return { artX, artY, artW, artH, tileScreenW, tileScreenH };
  }

  // Visible tile range (culls off-screen tiles for fast 60fps rendering)
  const minCol = Math.max(0, Math.floor(-artX / tileScreenW));
  const maxCol = Math.min(mosaicResult.gridCols - 1, Math.ceil((viewW - artX) / tileScreenW));
  const minRow = Math.max(0, Math.floor(-artY / tileScreenH));
  const maxRow = Math.min(mosaicResult.gridRows - 1, Math.ceil((viewH - artY) / tileScreenH));

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Dynamic zoom attenuation:
  // As the user zooms in to discover close-up moments, reduce color tint and fade out the portrait overlay
  // so the individual photographs are 100% crisp, pristine, and never hazy or blurred!
  const zoomFade = Math.max(0.12, 1 - (zoom - 1.0) / 2.5);
  const baseTintAlpha = (config.colorCorrection ?? 0.45) * zoomFade;

  // Zoom-out facial clarity factor:
  // At zoom <= 1.0 (max zoom out), clarity factor is at its peak (1.0)!
  // At zoom > 1.15, it dissolves smoothly until 2.1x where it reaches 0
  const zoomOutFactor = Math.max(0, Math.min(1, 1 - (zoom - 1.0) / 1.15));
  const facialClarity = config.facialClarity ?? 1.0;
  const tileShape = config.shape || 'square';

  // Draw ONLY visible tiles directly from the 480px source photos to the screen!
  for (let r = minRow; r <= maxRow; r++) {
    const tileY = Math.round(artY + r * tileScreenH);
    const drawH = Math.round(artY + (r + 1) * tileScreenH) - tileY;

    for (let c = minCol; c <= maxCol; c++) {
      const tileX = Math.round(artX + c * tileScreenW);
      const drawW = Math.round(artX + (c + 1) * tileScreenW) - tileX;

      const tileIndex = mosaicResult.tileMap[r][c];
      const tile = tiles[tileIndex] || tiles[0];

      // Draw high-resolution photo tile directly at screen dimensions.
      // If zoomed in close (drawW > 220px), use original full photo for zero pixelation!
      const source = (drawW > 220 && tile.original) ? tile.original : tile.thumbnail;
      drawTileWithShape(ctx, tileShape, source, tileX, tileY, drawW, drawH, r, c, config.effect3D, config.depth3D);

      // Adaptive color tinting across all tiles uniformly (fades gracefully when zooming into tiles)
      if (baseTintAlpha > 0.01 && mosaicResult.cellColors && mosaicResult.cellColors[r]) {
        const color = mosaicResult.cellColors[r][c];
        if (color) {
          fillTileShape(ctx, tileShape, `rgb(${color.r}, ${color.g}, ${color.b})`, baseTintAlpha, tileX, tileY, drawW, drawH, r, c, config.effect3D, config.depth3D);
        }
      }

      // Idle moment highlight shimmer
      if (highlightedTile && highlightedTile.row === r && highlightedTile.col === c) {
        ctx.save();
        ctx.strokeStyle = `rgba(240, 225, 195, ${0.7 * highlightedTile.intensity})`;
        ctx.lineWidth = Math.max(1.5, Math.min(3, drawW * 0.05));
        ctx.strokeRect(tileX + 0.5, tileY + 0.5, drawW - 1, drawH - 1);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.15 * highlightedTile.intensity})`;
        ctx.fillRect(tileX, tileY, drawW, drawH);
        ctx.restore();
      }
    }
  }

  // Portrait Clarity across the entire portrait (NO artificial oval mask!):
  // At zoom <= 1.0 (zoomed out to view whole portrait), the clarity setting
  // keeps facial features, expression, and overall form crisp and recognizable.
  // As the user zooms in, this dissolves smoothly so tiles are 100% pure photographs!
  const baseOverlay = config.overlayOpacity ?? 0.35;
  const overlayZoomFactor = Math.max(0, 1 - (zoom - 1.0) / 1.4);
  const clarityBoost = (config.facialClarity ?? 1.0) * 0.28 * zoomOutFactor;
  const effectiveOverlay = Math.min(0.58, (baseOverlay + clarityBoost) * overlayZoomFactor);

  if (effectiveOverlay > 0.005) {
    ctx.globalAlpha = effectiveOverlay;
    ctx.drawImage(targetImage, artX, artY, artW, artH);
    ctx.globalAlpha = 1.0;
  }

  return { artX, artY, artW, artH, tileScreenW, tileScreenH };
}

/**
 * Render ultra high-res canvas for crystal clear PNG export (3000px+ print quality)
 */
export function renderHighRes(
  result: MosaicResult,
  tiles: TileData[],
  scale = 1.5,
  config: MosaicConfig,
  targetImage: HTMLCanvasElement
): HTMLCanvasElement {
  const exportW = Math.round(result.outputWidth * scale);
  const exportH = Math.round(result.outputHeight * scale);
  const hrTileSize = Math.round(result.renderTileSize * scale);

  const canvas = document.createElement('canvas');
  canvas.width = exportW;
  canvas.height = exportH;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const tintAlpha = config.colorCorrection ?? 0.45;
  const tileShape = config.shape || 'square';

  for (let r = 0; r < result.gridRows; r++) {
    for (let c = 0; c < result.gridCols; c++) {
      const tileIndex = result.tileMap[r][c];
      const tile = tiles[tileIndex] || tiles[0];
      const dx = c * hrTileSize;
      const dy = r * hrTileSize;

      // Draw from original high-resolution photo if available
      const source = tile.original || tile.thumbnail;
      drawTileWithShape(ctx, tileShape, source, dx, dy, hrTileSize, hrTileSize, r, c, config.effect3D, config.depth3D);

      if (tintAlpha > 0.01 && result.cellColors && result.cellColors[r]) {
        const color = result.cellColors[r][c];
        if (color) {
          fillTileShape(ctx, tileShape, `rgb(${color.r}, ${color.g}, ${color.b})`, tintAlpha, dx, dy, hrTileSize, hrTileSize, r, c, config.effect3D, config.depth3D);
        }
      }
    }
  }

  // Cohesive portrait clarity across the entire canvas (NO artificial oval mask)
  const baseOverlay = config.overlayOpacity ?? 0.35;
  const clarityBoost = (config.facialClarity ?? 1.0) * 0.15;
  const effectiveOverlay = Math.min(0.50, baseOverlay + clarityBoost);
  if (effectiveOverlay > 0.01) {
    ctx.globalAlpha = effectiveOverlay;
    ctx.drawImage(targetImage, 0, 0, exportW, exportH);
    ctx.globalAlpha = 1.0;
  }

  return canvas;
}
