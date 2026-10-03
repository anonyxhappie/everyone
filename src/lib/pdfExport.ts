import { jsPDF } from 'jspdf';
import { drawTileWithShape, fillTileShape } from './mosaicGenerator';
import type { MosaicResult, TileData, MosaicConfig } from './mosaicGenerator';
import { canvasToPngBlob } from './exportImage';

export type PaperSize = '24x36' | 'a1' | '18x24' | 'a2' | 'screen_hd';
export type ExportFormat = 'pdf' | 'png' | 'jpeg';

export interface PrintSizeSpec {
  id: PaperSize;
  name: string;
  dimensionsInches: [number, number]; // [width, height] in portrait
  dimensionsMm: string;
  targetWidthPx: number; // Width in pixels at print resolution
  description: string;
  recommendedFor: string;
}

export const PRINT_SIZES: Record<PaperSize, PrintSizeSpec> = {
  '24x36': {
    id: '24x36',
    name: 'Large Wall Poster (24" × 36")',
    dimensionsInches: [24, 36],
    dimensionsMm: '610 × 914 mm',
    targetWidthPx: 7200, // 300 DPI master
    description: 'Gold standard for large wall art and gallery frames',
    recommendedFor: 'Living rooms, feature walls, exhibitions',
  },
  'a1': {
    id: 'a1',
    name: 'Exhibition A1 (594 × 841 mm)',
    dimensionsInches: [23.39, 33.11],
    dimensionsMm: '594 × 841 mm',
    targetWidthPx: 7000, // ~300 DPI
    description: 'International exhibition and gallery poster standard',
    recommendedFor: 'Modern frames, gallery walls, art prints',
  },
  '18x24': {
    id: '18x24',
    name: 'Medium Gallery (18" × 24")',
    dimensionsInches: [18, 24],
    dimensionsMm: '457 × 610 mm',
    targetWidthPx: 5400, // 300 DPI
    description: 'Popular standard frame size for bedroom or office',
    recommendedFor: 'Medium rooms, multi-frame gallery walls',
  },
  'a2': {
    id: 'a2',
    name: 'Exhibition A2 (420 × 594 mm)',
    dimensionsInches: [16.54, 23.39],
    dimensionsMm: '420 × 594 mm',
    targetWidthPx: 4960, // 300 DPI
    description: 'Compact high-density wall print',
    recommendedFor: 'Desks, hallways, compact art collections',
  },
  'screen_hd': {
    id: 'screen_hd',
    name: 'Digital Ultra HD (4K / 3200px)',
    dimensionsInches: [10, 13.33],
    dimensionsMm: '254 × 338 mm',
    targetWidthPx: 3200,
    description: 'Optimized for 4K/5K displays and social sharing',
    recommendedFor: 'Digital frames, tablets, web portfolios',
  },
};

export interface WallPrintOptions {
  size: PaperSize;
  format: ExportFormat;
  hasBorder: boolean; // Museum gallery border with signature
  signatureText?: string;
  subText?: string;
}

/**
 * Convert canvas to JPEG blob with target quality
 */
export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.96): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to generate JPEG blob'));
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Render Ultra High-Resolution Master Canvas for Wall Printing (up to 7,200px+)
 * Renders in non-blocking async batches so the UI remains responsive and progress updates cleanly.
 */
