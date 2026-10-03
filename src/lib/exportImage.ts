// Export canvas to PNG blob
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to generate PNG blob from canvas'));
      },
      'image/png',
      0.95
    );
  });
}

// Download a blob as a file
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Export mosaic with elegant signature at bottom
export function exportWithSignature(
  mosaicCanvas: HTMLCanvasElement,
  signatureText = 'Everyone Is Part of You'
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  // Scale signature banner proportionally
  const sigHeight = Math.max(50, Math.round(mosaicCanvas.height * 0.04));
  
  canvas.width = mosaicCanvas.width;
  canvas.height = mosaicCanvas.height + sigHeight;
  
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Draw main mosaic artwork
  ctx.drawImage(mosaicCanvas, 0, 0);
  
  // Draw tasteful dark signature strip
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, mosaicCanvas.height, canvas.width, sigHeight);
  
  // Subtle top border on signature strip
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(0, mosaicCanvas.height, canvas.width, 1);
  
  // Draw signature typography
  ctx.fillStyle = '#e8e4dc';
  const fontSize = Math.max(16, Math.round(sigHeight * 0.35));
  ctx.font = `italic ${fontSize}px "Didot", "Playfair Display", Georgia, serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(signatureText, sigHeight * 0.6, mosaicCanvas.height + (sigHeight / 2));
  
  // Right side subtitle
  ctx.fillStyle = '#8a857e';
  ctx.font = `400 ${Math.max(10, Math.round(fontSize * 0.6))}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText('One face. A thousand little worlds.', canvas.width - (sigHeight * 0.6), mosaicCanvas.height + (sigHeight / 2));
  
  return canvasToPngBlob(canvas);
}

import type { MosaicResult, TileData, MosaicConfig } from './mosaicGenerator';
import { drawTileWithShape, fillTileShape } from './mosaicGenerator';

/**
 * Export full-scale macro detail PNG for the ENTIRE mosaic image (all rows and columns),
 * rendering every single photographic tile in crystal-clear macro sharpness.
 */
