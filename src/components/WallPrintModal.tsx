import { useState, useCallback } from 'react';
import { 
  PRINT_SIZES, 
  renderWallPrintCanvas, 
  exportWallPrintPdf, 
  exportWallPrintImage 
} from '../lib/pdfExport';
import type { PaperSize, ExportFormat } from '../lib/pdfExport';
import type { MosaicResult, TileData, MosaicConfig } from '../lib/mosaicGenerator';
import { downloadBlob, exportWholeImageMacro, exportDetailCrop } from '../lib/exportImage';
import './WallPrintModal.css';

interface WallPrintModalProps {
  mosaicResult: MosaicResult;
  tiles: TileData[];
  config: MosaicConfig;
  portraitCanvas: HTMLCanvasElement;
  onClose: () => void;
}

export default function WallPrintModal({
  mosaicResult,
  tiles,
  config,
  portraitCanvas,
  onClose,
}: WallPrintModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [selectedSize, setSelectedSize] = useState<PaperSize>('24x36');
  const [hasBorder, setHasBorder] = useState(true);
  const [isExporting, setIsExportisExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const activeSpec = PRINT_SIZES[selectedSize];
  const aspect = mosaicResult.targetAspect || (portraitCanvas.width / portraitCanvas.height);
  const isLandscape = aspect > 1.0;

  // Formatted dimensions
  const dimStr = isLandscape 
    ? `${activeSpec.dimensionsInches[1]}" × ${activeSpec.dimensionsInches[0]}"` 
    : `${activeSpec.dimensionsInches[0]}" × ${activeSpec.dimensionsInches[1]}"`;

  const handleStartExport = useCallback(async () => {
    setIsExportisExporting(true);
    setProgress(0);
    setError(null);
    setStatusMessage('Initializing maximum resolution canvas...');

    try {
      // 1. Render master wall print canvas
      const masterCanvas = await renderWallPrintCanvas(
        mosaicResult,
        tiles,
        config,
        portraitCanvas,
        activeSpec.targetWidthPx,
        (p, status) => {
          setProgress(p);
          setStatusMessage(status);
        }
      );

      // 2. Generate target format
      let blob: Blob;
      let filename = '';

      if (selectedFormat === 'pdf') {
        setStatusMessage('Creating vector-wrapped 300 DPI PDF...');
        blob = await exportWallPrintPdf(
          masterCanvas, 
          {
            size: selectedSize,
            format: 'pdf',
            hasBorder,
            signatureText: 'Everyone Is Part of You',
            subText: 'One face. A thousand little worlds. · 300 DPI Wall Art Edition',
          },
          (p, status) => {
            setProgress(p);
            setStatusMessage(status);
          }
        );
        filename = `everyone-is-part-of-you-wall-print-${selectedSize}.pdf`;
      } else {
        setStatusMessage(`Encoding ${selectedFormat.toUpperCase()} master file...`);
        blob = await exportWallPrintImage(
          masterCanvas,
          {
            size: selectedSize,
            format: selectedFormat,
            hasBorder,
            signatureText: 'Everyone Is Part of You',
            subText: 'One face. A thousand little worlds. · 300 DPI Wall Art Edition',
          },
          (p, status) => {
            setProgress(p);
            setStatusMessage(status);
          }
        );
        filename = `everyone-is-part-of-you-${selectedSize}.${selectedFormat === 'jpeg' ? 'jpg' : 'png'}`;
      }

      setStatusMessage('Download ready!');
      setProgress(1.0);
      downloadBlob(blob, filename);

      setTimeout(() => {
        setIsExportisExporting(false);
      }, 1000);
    } catch (err) {
      console.error('Export failed:', err);
      setError(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsExportisExporting(false);
    }
  }, [mosaicResult, tiles, config, portraitCanvas, activeSpec, selectedFormat, selectedSize, hasBorder]);

  // Export close-up detail composition
  // Export full macro detail for the WHOLE image (all tiles and rows)
  const handleDetailExport = useCallback(async () => {
    try {
      setIsExportisExporting(true);
      setStatusMessage('Assembling Whole-Image Macro Detail PNG (all tiles)...');
      setProgress(0.1);

      const blob = await exportWholeImageMacro(
        mosaicResult,
        tiles,
        config,
        portraitCanvas,
        (p, status) => {
          setProgress(p);
          setStatusMessage(status);
        }
      );
      downloadBlob(blob, 'everyone-is-part-of-you-whole-image-macro.png');
      setProgress(1.0);
      setTimeout(() => setIsExportisExporting(false), 500);
    } catch (err) {
      console.error(err);
      setError(`Macro PNG export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsExportisExporting(false);
    }
  }, [mosaicResult, tiles, config, portraitCanvas]);

  return (
    <div 
      className="wall-modal-overlay" 
      onClick={onClose}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="wall-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="wall-modal__header">
          <div>
            <span className="type-label wall-modal__eyebrow">Museum & Wall Art Printing</span>
            <h2 className="wall-modal__title">Export for Wall Print</h2>
          </div>
          <button className="wall-modal__close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </header>

        {error && (
          <div className="wall-modal__error">
            <span>⚠</span>
            <p>{error}</p>
          </div>
        )}

        <div className="wall-modal__body">
          {/* Format Tabs */}
          <div className="wall-modal__section">
            <span className="type-label wall-modal__section-title">Select Format</span>
            <div className="wall-modal__format-tabs">
              <button
                type="button"
                className={`wall-modal__format-tab ${selectedFormat === 'pdf' ? 'wall-modal__format-tab--active' : ''}`}
                onClick={() => setSelectedFormat('pdf')}
              >
                <div className="wall-modal__format-badge">300 DPI</div>
                <strong>Print-Ready PDF</strong>
                <span>Vector-wrapped for wall posters & commercial print shops</span>
              </button>

              <button
                type="button"
                className={`wall-modal__format-tab ${selectedFormat === 'png' ? 'wall-modal__format-tab--active' : ''}`}
                onClick={() => setSelectedFormat('png')}
              >
                <div className="wall-modal__format-badge">Lossless Macro</div>
                <strong>Whole-Image Macro PNG</strong>
                <span>Ultra-high resolution master (up to 7,200px+) showing every photo across the entire image</span>
              </button>

              <button
                type="button"
                className={`wall-modal__format-tab ${selectedFormat === 'jpeg' ? 'wall-modal__format-tab--active' : ''}`}
                onClick={() => setSelectedFormat('jpeg')}
              >
                <div className="wall-modal__format-badge">100% Quality</div>
                <strong>Photo Lab JPEG</strong>
                <span>Universal photo format accepted by all canvas & print labs</span>
              </button>
            </div>
          </div>

          {/* Paper Size Grid */}
          <div className="wall-modal__section">
            <div className="wall-modal__section-header">
              <span className="type-label wall-modal__section-title">Wall Frame Size</span>
              <span className="wall-modal__dpi-badge">300 DPI Print Master</span>
            </div>

            <div className="wall-modal__sizes-grid">
              {(Object.keys(PRINT_SIZES) as PaperSize[]).map((key) => {
                const s = PRINT_SIZES[key];
                const isSelected = selectedSize === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`wall-modal__size-card ${isSelected ? 'wall-modal__size-card--active' : ''}`}
                    onClick={() => setSelectedSize(key)}
                  >
                    <div className="wall-modal__size-top">
                      <strong>{s.name}</strong>
                      <span className="wall-modal__size-dim">{s.dimensionsMm}</span>
                    </div>
                    <p className="wall-modal__size-desc">{s.description}</p>
                    <span className="wall-modal__size-rec">{s.recommendedFor}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Framing & Style Option */}
          <div className="wall-modal__section">
            <span className="type-label wall-modal__section-title">Print Style & Framing</span>
            <div className="wall-modal__style-options">
              <label className={`wall-modal__style-radio ${hasBorder ? 'wall-modal__style-radio--active' : ''}`}>
                <input
                  type="radio"
                  name="printStyle"
                  checked={hasBorder}
                  onChange={() => setHasBorder(true)}
                />
                <div className="wall-modal__style-content">
                  <strong>Museum Gallery Matte</strong>
                  <span>Includes archival matte border with tasteful title and signature at bottom</span>
                </div>
              </label>

              <label className={`wall-modal__style-radio ${!hasBorder ? 'wall-modal__style-radio--active' : ''}`}>
                <input
                  type="radio"
                  name="printStyle"
                  checked={!hasBorder}
                  onChange={() => setHasBorder(false)}
                />
                <div className="wall-modal__style-content">
                  <strong>Full Bleed (Borderless)</strong>
                  <span>Edge-to-edge artwork for custom framing or canvas wrap-around</span>
                </div>
              </label>
            </div>
          </div>

          {/* Print Specification Summary Box */}
          <div className="wall-modal__summary-box">
            <div className="wall-modal__summary-item">
              <span>Selected Dimensions</span>
              <strong>{dimStr} ({activeSpec.dimensionsMm})</strong>
            </div>
            <div className="wall-modal__summary-item">
              <span>Pixel Resolution</span>
              <strong>~{activeSpec.targetWidthPx} × {Math.round(activeSpec.targetWidthPx / aspect)} px</strong>
            </div>
            <div className="wall-modal__summary-item">
              <span>Photographic Tiles</span>
              <strong>{mosaicResult.gridCols * mosaicResult.gridRows} razor-sharp photos</strong>
            </div>
            <div className="wall-modal__summary-item">
              <span>Print Sharpness</span>
              <strong className="wall-modal__accent-text">300 DPI Fine Art Standard</strong>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <footer className="wall-modal__footer">
          <button 
            type="button" 
            className="btn btn-ghost" 
            onClick={handleDetailExport}
            disabled={isExporting}
            title="Download the entire portrait in ultra high-resolution macro detail PNG"
          >
            Download Whole-Image Macro PNG (.png)
          </button>

          <button
            type="button"
            className="btn btn-primary wall-modal__download-btn"
            onClick={handleStartExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <>
                <span className="wall-modal__spinner" />
                <span>Exporting... {Math.round(progress * 100)}%</span>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 11V13H14V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 2V10M5 7L8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>
                  Download {selectedFormat.toUpperCase()} ({dimStr} @ 300 DPI)
                </span>
              </>
            )}
          </button>
        </footer>

        {/* Live Export Progress Banner */}
        {isExporting && (
          <div className="wall-modal__progress-bar-wrap">
            <div className="wall-modal__progress-fill" style={{ width: `${Math.max(6, progress * 100)}%` }} />
            <span className="wall-modal__progress-text">{statusMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