export async function renderWallPrintCanvas(
  result: MosaicResult,
  tiles: TileData[],
  config: MosaicConfig,
  targetImage: HTMLCanvasElement,
  targetWidth = 7200,
  onProgress?: (progress: number, status: string) => void
): Promise<HTMLCanvasElement> {
  const aspect = result.targetAspect || (targetImage.width / targetImage.height);
  const outW = targetWidth;
  const outH = Math.round(outW / aspect);
  const tileRenderW = outW / result.gridCols;
  const tileRenderH = outH / result.gridRows;

  let canvas = document.createElement('canvas');
  let ctx: CanvasRenderingContext2D | null = null;

  // Try creating requested canvas size, with fallback if device memory limit reached
  let currentW = outW;
  let currentH = outH;

  while (currentW >= 3200) {
    try {
      canvas = document.createElement('canvas');
      canvas.width = currentW;
      canvas.height = currentH;
      ctx = canvas.getContext('2d', { alpha: false });
      if (ctx) break;
    } catch {
      currentW = Math.round(currentW * 0.75);
      currentH = Math.round(currentH * 0.75);
    }
  }

  if (!ctx) {
    // Ultimate fallback to standard dimensions
    canvas = document.createElement('canvas');
    canvas.width = Math.min(3200, outW);
    canvas.height = Math.round(canvas.width / aspect);
    ctx = canvas.getContext('2d', { alpha: false })!;
  }

  const finalW = canvas.width;
  const finalH = canvas.height;
  const finalTileW = finalW / result.gridCols;
  const finalTileH = finalH / result.gridRows;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Fill background
  ctx.fillStyle = '#080808';
  ctx.fillRect(0, 0, finalW, finalH);

  const tintAlpha = config.colorCorrection ?? 0.45;
  const tileShape = config.shape || 'square';
  const totalRows = result.gridRows;

  // Render row by row with async yields
  for (let r = 0; r < totalRows; r++) {
    const tileY = Math.round(r * finalTileH);
    const drawH = Math.round((r + 1) * finalTileH) - tileY;

    for (let c = 0; c < result.gridCols; c++) {
      const tileX = Math.round(c * finalTileW);
      const drawW = Math.round((c + 1) * finalTileW) - tileX;

      const tileIndex = result.tileMap[r][c];
      const tile = tiles[tileIndex] || tiles[0];

      // Draw from high-resolution original if available, else thumbnail with shape
      const sourceImg = tile.original || tile.thumbnail;
      drawTileWithShape(ctx, tileShape, sourceImg, tileX, tileY, drawW, drawH, r, c, config.effect3D, config.depth3D);

      // Adaptive color harmonization with shape
      if (tintAlpha > 0.01 && result.cellColors && result.cellColors[r]) {
        const color = result.cellColors[r][c];
        if (color) {
          fillTileShape(ctx, tileShape, `rgb(${color.r}, ${color.g}, ${color.b})`, tintAlpha, tileX, tileY, drawW, drawH, r, c, config.effect3D, config.depth3D);
        }
      }
    }

    // Yield every 4 rows to allow browser to breathe and update progress bar
    if (r % 4 === 0) {
      if (onProgress) {
        const pct = (r + 1) / totalRows;
        onProgress(pct * 0.85, `Assembling ${finalW}px Master Print: Row ${r + 1} of ${totalRows}...`);
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Cohesive portrait detail across the entire wall print (NO artificial oval mask)
  const baseOverlay = config.overlayOpacity ?? 0.35;
  const clarityBoost = (config.facialClarity ?? 1.0) * 0.15;
  const effectiveOverlay = Math.min(0.50, baseOverlay + clarityBoost);
  if (effectiveOverlay > 0.01) {
    ctx.globalAlpha = effectiveOverlay;
    ctx.drawImage(targetImage, 0, 0, finalW, finalH);
    ctx.globalAlpha = 1.0;
  }

  if (onProgress) {
    onProgress(0.95, 'Finalizing print master resolution...');
  }

  return canvas;
}

/**
 * Generate a Print-Ready Wall Art PDF (300 DPI) using jsPDF
 */
export async function exportWallPrintPdf(
  masterCanvas: HTMLCanvasElement,
  options: WallPrintOptions,
  onProgress?: (progress: number, status: string) => void
): Promise<Blob> {
  if (onProgress) onProgress(0.88, 'Encoding 300 DPI artwork for PDF container...');

  const spec = PRINT_SIZES[options.size] || PRINT_SIZES['24x36'];
  const aspect = masterCanvas.width / masterCanvas.height;
  const isLandscape = aspect > 1.0;

  // Determine page dimensions in inches
  let pageWidthIn = isLandscape ? spec.dimensionsInches[1] : spec.dimensionsInches[0];
  let pageHeightIn = isLandscape ? spec.dimensionsInches[0] : spec.dimensionsInches[1];

  // Initialize jsPDF with custom page format in inches
  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'in',
    format: [pageWidthIn, pageHeightIn],
    compress: true,
  });

  // Set PDF Metadata
  pdf.setProperties({
    title: 'Everyone Is Part of You — Photographic Mosaic Wall Print',
    subject: '300 DPI Fine Art Wall Print',
    author: 'Everyone Is Part of You Studio',
    keywords: 'photo mosaic, wall print, fine art, portrait, 300 dpi',
    creator: 'Everyone Is Part of You Digital Art Experience',
  });

  let artX = 0;
  let artY = 0;
  let artW = pageWidthIn;
  let artH = pageHeightIn;

  if (options.hasBorder) {
    // Museum Gallery Passe-Partout Framing:
    // 1.2 inch top/left/right border, 2.2 inch bottom border for signature
    const marginSide = Math.max(1.0, pageWidthIn * 0.05);
    const marginTop = Math.max(1.0, pageHeightIn * 0.05);
    const marginBottom = Math.max(1.8, pageHeightIn * 0.08);

    const availableW = pageWidthIn - (marginSide * 2);
    const availableH = pageHeightIn - marginTop - marginBottom;

    artW = availableW;
    artH = artW / aspect;

    if (artH > availableH) {
      artH = availableH;
      artW = artH * aspect;
    }

    artX = (pageWidthIn - artW) / 2;
    artY = marginTop + (availableH - artH) / 2;

    // Crisp white museum matte background
    pdf.setFillColor(252, 250, 246); // Museum archival warm white
    pdf.rect(0, 0, pageWidthIn, pageHeightIn, 'F');

    // Delicate hairline border around artwork
    pdf.setDrawColor(210, 205, 195);
    pdf.setLineWidth(0.01);
    pdf.rect(artX - 0.02, artY - 0.02, artW + 0.04, artH + 0.04, 'S');

    // Typography Signature at bottom
    const sigY = artY + artH + (marginBottom * 0.45);

    pdf.setFont('times', 'italic');
    pdf.setFontSize(Math.max(14, Math.round(pageWidthIn * 0.75)));
    pdf.setTextColor(28, 25, 23);
    pdf.text(options.signatureText || 'Everyone Is Part of You', pageWidthIn / 2, sigY, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(Math.max(8, Math.round(pageWidthIn * 0.38)));
    pdf.setTextColor(115, 110, 100);
    pdf.text(options.subText || 'One face. A thousand little worlds. · 300 DPI Master Print', pageWidthIn / 2, sigY + 0.32, { align: 'center' });
  }

  if (onProgress) onProgress(0.92, 'Embedding high-resolution photographic tiles into PDF...');

  // Convert canvas to high-quality JPEG for optimal PDF embedding without exceeding browser heap
  const imgDataUrl = masterCanvas.toDataURL('image/jpeg', 0.96);

  pdf.addImage(
    imgDataUrl,
    'JPEG',
    artX,
    artY,
    artW,
    artH,
    undefined,
    'FAST'
  );

  if (onProgress) onProgress(0.98, 'Finalizing PDF output...');

  const outputBlob = pdf.output('blob');
  return outputBlob;
}

/**
 * Generate Master Wall Print Image (PNG or JPEG) with optional museum signature
 */
export async function exportWallPrintImage(
  masterCanvas: HTMLCanvasElement,
  options: WallPrintOptions,
  onProgress?: (progress: number, status: string) => void
): Promise<Blob> {
  if (onProgress) onProgress(0.88, `Preparing ${options.format.toUpperCase()} export...`);

  if (!options.hasBorder) {
    // Borderless full-bleed output
    if (options.format === 'jpeg') {
      return canvasToJpegBlob(masterCanvas, 0.96);
    }
    return canvasToPngBlob(masterCanvas);
  }

  // Create artwork with tasteful dark museum signature banner at bottom
  const sigHeight = Math.max(80, Math.round(masterCanvas.height * 0.05));
  const canvas = document.createElement('canvas');
  canvas.width = masterCanvas.width;
  canvas.height = masterCanvas.height + sigHeight;

  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw master mosaic
  ctx.drawImage(masterCanvas, 0, 0);

  // Draw elegant footer
  ctx.fillStyle = '#080808';
  ctx.fillRect(0, masterCanvas.height, canvas.width, sigHeight);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fillRect(0, masterCanvas.height, canvas.width, 1);

  // Signature text
  const fontSize = Math.max(20, Math.round(sigHeight * 0.36));
  ctx.fillStyle = '#f0ebe2';
  ctx.font = `italic ${fontSize}px "Didot", "Playfair Display", Georgia, serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(options.signatureText || 'Everyone Is Part of You', sigHeight * 0.8, masterCanvas.height + sigHeight / 2);

  ctx.fillStyle = '#8a857e';
  ctx.font = `400 ${Math.max(12, Math.round(fontSize * 0.55))}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText(options.subText || 'One face. A thousand little worlds. · 300 DPI Wall Art Edition', canvas.width - (sigHeight * 0.8), masterCanvas.height + sigHeight / 2);

  if (onProgress) onProgress(0.96, 'Compressing master pixels...');

  if (options.format === 'jpeg') {
    return canvasToJpegBlob(canvas, 0.96);
  }
  return canvasToPngBlob(canvas);
}
