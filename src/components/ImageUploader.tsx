import { useState, useRef, useCallback, useEffect } from 'react';
import { loadImage, cropImage, createThumbnail } from '../lib/imageProcessing';
import { loadSamplePortrait } from '../lib/sampleImages';
import './ImageUploader.css';

interface ImageUploaderProps {
  onPortraitReady: (
    portrait: HTMLCanvasElement, 
    tiles: HTMLCanvasElement[] | null, 
    originals?: (HTMLCanvasElement | HTMLImageElement)[] | null
  ) => void;
  onBack: () => void;
}

interface CropState {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TilePhoto {
  id: string;
  file: File;
  url: string;
}

// Helper to recursively read all files from dropped items (handles directories & files)
async function readDataTransferItems(items: DataTransferItemList): Promise<File[]> {
  const files: File[] = [];
  const entries: any[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.webkitGetAsEntry) {
      const entry = item.webkitGetAsEntry();
      if (entry) entries.push(entry);
    } else {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }

  const queue = [...entries];
  while (queue.length > 0) {
    const entry = queue.shift();
    if (entry.isFile) {
      await new Promise<void>((resolve) => {
        entry.file((file: File) => {
          files.push(file);
          resolve();
        }, () => resolve());
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch: any[] = [];
      do {
        batch = await new Promise<any[]>((resolve) => {
          reader.readEntries((ents: any[]) => resolve(ents), () => resolve([]));
        });
        queue.push(...batch);
      } while (batch.length > 0);
    }
  }

  return files.filter(f => 
    ['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || 
    /\.(jpe?g|png|webp)$/i.test(f.name)
  );
}

export default function ImageUploader({ onPortraitReady, onBack }: ImageUploaderProps) {
  const [portraitPreview, setPortraitPreview] = useState<string | null>(null);
  const [portraitImage, setPortraitImage] = useState<HTMLImageElement | null>(null);
  const [tilePhotos, setTilePhotos] = useState<TilePhoto[]>([]);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropState>({ x: 0, y: 0, width: 1, height: 1 });
  const [processing, setProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('Preparing...');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'portrait' | 'customize'>('portrait');
  
  const portraitInputRef = useRef<HTMLInputElement>(null);
  const tilesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Cleanup portrait preview on change/unmount
  useEffect(() => {
    return () => {
      if (portraitPreview) URL.revokeObjectURL(portraitPreview);
    };
  }, [portraitPreview]);

  // Keep ref to all active tile preview URLs for leak-free unmount cleanup
  const tilePhotosRef = useRef<TilePhoto[]>([]);
  tilePhotosRef.current = tilePhotos;
  useEffect(() => {
    return () => {
      tilePhotosRef.current.forEach(t => URL.revokeObjectURL(t.url));
    };
  }, []);

  // Handle portrait image file selection
  const processPortraitFile = useCallback(async (file: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      setError('Please select a JPEG, PNG, or WebP image for the portrait.');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError('Image is too large. Please select an image under 50MB.');
      return;
    }

    setError(null);
    setProcessing(true);
    setProcessingMessage('Loading portrait...');

    try {
      const img = await loadImage(file);
      setPortraitImage(img);

      if (portraitPreview) URL.revokeObjectURL(portraitPreview);
      const url = URL.createObjectURL(file);
      setPortraitPreview(url);

      // Auto-detect portrait crop (center-weighted vertical aspect ratio)
      const aspect = img.width / img.height;
      if (aspect > 0.85) {
        const cropW = Math.min(1, 0.8 / aspect);
        setCrop({ x: (1 - cropW) / 2, y: 0, width: cropW, height: 1 });
      } else {
        setCrop({ x: 0, y: 0, width: 1, height: 1 });
      }

      setStep('customize');
    } catch {
      setError('Could not load that image. Please try another.');
    } finally {
      setProcessing(false);
    }
  }, [portraitPreview]);

  const handlePortraitInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processPortraitFile(file);
  };

  // Add multiple tile files
  const addTileFiles = useCallback((newFiles: File[], sourceFolder?: string) => {
    const valid = newFiles.filter(f => 
      ['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || 
      /\.(jpe?g|png|webp)$/i.test(f.name)
    );

    if (valid.length === 0) {
      setError('No valid image files found (JPEG, PNG, WebP supported).');
      return;
    }

    setError(null);
    if (sourceFolder) setFolderName(sourceFolder);

    const newTiles: TilePhoto[] = valid.map((file, idx) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      url: URL.createObjectURL(file),
    }));

    setTilePhotos(prev => {
      const combined = [...prev, ...newTiles];
      if (combined.length > 400) {
        // Revoke URLs for excess items beyond limit
        combined.slice(400).forEach(t => URL.revokeObjectURL(t.url));
        return combined.slice(0, 400);
      }
      return combined;
    });
  }, []);

  // Remove a specific photo tile
  const handleRemoveTile = useCallback((idToRemove: string) => {
    setTilePhotos(prev => {
      const target = prev.find(t => t.id === idToRemove);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      const updated = prev.filter(t => t.id !== idToRemove);
      if (updated.length === 0) {
        setFolderName(null);
      }
      return updated;
    });
  }, []);

  // Multiple files input handler
  const handleTilesSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      addTileFiles(files);
    }
    e.target.value = '';
  }, [addTileFiles]);

  // Folder input handler
  const handleFolderSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      // Extract folder name from the first file's webkitRelativePath
      const firstPath = files[0].webkitRelativePath || '';
      const detectedFolder = firstPath.split('/')[0] || 'Selected Folder';
      addTileFiles(files, detectedFolder);
    }
    e.target.value = '';
  }, [addTileFiles]);

  // Clear all added tiles
  const handleClearTiles = useCallback(() => {
    setTilePhotos(prev => {
      prev.forEach(t => URL.revokeObjectURL(t.url));
      return [];
    });
    setFolderName(null);
  }, []);

  // Drag and drop for portrait or multiple files/folders
  const handleDropOnZone = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.remove('uploader__dropzone--active');

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setProcessing(true);
      setProcessingMessage('Scanning dropped items...');
      const droppedFiles = await readDataTransferItems(e.dataTransfer.items);
      setProcessing(false);

      if (droppedFiles.length === 0) return;

      if (!portraitImage && step === 'portrait') {
        // First file is portrait, rest (if any) are tiles!
        const [first, ...rest] = droppedFiles;
        await processPortraitFile(first);
        if (rest.length > 0) {
          addTileFiles(rest, 'Dropped Folder');
        }
      } else {
        // Add all as tiles
        addTileFiles(droppedFiles, 'Dropped Folder');
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      if (!portraitImage && step === 'portrait') {
        const [first, ...rest] = files;
        await processPortraitFile(first);
        if (rest.length > 0) addTileFiles(rest);
      } else {
        addTileFiles(files);
      }
    }
  }, [portraitImage, step, processPortraitFile, addTileFiles]);

  // Focal crop dragging
  const handleCropDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!previewRef.current) return;
    e.preventDefault();

    const getPos = (ev: React.MouseEvent | React.TouchEvent) => {
      const rect = previewRef.current!.getBoundingClientRect();
      const clientX = 'touches' in ev ? ev.touches[0].clientX : (ev as React.MouseEvent).clientX;
      const clientY = 'touches' in ev ? ev.touches[0].clientY : (ev as React.MouseEvent).clientY;
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height,
      };
    };

    const startPos = getPos(e);
    isDragging.current = true;
    dragStart.current = { x: crop.x - startPos.x, y: crop.y - startPos.y };

    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!isDragging.current || !previewRef.current) return;
      const rect = previewRef.current.getBoundingClientRect();
      const clientX = 'touches' in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;
      const clientY = 'touches' in ev ? ev.touches[0].clientY : (ev as MouseEvent).clientY;
      const pos = {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height,
      };

      setCrop(prev => ({
        ...prev,
        x: Math.max(0, Math.min(1 - prev.width, dragStart.current.x + pos.x)),
        y: Math.max(0, Math.min(1 - prev.height, dragStart.current.y + pos.y)),
      }));
    };

    const onEnd = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }, [crop]);

  // Confirm and start mosaic generation
  const handleConfirm = useCallback(async () => {
    if (!portraitImage) return;
    setProcessing(true);
    setError(null);
    setProcessingMessage('Extracting high-resolution portrait & moments...');

    try {
      // High-resolution crop of the portrait for maximum analysis fidelity
      const cropX = Math.round(crop.x * portraitImage.width);
      const cropY = Math.round(crop.y * portraitImage.height);
      const cropW = Math.round(crop.width * portraitImage.width);
      const cropH = Math.round(crop.height * portraitImage.height);

      const maxDim = 1200;
      const aspect = cropW / cropH;
      const outW = aspect >= 1 ? maxDim : Math.round(maxDim * aspect);
      const outH = aspect >= 1 ? Math.round(maxDim / aspect) : maxDim;

      const croppedCanvas = cropImage(portraitImage, cropX, cropY, cropW, cropH, outW, outH);

      // Process user tiles if provided (up to 300 photos)
      let userTiles: HTMLCanvasElement[] | null = null;
      let userOriginals: (HTMLCanvasElement | HTMLImageElement)[] | null = null;
      if (tilePhotos.length > 0) {
        setProcessingMessage(`Processing ${tilePhotos.length} uploaded photo tiles...`);
        const canvases: HTMLCanvasElement[] = [];
        const originals: (HTMLCanvasElement | HTMLImageElement)[] = [];
        const limit = Math.min(tilePhotos.length, 300);

        for (let i = 0; i < limit; i++) {
          try {
            const img = await loadImage(tilePhotos[i].file);
            // Create 480px high-resolution square thumbnail for sharp zoom & 300 DPI print
            const thumb = createThumbnail(img, 480);
            canvases.push(thumb);
            originals.push(img);
          } catch {
            // Skip unreadable files gracefully
          }
        }
        if (canvases.length > 0) {
          userTiles = canvases;
          userOriginals = originals;
        }
      }

      onPortraitReady(croppedCanvas, userTiles, userOriginals);
    } catch (err) {
      console.error(err);
      setError('Failed to process image. Please try again.');
      setProcessing(false);
    }
  }, [portraitImage, crop, tilePhotos, onPortraitReady]);

  // Use bundled sample portraits with crops of that same image only
  const handleUseSample = useCallback(async (sampleIndex = 1) => {
    setProcessing(true);
    setError(null);
    setProcessingMessage('Loading sample portrait...');
    try {
      const portrait = await loadSamplePortrait(sampleIndex);
      onPortraitReady(portrait, null);
    } catch {
      setError('Failed to load sample portraits.');
      setProcessing(false);
    }
  }, [onPortraitReady]);

  return (
    <div className="uploader">
      {/* Hidden File Inputs */}
      <input
        ref={portraitInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handlePortraitInput}
      />

      <input
        ref={tilesInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        onChange={handleTilesSelect}
      />

      {/* HTML5 Directory / Folder Upload */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        className="sr-only"
        onChange={handleFolderSelect}
      />

      <header className="uploader__header">
        <button className="btn btn-ghost" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
        <span className="type-label uploader__title">Create Your Portrait</span>
        <div style={{ width: 60 }} />
      </header>

      <main className="uploader__body">
        {error && (
          <div className="uploader__error">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M8 4.5V9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>
            </svg>
            {error}
          </div>
        )}

        {step === 'portrait' && (
          <div className="uploader__dropzone-container">
            <div 
              className="uploader__dropzone"
              onClick={() => portraitInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('uploader__dropzone--active'); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('uploader__dropzone--active'); }}
              onDrop={handleDropOnZone}
            >
              <div className="uploader__dropzone-icon">
                <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
                  <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="18" cy="22" r="4" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M6 32L16 24L26 32L34 26L42 32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M24 6V14M20 10H28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="uploader__dropzone-text">
                <strong>Upload your portrait photograph</strong>
                <span>Drag & drop photo or browse from your device</span>
              </div>
              <span className="type-label uploader__dropzone-hint">JPEG, PNG, WebP (Front-facing portrait recommended)</span>
            </div>

            {/* Quick Folder / Multi-photo Pre-Selection */}
            <div className="uploader__quick-tiles-bar">
              <span className="uploader__quick-tiles-label">Have extra photos for the mosaic?</span>
              <div className="uploader__quick-tiles-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary btn-sm"
                  onClick={() => tilesInputRef.current?.click()}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Select Photos
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary btn-sm"
                  onClick={() => folderInputRef.current?.click()}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 5H12.5C13.33 5 14 5.67 14 6.5V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z" stroke="currentColor" strokeWidth="1.3"/>
                  </svg>
                  Select Entire Folder
                </button>
              </div>
              {tilePhotos.length > 0 && (
                <div className="uploader__tile-count-badge">
                  ✓ {tilePhotos.length} photo{tilePhotos.length === 1 ? '' : 's'} ready {folderName ? `from "${folderName}"` : ''}
                </div>
              )}
            </div>

            <div className="uploader__divider">
              <span>or choose a curated portrait</span>
            </div>

            <div className="uploader__sample-grid">
              <button 
                type="button"
                className="uploader__sample-card" 
                onClick={() => handleUseSample(1)}
                disabled={processing}
              >
                <div className="uploader__sample-avatar">
                  <img src="/portraits/sample-portrait-1.jpg" alt="Sample Sophia" />
                </div>
                <div className="uploader__sample-info">
                  <strong>Sophia</strong>
                  <span>Warm natural light</span>
                </div>
              </button>

              <button 
                type="button"
                className="uploader__sample-card" 
                onClick={() => handleUseSample(2)}
                disabled={processing}
              >
                <div className="uploader__sample-avatar">
                  <img src="/portraits/sample-portrait-2.jpg" alt="Sample Marcus" />
                </div>
                <div className="uploader__sample-info">
                  <strong>Marcus</strong>
                  <span>Dramatic contrast</span>
                </div>
              </button>
            </div>

            <div className="privacy-badge uploader__privacy">
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M8 1L2 4V7.5C2 11.1 4.5 14.4 8 15.3C11.5 14.4 14 11.1 14 7.5V4L8 1Z" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M5.5 8L7 9.5L10.5 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Processed locally in your browser. Never uploaded to any server.</span>
            </div>
          </div>
        )}

        {step === 'customize' && portraitPreview && (
          <div className="uploader__edit">
            <div className="uploader__columns">
              {/* Left Column: Portrait Focal Crop */}
              <div className="uploader__preview-section">
                <div className="uploader__section-header">
                  <span className="type-label">Step 1 — Adjust Focus</span>
                  <span className="uploader__hint-badge">Drag box to position face</span>
                </div>
                <div 
                  ref={previewRef}
                  className="uploader__preview" 
                  onMouseDown={handleCropDrag}
                  onTouchStart={handleCropDrag}
                >
                  <img src={portraitPreview} alt="Portrait preview" className="uploader__preview-img" />
                  <div 
                    className="uploader__crop-overlay"
                    style={{
                      left: `${crop.x * 100}%`,
                      top: `${crop.y * 100}%`,
                      width: `${crop.width * 100}%`,
                      height: `${crop.height * 100}%`,
                    }}
                  >
                    <div className="uploader__crop-crosshair" />
                  </div>
                </div>
              </div>

              {/* Right Column: Custom Tiles or Self-Crops */}
              <div 
                className="uploader__tiles-section"
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('uploader__tiles-section--active'); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove('uploader__tiles-section--active'); }}
                onDrop={handleDropOnZone}
              >
                <div className="uploader__section-header">
                  <span className="type-label">Step 2 — Mosaic Memory Tiles</span>
                  {tilePhotos.length > 0 && (
                    <button 
                      type="button" 
                      className="btn-ghost uploader__clear-btn" 
                      onClick={handleClearTiles}
                      title="Clear all uploaded photos and use crops of portrait only"
                    >
                      Clear all ({tilePhotos.length})
                    </button>
                  )}
                </div>

                <div className="uploader__tiles-status">
                  {tilePhotos.length > 0 ? (
                    <p className="uploader__tiles-desc">
                      Using <strong>only your {tilePhotos.length} uploaded photo{tilePhotos.length === 1 ? '' : 's'}</strong> {folderName ? `from "${folderName}"` : ''} for the mosaic tiles. No portrait crops or outside images.
                    </p>
                  ) : (
                    <p className="uploader__tiles-desc">
                      <strong>Single-photo mode:</strong> Your mosaic will be created <em>entirely from multi-scale crops of this same photograph</em> (eyes, smile, hair, textures, lighting). No external or random photos.
                    </p>
                  )}
                </div>

                {/* Multi-Photo & Folder Action Buttons */}
                <div className="uploader__tiles-btn-bar">
                  <button 
                    type="button"
                    className="btn btn-secondary uploader__action-btn"
                    onClick={() => tilesInputRef.current?.click()}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <span>Add Photos</span>
                  </button>

                  <button 
                    type="button"
                    className="btn btn-secondary uploader__action-btn"
                    onClick={() => folderInputRef.current?.click()}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 5H12.5C13.33 5 14 5.67 14 6.5V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z" stroke="currentColor" strokeWidth="1.3"/>
                    </svg>
                    <span>Add Entire Folder</span>
                  </button>
                </div>

                {/* Thumbnail strip of loaded photos if any */}
                {tilePhotos.length > 0 && (
                  <div className="uploader__tiles-preview-wrapper">
                    <div className="uploader__tiles-grid-header">
                      <span className="uploader__tiles-count-label">
                        {tilePhotos.length} photo{tilePhotos.length === 1 ? '' : 's'} added
                      </span>
                      <span className="uploader__tiles-hint-label">
                        Hover or tap to remove
                      </span>
                    </div>
                    <div className="uploader__tiles-grid" role="list" aria-label="Added photo tiles">
                      {tilePhotos.map((tile, i) => (
                        <div 
                          key={tile.id} 
                          className="uploader__tile-thumb"
                          role="listitem"
                          title={tile.file.name || `Photo ${i + 1}`}
                        >
                          <img 
                            src={tile.url} 
                            alt={tile.file.name || `Tile ${i + 1}`} 
                            loading="lazy" 
                          />
                          <button
                            type="button"
                            className="uploader__tile-remove-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveTile(tile.id);
                            }}
                            title={tile.file.name ? `Remove "${tile.file.name}"` : `Remove photo ${i + 1}`}
                            aria-label={tile.file.name ? `Remove ${tile.file.name}` : `Remove photo ${i + 1}`}
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                              <path d="M8 2L2 8M2 2L8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="uploader__confirm-box">
                  <button 
                    className="btn btn-primary uploader__create-btn" 
                    onClick={handleConfirm}
                    disabled={processing}
                  >
                    {processing ? (
                      <>
                        <span className="uploader__spinner" />
                        {processingMessage}
                      </>
                    ) : (
                      <>
                        Assemble mosaic
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </>
                    )}
                  </button>

                  <button 
                    type="button"
                    className="btn btn-ghost" 
                    onClick={() => setStep('portrait')}
                  >
                    Change portrait image
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {processing && (
        <div className="uploader__processing-overlay">
          <div className="uploader__processing-content">
            <div className="uploader__spinner uploader__spinner--large" />
            <p className="type-label">{processingMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