export async function exportWholeImageMacro(
  mosaicResult: MosaicResult,
  tiles: TileData[],
  config: MosaicConfig,
  targetImage: HTMLCanvasElement,
  onProgress?: (progress: number, status: string) => void
): Promise<Blob> {
  const targetCols = mosaicResult.gridCols;
  const targetRows = mosaicResult.gridRows;

  // Render tiles at high macro resolution (96-144px per tile) so every single photo across
  // the ENTIRE face and background is razor-sharp and clearly identifiable when zooming in on the downloaded PNG!
  let tileRenderSize = Math.max(96, Math.min(144, Math.round(8400 / targetCols)));
  let outW = targetCols * tileRenderSize;
  let outH = targetRows * tileRenderSize;

  // Ensure canvas fits within safe browser memory limits (< 75 megapixels)
  while (outW * outH > 75000000 && tileRenderSize > 56) {
    tileRenderSize -= 4;
    outW = targetCols * tileRenderSize;
    outH = targetRows * tileRenderSize;
  }

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Fill dark background
  ctx.fillStyle = '#080808';
  ctx.fillRect(0, 0, outW, outH);

  // In Macro Detail PNG, keep color harmonization gentle (35% strength)
  // so original photo tiles retain their authentic photographic contrast and details!
  const tintAlpha = (config.colorCorrection ?? 0.45) * 0.35;
  const tileShape = config.shape || 'square';

  if (onProgress) onProgress(0.05, `Preparing ${outW} × ${outH}px whole-image macro canvas (${tileRenderSize}px per tile)...`);

  // Render every single row of the WHOLE image
  for (let r = 0; r < targetRows; r++) {
    const tileY = r * tileRenderSize;

    for (let c = 0; c < targetCols; c++) {
      const tileX = c * tileRenderSize;
      const tileIndex = mosaicResult.tileMap[r][c];
      const tile = tiles[tileIndex] || tiles[0];

      // Draw from high-resolution original source with automatic center-cropping
      const source = tile.original || tile.thumbnail;
      drawTileWithShape(ctx, tileShape, source, tileX, tileY, tileRenderSize, tileRenderSize, r, c, config.effect3D, config.depth3D);

      // Apply gentle color harmonization
      if (tintAlpha > 0.01 && mosaicResult.cellColors && mosaicResult.cellColors[r]) {
        const color = mosaicResult.cellColors[r][c];
        if (color) {
          fillTileShape(ctx, tileShape, `rgb(${color.r}, ${color.g}, ${color.b})`, tintAlpha, tileX, tileY, tileRenderSize, tileRenderSize, r, c, config.effect3D, config.depth3D);
        }
      }
    }

    // Yield every 4 rows to allow smooth UI progress updates
    if (r % 4 === 0) {
      if (onProgress) {
        const pct = (r + 1) / targetRows;
        onProgress(pct * 0.85, `Assembling Whole-Image Macro: Row ${r + 1} of ${targetRows}...`);
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Very subtle detail overlay (max 6%) across the whole image — NO artificial oval face mask!
  // This ensures the individual photographs are 100% visible and razor-sharp when zoomed in.
  const overlay = Math.min(0.06, (config.overlayOpacity ?? 0.35) * 0.15);
  if (overlay > 0.005) {
    ctx.globalAlpha = overlay;
    ctx.drawImage(targetImage, 0, 0, outW, outH);
    ctx.globalAlpha = 1.0;
  }

  if (onProgress) onProgress(0.92, 'Adding signature and encoding master macro PNG...');

  // Add signature banner at bottom
  const sigHeight = Math.max(90, Math.round(outH * 0.045));
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = outW;
  finalCanvas.height = outH + sigHeight;

  const fCtx = finalCanvas.getContext('2d', { alpha: false })!;
  fCtx.imageSmoothingEnabled = true;
  fCtx.imageSmoothingQuality = 'high';

  fCtx.drawImage(canvas, 0, 0);

  // Footer bar
  fCtx.fillStyle = '#080808';
  fCtx.fillRect(0, outH, outW, sigHeight);

  fCtx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  fCtx.fillRect(0, outH, outW, 1);

  const fontSize = Math.max(22, Math.round(sigHeight * 0.35));
  fCtx.fillStyle = '#f0ebe2';
  fCtx.font = `italic ${fontSize}px "Didot", "Playfair Display", Georgia, serif`;
  fCtx.textAlign = 'left';
  fCtx.textBaseline = 'middle';
  fCtx.fillText('Everyone Is Part of You · Whole-Image Macro Edition', sigHeight * 0.8, outH + sigHeight / 2);

  fCtx.fillStyle = '#8a857e';
  fCtx.font = `400 ${Math.max(12, Math.round(fontSize * 0.55))}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  fCtx.textAlign = 'right';
  fCtx.fillText('Every moment in needle-sharp macro detail', outW - (sigHeight * 0.8), outH + sigHeight / 2);

  if (onProgress) onProgress(0.98, 'Generating PNG master file...');

  return canvasToPngBlob(finalCanvas);
}

/**
 * Backward compatibility: Export macro detail for whole image instead of small crop
 */
export async function exportDetailCrop(
  mosaicCanvas: HTMLCanvasElement,
  _centerXRatio = 0.5,
  _centerYRatio = 0.4,
  _cropRatio = 1.0,
  mosaicResult?: MosaicResult | null,
  tiles?: TileData[] | null
): Promise<Blob> {
  if (mosaicResult && tiles && tiles.length > 0) {
    const dummyConfig: MosaicConfig = {
      density: 'fine',
      shape: 'square',
      filterPreset: 'none',
      adjustments: { contrast: 1.1, saturation: 1.0, warmth: 0, vignette: 0.15 },
      overlayOpacity: 0.35,
      colorCorrection: 0.45,
      facialClarity: 1.0,
    };
    return exportWholeImageMacro(mosaicResult, tiles, dummyConfig, mosaicCanvas);
  }
  return exportWithSignature(mosaicCanvas, 'Everyone Is Part of You · Macro Detail');
}

// Share using Web Share API
export async function shareImage(blob: Blob, title: string): Promise<boolean> {
  if (!canShare()) return false;
  
  try {
    const file = new File([blob], 'everyone-is-part-of-you.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title,
        text: 'Everyone Is Part of You — A portrait made of a thousand little moments.',
        files: [file]
      });
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Share was cancelled or unsupported:', err);
    return false;
  }
}

// Copy URL to clipboard  
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    const success = document.execCommand('copy');
    document.body.removeChild(input);
    return success;
  } catch (err) {
    console.error('Error copying to clipboard:', err);
    return false;
  }
}

// Check if Web Share API is available with file support
export function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}
