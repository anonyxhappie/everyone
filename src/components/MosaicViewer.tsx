import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { PortraitData, TileImages } from '../App';
import { prepareTiles, generateMosaic, renderHighRes, renderMosaicViewport } from '../lib/mosaicGenerator';
import type { TileData, MosaicConfig, MosaicResult, TileDensity, TileShape, Effect3D } from '../lib/mosaicGenerator';
import { applyImageFilters } from '../lib/imageProcessing';
import type { FilterPreset } from '../lib/imageProcessing';
import { 
  exportWithSignature, 
  exportWholeImageMacro,
  downloadBlob, 
  shareImage, 
  canShare, 
  copyToClipboard 
} from '../lib/exportImage';
import { syncStateToUrl, DEFAULT_CONFIG } from '../lib/storage';
import WallPrintModal from './WallPrintModal';
import Mosaic3DViewer from './Mosaic3DViewer';
import './MosaicViewer.css';

interface MosaicViewerProps {
  portrait: PortraitData;
  tiles: TileImages;
  initialConfig?: MosaicConfig;
  isRestored?: boolean;
  onStartOver: () => void;
}

type RevealPhase = 'portrait' | 'points' | 'tiles' | 'pullback' | 'complete';

const SHAPES: { id: TileShape; name: string; icon: string; description: string }[] = [
  { id: 'square', name: 'Square', icon: '■', description: 'Classic photo tiles' },
  { id: 'rounded', name: 'Rounded', icon: '▢', description: 'Curved modern cards' },
  { id: 'circle', name: 'Circle', icon: '●', description: 'Curved circular lenses' },
  { id: 'rectangle', name: 'Cinematic', icon: '▬', description: '3:2 landscape cards' },
  { id: 'triangle', name: 'Triangle', icon: '▲', description: 'Geometric prism mesh' },
  { id: 'hexagon', name: 'Hexagon', icon: '⬡', description: 'Honeycomb polygon mesh' },
  { id: 'diamond', name: 'Diamond', icon: '◆', description: 'Rhombus facets' },
];

const EFFECTS_3D: { id: Effect3D; name: string; icon: string; description: string }[] = [
  { id: 'none', name: 'Flat', icon: '◻', description: 'Classic flush photographic tiles' },
  { id: 'emboss', name: 'Beveled Glass', icon: '❖', description: '3D beveled glass tiles with specular rim lighting' },
  { id: 'floating', name: 'Floating Tiles', icon: '❏', description: 'Elevated tiles with soft ambient drop shadows' },
  { id: 'extrude', name: '3D Blocks', icon: '◰', description: 'Sculpted isometric 3D blocks with side extrusion' },
  { id: 'anaglyph', name: 'Stereo 3D', icon: '🥽', description: 'Stereoscopic chromatic 3D depth pop' },
];

const FILTERS: { id: FilterPreset; label: string; tone: string }[] = [
  { id: 'none', label: 'Natural', tone: 'Authentic camera lighting' },
  { id: 'cinematic', label: 'Cinematic', tone: 'Golden hour warmth & amber glow' },
  { id: 'noir', label: 'Noir B&W', tone: 'High-contrast fine-art black & white' },
  { id: 'vintage', label: 'Vintage', tone: 'Nostalgic 35mm film aesthetic' },
  { id: 'editorial', label: 'Editorial', tone: 'Cool shadows & high-fashion palette' },
  { id: 'vivid', label: 'Vivid Pop', tone: 'Punchy vibrant saturated brilliance' },
  { id: 'golden', label: 'Golden Hour', tone: 'Sun-drenched radiant bronze' },
];

export default function MosaicViewer({ 
  portrait, 
  tiles, 
  initialConfig, 
  isRestored = false, 
  onStartOver 
}: MosaicViewerProps) {
  // Mosaic state
  const [mosaicResult, setMosaicResult] = useState<MosaicResult | null>(null);
  const [tileData, setTileData] = useState<TileData[]>([]);
  const [progress, setProgress] = useState(0);
  const [generating, setGenerating] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mosaic Configuration - Initialized from URL or browser storage if available
  const [config, setConfig] = useState<MosaicConfig>(() => {
    if (initialConfig) {
      return {
        ...DEFAULT_CONFIG,
        ...initialConfig,
        adjustments: { ...DEFAULT_CONFIG.adjustments, ...initialConfig.adjustments },
      };
    }
    return DEFAULT_CONFIG;
  });

  // Automatically sync edits to URL query params and localStorage
  useEffect(() => {
    configRef.current = config;
    const demoIdx = portrait.isDemo ? (portrait.name === 'Marcus' ? 2 : 1) : null;
    syncStateToUrl(config, 'reveal', demoIdx);
  }, [config, portrait]);

  // Reveal animation phase
  const [revealPhase, setRevealPhase] = useState<RevealPhase>('portrait');

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // UI States
  const [showControls, setShowControls] = useState(() => {
    return new URLSearchParams(window.location.search).get('controls') === '1';
  });
  const [show3DStudio, setShow3DStudio] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === '3d' || params.get('view3d') === '1';
  });

  const handleToggle3DStudio = useCallback((show: boolean) => {
    setShow3DStudio(show);
    const url = new URL(window.location.href);
    if (show) {
      url.searchParams.set('view', '3d');
    } else {
      url.searchParams.delete('view');
      url.searchParams.delete('view3d');
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

  const [compareMode, setCompareMode] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const [exportingMacro, setExportingMacro] = useState(false);
  const [macroStatus, setMacroStatus] = useState('');
  const [copied, setCopied] = useState(false);
  const [showZoomHint, setShowZoomHint] = useState(true);
  const [showWallPrintModal, setShowWallPrintModal] = useState(false);
  const [inspectedTile, setInspectedTile] = useState<{
    tile: TileData;
    col: number;
    row: number;
  } | null>(null);

  // Idle subtle tile shimmer state
  const [highlightedTile, setHighlightedTile] = useState<{ row: number; col: number; intensity: number } | null>(null);
  const lastInteractionRef = useRef(Date.now());
  const idleShimmerRef = useRef<{ row: number; col: number; startTime: number } | null>(null);

  // Refs for gesture and rendering
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const pinchStartRef = useRef({ dist: 0, zoom: 1 });
  const isDraggingRef = useRef(false);
  const configRef = useRef(config);
  configRef.current = config;

  // Active filtered portrait canvas based on chosen FilterPreset & Adjustments
  const activePortrait = useMemo(() => {
    return applyImageFilters(portrait.canvas, config.filterPreset, config.adjustments);
  }, [portrait.canvas, config.filterPreset, config.adjustments]);

  // Viewport bounds for click hit-testing
  const boundsRef = useRef<{ 
    artX: number; 
    artY: number; 
    artW: number; 
    artH: number; 
    tileScreenW: number; 
    tileScreenH: number 
  } | null>(null);

  // 3D Perspective Tilt on Mouse Movement
  const [tilt, setTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 });

  const handleContainerMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    lastInteractionRef.current = Date.now();
    const target = e.target as HTMLElement | null;
    if (target?.closest('.mosaic-viewer__controls, .mosaic-viewer__header, .mosaic-viewer__toolbar, .mosaic-inspector, .wall-modal, .wall-modal-overlay')) {
      if (tilt.x !== 0 || tilt.y !== 0) setTilt({ x: 0, y: 0 });
      return;
    }
    if (isPanning || zoom > 1.15 || config.interactiveTilt === false || config.effect3D === 'none' || !config.effect3D) {
      if (tilt.x !== 0 || tilt.y !== 0) setTilt({ x: 0, y: 0 });
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;
    setMousePos({ x: normX, y: normY });

    const maxTilt = (config.depth3D ?? 0.5) * 8.5;
    const tiltX = -(normY - 0.5) * 2 * maxTilt;
    const tiltY = (normX - 0.5) * 2 * maxTilt;
    setTilt({ x: tiltX, y: tiltY });
  }, [isPanning, zoom, config.interactiveTilt, config.effect3D, config.depth3D, tilt.x, tilt.y]);

  const handleContainerMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
  }, []);

  // Cinematic 5-Phase Reveal Sequence
  const startCinematicReveal = useCallback(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || isRestored) {
      setRevealPhase('complete');
      setZoom(1);
      return;
    }

    // Phase 1: Portrait emerges in center (0ms - 1000ms)
    setRevealPhase('portrait');
    setZoom(1.0);
    setPan({ x: 0, y: 0 });

    // Phase 2: Fine points of light emerge across facial features (1000ms - 2200ms)
    setTimeout(() => {
      setRevealPhase('points');
    }, 1000);

    // Phase 3: Points resolve into tiny photo tiles; macro zoom in (2200ms - 3600ms)
    setTimeout(() => {
      setRevealPhase('tiles');
      setZoom(2.4);
      setPan({ x: 0, y: -20 });
    }, 2200);

    // Phase 4: Camera smoothly pulls back in slow cinematic dolly (3600ms - 5200ms)
    setTimeout(() => {
      setRevealPhase('pullback');
      const startTime = performance.now();
      const startZoom = 2.4;
      const startPanY = -20;
      const duration = 1600;

      const animatePullback = (now: number) => {
        const elapsed = now - startTime;
        const p = Math.min(1, elapsed / duration);
        const ease = 1 - Math.pow(1 - p, 3); // Cubic ease out

        setZoom(startZoom + (1.0 - startZoom) * ease);
        setPan({ x: 0, y: startPanY * (1 - ease) });

        if (p < 1) {
          requestAnimationFrame(animatePullback);
        } else {
          setRevealPhase('complete');
        }
      };
      requestAnimationFrame(animatePullback);
    }, 3600);
  }, []);

  // Generate the photo mosaic
  useEffect(() => {
    let cancelled = false;

    const build = async () => {
      try {
        setGenerating(true);
        setProgress(0);

        // Prepare tiles with 480x480 resolution and preserve originals for wall printing
        const prepared = prepareTiles(tiles.canvases, 480, tiles.originals);
        if (cancelled) return;
        setTileData(prepared);

        const currentActive = applyImageFilters(portrait.canvas, configRef.current.filterPreset, configRef.current.adjustments);
        const result = generateMosaic(
          currentActive,
          prepared,
          configRef.current,
          (p) => { if (!cancelled) setProgress(p); }
        );

        if (cancelled) return;
        setMosaicResult(result);
        setGenerating(false);

        startCinematicReveal();
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError(`Mosaic assembly failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
          setGenerating(false);
        }
      }
    };

    build();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portrait, tiles]);

  // Dynamic Viewport Render Frame: Paints at true screen pixel resolution!
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !mosaicResult || tileData.length === 0) return;

    const rect = container.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const w = Math.round(rect.width);
    const h = Math.round(rect.height);

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    const isShowingPortrait = (revealPhase === 'portrait' || revealPhase === 'points' || compareMode);

    const bounds = renderMosaicViewport(
      ctx,
      w,
      h,
      mosaicResult,
      tileData,
      zoom,
      pan,
      config,
      activePortrait,
      isShowingPortrait,
      highlightedTile
    );

    boundsRef.current = bounds;
    ctx.restore();
  }, [mosaicResult, tileData, zoom, pan, config, activePortrait, revealPhase, compareMode, highlightedTile]);

  // Re-render when zoom/pan/state updates
  useEffect(() => {
    const animId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animId);
  }, [renderFrame]);

  // Resize listener
  useEffect(() => {
    window.addEventListener('resize', renderFrame);
    return () => window.removeEventListener('resize', renderFrame);
  }, [renderFrame]);

  // Idle subtle tile shimmer animation (runs only when user is idle for >2.5s)
  useEffect(() => {
    if (revealPhase !== 'complete' || !mosaicResult) return;

    let animId: number;

    const tick = () => {
      const now = Date.now();
      const idleTime = now - lastInteractionRef.current;

      if (idleTime > 2500) {
        if (!idleShimmerRef.current) {
          const bounds = boundsRef.current;
          if (bounds) {
            const minCol = Math.max(0, Math.floor(-bounds.artX / bounds.tileScreenW));
            const maxCol = Math.min(mosaicResult.gridCols - 1, Math.ceil((window.innerWidth - bounds.artX) / bounds.tileScreenW));
            const minRow = Math.max(0, Math.floor(-bounds.artY / bounds.tileScreenH));
            const maxRow = Math.min(mosaicResult.gridRows - 1, Math.ceil((window.innerHeight - bounds.artY) / bounds.tileScreenH));

            if (maxCol > minCol && maxRow > minRow) {
              const r = minRow + Math.floor(Math.random() * (maxRow - minRow + 1));
              const c = minCol + Math.floor(Math.random() * (maxCol - minCol + 1));
              idleShimmerRef.current = { row: r, col: c, startTime: now };
            }
          }
        }

        if (idleShimmerRef.current) {
          const elapsed = now - idleShimmerRef.current.startTime;
          const duration = 1200;
          if (elapsed < duration) {
            const p = elapsed / duration;
            const intensity = Math.sin(p * Math.PI);
            setHighlightedTile({
              row: idleShimmerRef.current.row,
              col: idleShimmerRef.current.col,
              intensity,
            });
          } else {
            setHighlightedTile(null);
            idleShimmerRef.current = null;
            lastInteractionRef.current = now - 1000;
          }
        }
      } else {
        if (highlightedTile) setHighlightedTile(null);
        idleShimmerRef.current = null;
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [revealPhase, mosaicResult, highlightedTile]);

  // Touch gesture handling (Pinch-to-zoom & drag-to-pan)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.mosaic-viewer__controls, .mosaic-viewer__header, .mosaic-viewer__toolbar, .mosaic-inspector, .wall-modal, .wall-modal-overlay, button, input, select, textarea, label')) {
        return;
      }
      lastInteractionRef.current = Date.now();
      setShowZoomHint(false);

      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        panStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          panX: pan.x,
          panY: pan.y,
        };
      } else if (e.touches.length === 2) {
        isDraggingRef.current = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        pinchStartRef.current = { dist, zoom };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.mosaic-viewer__controls, .mosaic-viewer__header, .mosaic-viewer__toolbar, .mosaic-inspector, .wall-modal, .wall-modal-overlay, button, input, select, textarea, label')) {
        return;
      }
      if (!isDraggingRef.current && pinchStartRef.current.dist <= 0) return;
      e.preventDefault();
      lastInteractionRef.current = Date.now();

      if (e.touches.length === 1 && isDraggingRef.current) {
        const dx = e.touches[0].clientX - panStartRef.current.x;
        const dy = e.touches[0].clientY - panStartRef.current.y;
        setPan({
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy,
        });
      } else if (e.touches.length === 2 && pinchStartRef.current.dist > 0) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const scale = dist / pinchStartRef.current.dist;
        const newZoom = Math.max(0.65, Math.min(14, pinchStartRef.current.zoom * scale));
        setZoom(newZoom);
      }
    };

    const handleTouchEnd = () => {
      isDraggingRef.current = false;
      pinchStartRef.current = { dist: 0, zoom: 1 };
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    el.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [pan, zoom]);

  // Scroll wheel zoom centered around mouse position
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.mosaic-viewer__controls, .mosaic-inspector, .wall-modal, .wall-modal-overlay')) {
        // Allow natural scroll inside controls drawer or modal dialogs
        return;
      }
      e.preventDefault();
      lastInteractionRef.current = Date.now();
      setShowZoomHint(false);

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const newZoom = Math.max(0.65, Math.min(14, zoom * zoomFactor));

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;

      const scaleChange = newZoom / zoom;
      const newPanX = mouseX - (mouseX - pan.x) * scaleChange;
      const newPanY = mouseY - (mouseY - pan.y) * scaleChange;

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [zoom, pan]);

  // Mouse drag-to-pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('.mosaic-viewer__controls, .mosaic-viewer__header, .mosaic-viewer__toolbar, .mosaic-inspector, .wall-modal, .wall-modal-overlay, button, input, select, textarea, label')) {
      return;
    }
    lastInteractionRef.current = Date.now();
    setShowZoomHint(false);

    setIsPanning(true);
    isDraggingRef.current = false;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - panStartRef.current.x;
      const dy = ev.clientY - panStartRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        isDraggingRef.current = true;
      }
      setPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsPanning(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [pan]);

  // Click on tile to inspect single photo
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) return;
    if (revealPhase !== 'complete' || !mosaicResult || tileData.length === 0) return;
    if (e.target !== canvasRef.current) return;

    const bounds = boundsRef.current;
    if (!bounds) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const relativeX = clickX - bounds.artX;
    const relativeY = clickY - bounds.artY;

    if (relativeX < 0 || relativeX >= bounds.artW || relativeY < 0 || relativeY >= bounds.artH) {
      return;
    }

    const col = Math.floor(relativeX / bounds.tileScreenW);
    const row = Math.floor(relativeY / bounds.tileScreenH);

    if (row >= 0 && row < mosaicResult.gridRows && col >= 0 && col < mosaicResult.gridCols) {
      const tileIndex = mosaicResult.tileMap[row][col];
      const tile = tileData[tileIndex];
      if (tile) {
        setInspectedTile({ tile, col, row });
      }
    }
  }, [revealPhase, mosaicResult, tileData]);

  // Re-generate mosaic when Tile Density is switched
  const handleDensityChange = useCallback((newDensity: TileDensity) => {
    if (newDensity === config.density || generating || tileData.length === 0) return;

    const updatedConfig = { ...config, density: newDensity };
    setConfig(updatedConfig);
    setGenerating(true);
    setProgress(0);
    setInspectedTile(null);

    setTimeout(() => {
      try {
        const active = applyImageFilters(portrait.canvas, updatedConfig.filterPreset, updatedConfig.adjustments);
        const result = generateMosaic(
          active,
          tileData,
          updatedConfig,
          (p) => setProgress(p)
        );
        setMosaicResult(result);
        setGenerating(false);
        setRevealPhase('complete');
      } catch (err) {
        console.error(err);
        setError(`Failed to update density: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setGenerating(false);
      }
    }, 20);
  }, [config, generating, tileData, portrait.canvas]);

  // Rebuild mosaic with new settings
  const handleRebuild = useCallback(() => {
    if (tileData.length === 0 || generating) return;
    setGenerating(true);
    setProgress(0);
    setInspectedTile(null);

    setTimeout(() => {
      try {
        const active = applyImageFilters(portrait.canvas, config.filterPreset, config.adjustments);
        const result = generateMosaic(
          active,
          tileData,
          config,
          (p) => setProgress(p)
        );
        setMosaicResult(result);
        setGenerating(false);
        setRevealPhase('complete');
      } catch (err) {
        setError(`Rebuild failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setGenerating(false);
      }
    }, 20);
  }, [portrait, tileData, config, generating]);

  // Export full high-res PNG (3000px+)
  const handleExportPNG = useCallback(async () => {
    if (!mosaicResult || tileData.length === 0) return;
    setExportingPng(true);

    try {
      const hiRes = renderHighRes(mosaicResult, tileData, 1.35, config, activePortrait);
      const blob = await exportWithSignature(hiRes, 'Everyone Is Part of You');
      downloadBlob(blob, 'everyone-is-part-of-you.png');
    } catch (err) {
      console.error(err);
      setError(`Export failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setExportingPng(false);
    }
  }, [mosaicResult, tileData, config, activePortrait]);

  // Download Whole-Image Macro Detail PNG (all rows & columns at needle-sharp macro scale)
  const handleDownloadWholeImageMacro = useCallback(async () => {
    if (!mosaicResult || tileData.length === 0) return;
    setExportingMacro(true);
    setMacroStatus('Initializing macro engine...');

    try {
      const blob = await exportWholeImageMacro(
        mosaicResult,
        tileData,
        config,
        activePortrait,
        (progress, status) => {
          setMacroStatus(`${Math.round(progress * 100)}%`);
        }
      );
      downloadBlob(blob, 'everyone-is-part-of-you-macro-whole-image.png');
    } catch (err) {
      console.error(err);
      setError(`Macro PNG export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setExportingMacro(false);
      setMacroStatus('');
    }
  }, [mosaicResult, tileData, config, activePortrait]);

  // Share via Web Share API
  const handleShare = useCallback(async () => {
    if (!mosaicResult) return;

    try {
      const blob = await exportWithSignature(mosaicResult.canvas, 'Everyone Is Part of You');
      const shared = await shareImage(blob, 'Everyone Is Part of You');
      if (!shared) {
        downloadBlob(blob, 'everyone-is-part-of-you.png');
      }
    } catch {
      // User cancelled
    }
  }, [mosaicResult]);

  // Copy app link
  const handleCopyLink = useCallback(async () => {
    const success = await copyToClipboard(window.location.href);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  if (error) {
    return (
      <div className="mosaic-viewer mosaic-viewer--error">
        <div className="mosaic-viewer__error-content">
          <h2>An error occurred</h2>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={onStartOver}>Start over</button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="mosaic-viewer" 
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleContainerMouseMove}
      onMouseLeave={handleContainerMouseLeave}
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
    >
      {/* Dynamic Viewport Canvas: Paints native screen pixels, NEVER stretched or blurred */}
      <canvas 
        ref={canvasRef} 
        className="mosaic-viewer__viewport-canvas"
        onClick={handleCanvasClick}
        style={{
          transform: (config.interactiveTilt !== false && config.effect3D && config.effect3D !== 'none' && zoom <= 1.15 && !isPanning)
            ? `perspective(1000px) rotateX(${tilt.x.toFixed(2)}deg) rotateY(${tilt.y.toFixed(2)}deg)`
            : 'none',
          transition: isPanning ? 'none' : 'transform 0.16s cubic-bezier(0.2, 0, 0, 1)',
        }}
      />

      {/* Dynamic 3D specular lighting sheen */}
      {config.interactiveTilt !== false && config.effect3D && config.effect3D !== 'none' && zoom <= 1.15 && (
        <div 
          className="mosaic-viewer__specular-sheen" 
          style={{
            background: `radial-gradient(circle 520px at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(255, 255, 255, ${0.14 * (config.depth3D ?? 0.5)}), transparent 75%)`,
          }}
        />
      )}

      {/* Assembly Progress Overlay */}
      {generating && (
        <div className="mosaic-viewer__loading">
          <div className="mosaic-viewer__loading-content">
            <span className="type-label mosaic-viewer__loading-eyebrow">
              {revealPhase === 'complete' ? 'Updating Tile Density' : 'Composing your portrait'}
            </span>
            <div className="mosaic-viewer__loading-header">
              <span className="mosaic-viewer__loading-title">
                {revealPhase === 'complete' ? `Assembling ${config.density} grid...` : 'Matching life moments'}
              </span>
              <span className="mosaic-viewer__loading-pct">{Math.round(progress * 100)}%</span>
            </div>
            <div className="progress-bar">
              <div 
                className="progress-bar__fill" 
                style={{ width: `${Math.max(4, progress * 100)}%` }} 
              />
            </div>
            <p className="mosaic-viewer__loading-note">
              Analyzing facial contours and harmonizing photographic tiles in Lab color space...
            </p>
          </div>
        </div>
      )}

      {/* Golden Constellation Sparks during Phase 2 */}
      {revealPhase === 'points' && (
        <div className="mosaic-viewer__constellation">
          {Array.from({ length: 48 }).map((_, i) => (
            <div 
              key={i} 
              className="mosaic-viewer__spark"
              style={{
                left: `${15 + (i * 17) % 70}%`,
                top: `${18 + (i * 23) % 65}%`,
                animationDelay: `${(i % 12) * 0.08}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Discovery Zoom Hint */}
      {revealPhase === 'complete' && showZoomHint && (
        <div className="mosaic-viewer__zoom-hint">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M12.5 12.5L17 17" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M6 8.5H11M8.5 6V11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span>Pinch or scroll to zoom into the photos · Click any photo to inspect</span>
        </div>
      )}

      {/* Top Header Bar */}
      {revealPhase === 'complete' && (
        <header 
          className="mosaic-viewer__header"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button className="btn btn-ghost mosaic-viewer__back-btn" onClick={onStartOver}>
            ← New portrait
          </button>

          <span className="mosaic-viewer__brand">EVERYONE IS PART OF YOU</span>

          <div className="mosaic-viewer__header-actions">
            <button 
              className="btn btn-secondary mosaic-viewer__header-3d-btn" 
              onClick={() => handleToggle3DStudio(true)}
              title="Launch 360° 3D Camera Studio with physical depth pop-out"
            >
              <span style={{ fontSize: '0.9rem' }}>🌐</span>
              <span>360° 3D</span>
            </button>

            <button 
              className={`btn-icon mosaic-viewer__tune-toggle ${showControls ? 'mosaic-viewer__tune-toggle--active' : ''}`}
              onClick={() => setShowControls(!showControls)}
              title="Toggle fine tune settings"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4H10M14 4H12M4 8H14M2 8H3M2 12H7M11 12H14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <circle cx="11" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="4" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="9" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
            </button>
          </div>
        </header>
      )}

      {/* Fine-Tune Artwork Drawer Panel */}
      {showControls && (
        <aside 
          className="mosaic-viewer__controls"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="mosaic-viewer__controls-header">
            <h3>FINE TUNE ARTWORK</h3>
            <button className="btn-icon" onClick={() => setShowControls(false)}>✕</button>
          </div>

          {/* Zoom Discovery */}
          <div className="mosaic-viewer__control-group">
            <span className="type-label">Zoom Discovery</span>
            <div className="mosaic-viewer__zoom-btns">
              <button 
                className="btn-icon" 
                onClick={() => setZoom((z) => Math.max(0.65, z / 1.25))} 
                title="Zoom out"
              >
                −
              </button>
              <span className="mosaic-viewer__zoom-val">{Math.round(zoom * 100)}%</span>
              <button 
                className="btn-icon" 
                onClick={() => setZoom((z) => Math.min(14, z * 1.25))} 
                title="Zoom in"
              >
                +
              </button>
              <button 
                className="btn-icon" 
                onClick={handleResetView} 
                title="Reset view to 100%"
              >
                ⟲
              </button>
            </div>
          </div>

          {/* Tile Shape (Triangle, Rectangle, Polygons, Curved Shapes) */}
          <div className="mosaic-viewer__control-group">
            <span className="type-label">Tile Shape</span>
            <div className="mosaic-viewer__shape-grid">
              {SHAPES.map((s) => (
                <button
                  key={s.id}
                  className={`mosaic-viewer__shape-btn ${config.shape === s.id ? 'mosaic-viewer__shape-btn--active' : ''}`}
                  onClick={() => setConfig((prev) => ({ ...prev, shape: s.id }))}
                  title={s.description}
                >
                  <span className="mosaic-viewer__shape-icon">{s.icon}</span>
                  <span className="mosaic-viewer__shape-name">{s.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tile Density */}
          <div className="mosaic-viewer__control-group">
            <span className="type-label">Tile Density</span>
            <div className="mosaic-viewer__density-options">
              {(['bold', 'balanced', 'fine'] as TileDensity[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={generating}
                  className={`mosaic-viewer__density-btn ${config.density === d ? 'mosaic-viewer__density-btn--active' : ''}`}
                  onClick={() => handleDensityChange(d)}
                >
                  {d === 'bold' ? 'Bold (~1.6k)' : d === 'balanced' ? 'Balanced (~4k)' : 'Fine (~8k)'}
                </button>
              ))}
            </div>
          </div>

          {/* 3D Dimension & Depth */}
          <div className="mosaic-viewer__control-group">
            <div className="mosaic-viewer__slider-label">
              <span className="type-label">3D Dimension & Depth</span>
              <span className="mosaic-viewer__slider-val">
                {EFFECTS_3D.find(e => e.id === (config.effect3D || 'none'))?.name || 'Flat'}
              </span>
            </div>
            <div className="mosaic-viewer__3d-chips">
              {EFFECTS_3D.map((e) => (
                <button
                  key={e.id}
                  className={`mosaic-viewer__3d-chip ${config.effect3D === e.id || (!config.effect3D && e.id === 'none') ? 'mosaic-viewer__3d-chip--active' : ''}`}
                  onClick={() => setConfig((prev) => ({ 
                    ...prev, 
                    effect3D: e.id,
                    depth3D: prev.depth3D ?? 0.5 
                  }))}
                  title={e.description}
                >
                  <span className="mosaic-viewer__3d-chip-icon">{e.icon}</span>
                  <span className="mosaic-viewer__3d-chip-name">{e.name}</span>
                </button>
              ))}
            </div>

            {config.effect3D && config.effect3D !== 'none' && (
              <>
                <div className="mosaic-viewer__slider-label" style={{ marginTop: '0.625rem' }}>
                  <span className="mosaic-viewer__adj-label">3D Depth Intensity</span>
                  <span className="mosaic-viewer__slider-val">{Math.round((config.depth3D ?? 0.5) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={Math.round((config.depth3D ?? 0.5) * 100)}
                  onChange={(e) => setConfig((prev) => ({ ...prev, depth3D: Number(e.target.value) / 100 }))}
                  className="mosaic-viewer__slider"
                />

                <label className="mosaic-viewer__checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.interactiveTilt !== false}
                    onChange={(e) => setConfig((prev) => ({ ...prev, interactiveTilt: e.target.checked }))}
                  />
                  <span>Interactive Perspective Tilt on Hover</span>
                </label>
              </>
            )}

            <button
              className="btn btn-primary mosaic-viewer__launch-3d-btn"
              onClick={() => handleToggle3DStudio(true)}
              style={{ width: '100%', marginTop: '0.875rem', gap: '8px' }}
            >
              <span style={{ fontSize: '1rem' }}>🌐</span>
              <span>Launch 360° 3D Camera Studio</span>
            </button>
          </div>

          {/* Portrait Clarity (Zoom Out) */}
          <div className="mosaic-viewer__control-group">
            <div className="mosaic-viewer__slider-label">
              <span className="type-label">Portrait Clarity (Zoom Out)</span>
              <span className="mosaic-viewer__slider-val">{Math.round((config.facialClarity ?? 1.0) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round((config.facialClarity ?? 1.0) * 100)}
              onChange={(e) => setConfig((prev) => ({ ...prev, facialClarity: Number(e.target.value) / 100 }))}
              className="mosaic-viewer__slider"
            />
            <span className="mosaic-viewer__subtext">Keeps portrait features crisp from afar without artificial masks</span>
          </div>

          {/* Color Harmonization (Tint) */}
          <div className="mosaic-viewer__control-group">
            <div className="mosaic-viewer__slider-label">
              <span className="type-label">Color Harmonization</span>
              <span className="mosaic-viewer__slider-val">{Math.round((config.colorCorrection ?? 0.45) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="80"
              value={Math.round((config.colorCorrection ?? 0.45) * 100)}
              onChange={(e) => setConfig((prev) => ({ ...prev, colorCorrection: Number(e.target.value) / 100 }))}
              className="mosaic-viewer__slider"
            />
            <span className="mosaic-viewer__subtext">Blends photographic moments with facial highlights</span>
          </div>

          {/* Detail Overlay */}
          <div className="mosaic-viewer__control-group">
            <div className="mosaic-viewer__slider-label">
              <span className="type-label">Detail Overlay</span>
              <span className="mosaic-viewer__slider-val">{Math.round(config.overlayOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="60"
              value={Math.round(config.overlayOpacity * 100)}
              onChange={(e) => setConfig((prev) => ({ ...prev, overlayOpacity: Number(e.target.value) / 100 }))}
              className="mosaic-viewer__slider"
            />
          </div>

          {/* Artistic Mood & Filters */}
          <div className="mosaic-viewer__control-group">
            <div className="mosaic-viewer__slider-label">
              <span className="type-label">Artistic Mood & Filters</span>
              <span className="mosaic-viewer__slider-val">
                {FILTERS.find(f => f.id === config.filterPreset)?.label || 'Natural'}
              </span>
            </div>
            <div className="mosaic-viewer__filter-chips">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={`mosaic-viewer__filter-chip ${config.filterPreset === f.id ? 'mosaic-viewer__filter-chip--active' : ''}`}
                  onClick={() => setConfig((prev) => ({ ...prev, filterPreset: f.id }))}
                  title={f.tone}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fine Image Adjustments */}
          <div className="mosaic-viewer__adjustments">
            <span className="type-label" style={{ fontSize: '0.6875rem', letterSpacing: '0.08em', color: '#b8b2a8' }}>
              Portrait Tone & Finetuning
            </span>

            {/* Contrast */}
            <div className="mosaic-viewer__adj-item">
              <div className="mosaic-viewer__slider-label">
                <span className="mosaic-viewer__adj-label">Contrast</span>
                <span className="mosaic-viewer__slider-val">{Math.round((config.adjustments?.contrast ?? 1.1) * 100)}%</span>
              </div>
              <input
                type="range"
                min="70"
                max="150"
                value={Math.round((config.adjustments?.contrast ?? 1.1) * 100)}
                onChange={(e) => {
                  const val = Number(e.target.value) / 100;
                  setConfig((prev) => ({ ...prev, adjustments: { ...prev.adjustments, contrast: val } }));
                }}
                className="mosaic-viewer__slider"
              />
            </div>

            {/* Saturation */}
            <div className="mosaic-viewer__adj-item">
              <div className="mosaic-viewer__slider-label">
                <span className="mosaic-viewer__adj-label">Saturation</span>
                <span className="mosaic-viewer__slider-val">{Math.round((config.adjustments?.saturation ?? 1.0) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="180"
                value={Math.round((config.adjustments?.saturation ?? 1.0) * 100)}
                onChange={(e) => {
                  const val = Number(e.target.value) / 100;
                  setConfig((prev) => ({ ...prev, adjustments: { ...prev.adjustments, saturation: val } }));
                }}
                className="mosaic-viewer__slider"
              />
            </div>

            {/* Warmth */}
            <div className="mosaic-viewer__adj-item">
              <div className="mosaic-viewer__slider-label">
                <span className="mosaic-viewer__adj-label">Warmth / Tone</span>
                <span className="mosaic-viewer__slider-val">
                  {(config.adjustments?.warmth ?? 0) > 0 ? `+${config.adjustments?.warmth}` : (config.adjustments?.warmth ?? 0)}
                </span>
              </div>
              <input
                type="range"
                min="-40"
                max="40"
                value={config.adjustments?.warmth ?? 0}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setConfig((prev) => ({ ...prev, adjustments: { ...prev.adjustments, warmth: val } }));
                }}
                className="mosaic-viewer__slider"
              />
            </div>

            {/* Vignette */}
            <div className="mosaic-viewer__adj-item">
              <div className="mosaic-viewer__slider-label">
                <span className="mosaic-viewer__adj-label">Facial Vignette</span>
                <span className="mosaic-viewer__slider-val">{Math.round((config.adjustments?.vignette ?? 0.15) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                value={Math.round((config.adjustments?.vignette ?? 0.15) * 100)}
                onChange={(e) => {
                  const val = Number(e.target.value) / 100;
                  setConfig((prev) => ({ ...prev, adjustments: { ...prev.adjustments, vignette: val } }));
                }}
                className="mosaic-viewer__slider"
              />
            </div>
          </div>

          {/* Toggles & Actions */}
          <div className="mosaic-viewer__control-actions">
            <button 
              className="btn btn-secondary mosaic-viewer__toggle-btn" 
              onClick={() => setCompareMode(!compareMode)}
            >
              {compareMode ? 'Show Mosaic' : 'Compare Original Portrait'}
            </button>

            <button 
              className="btn btn-primary mosaic-viewer__rebuild-btn" 
              onClick={handleRebuild} 
              disabled={generating}
            >
              {generating ? 'Re-assembling...' : 'Re-assemble with new settings'}
            </button>
          </div>
        </aside>
      )}

      {/* Bottom Floating Control Bar */}
      {revealPhase === 'complete' && (
        <div 
          className="mosaic-viewer__toolbar"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button 
            className="btn btn-primary mosaic-viewer__export-btn" 
            onClick={() => setShowWallPrintModal(true)}
            title="Export for wall printing (300 DPI PDF, Ultra 8K PNG, Print JPEG)"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M2 11V13H14V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 2V10M5 7L8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Wall Print & Export</span>
          </button>

          {/* Download Whole-Image Macro Detail PNG */}
          <button 
            className="btn btn-secondary mosaic-viewer__macro-btn"
            onClick={handleDownloadWholeImageMacro}
            disabled={exportingMacro}
            title="Download entire portrait as an ultra high-resolution macro detail PNG"
          >
            {exportingMacro ? (
              <>
                <span className="mosaic-viewer__spinner" />
                <span>{macroStatus || 'Rendering...'}</span>
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path d="M2 11V13H14V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 2V10M5 7L8 10L11 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="8" cy="6" r="1.5" fill="currentColor"/>
                </svg>
                <span>Macro Detail PNG</span>
              </>
            )}
          </button>

          {/* Shapes & Filters Drawer Trigger */}
          <button 
            className={`btn btn-secondary mosaic-viewer__tune-btn ${showControls ? 'mosaic-viewer__tune-btn--active' : ''}`} 
            onClick={() => setShowControls(!showControls)}
            title="Open shapes, mood filters & adjustments"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 4H10M14 4H12M4 8H14M2 8H3M2 12H7M11 12H14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <circle cx="11" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
              <circle cx="4" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
              <circle cx="9" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
            </svg>
            <span>Shapes & Filters</span>
          </button>

          {/* 360° 3D Studio Trigger */}
          <button 
            className="btn btn-secondary mosaic-viewer__3d-studio-btn"
            onClick={() => handleToggle3DStudio(true)}
            title="Explore in 360° 3D Camera Studio with physical depth pop-out"
          >
            <span style={{ fontSize: '0.9rem' }}>🌐</span>
            <span>360° 3D</span>
          </button>

          {/* Quick Compare Button */}
          <button 
            className={`btn btn-secondary mosaic-viewer__compare-btn ${compareMode ? 'mosaic-viewer__compare-btn--active' : ''}`}
            onClick={() => {
              setCompareMode(!compareMode);
              lastInteractionRef.current = Date.now();
            }}
            title={compareMode ? 'Show photographic mosaic' : 'Compare original portrait'}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 1V15M1 8C1 11.866 4.134 15 8 15C11.866 15 15 11.866 15 8C15 4.134 11.866 1 8 1C4.134 1 1 4.134 1 8Z" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M8 3A5 5 0 0 1 8 13Z" fill="currentColor"/>
            </svg>
            <span>{compareMode ? 'Show Mosaic' : 'Compare'}</span>
          </button>

          {canShare() && (
            <button className="btn-icon" onClick={handleShare} title="Share portrait">
              <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
                <circle cx="14" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                <circle cx="4" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                <circle cx="14" cy="14" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M6.3 7.8L11.7 5.2M6.3 10.2L11.7 12.8" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
            </button>
          )}

          <button 
            className="btn-icon" 
            onClick={handleCopyLink} 
            title={copied ? 'Link copied to clipboard!' : 'Copy app link'}
          >
            {copied ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8L6.5 11.5L13 5" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6.5 9.5L9.5 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M8.5 10.5L7 12C5.9 13.1 4.1 13.1 3 12C1.9 10.9 1.9 9.1 3 8L4.5 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M7.5 5.5L9 4C10.1 2.9 11.9 2.9 13 4C14.1 5.1 14.1 6.9 13 8L11.5 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        </div>
      )}

      {/* Inspect Single Photo Tile Modal */}
      {inspectedTile && (
        <div 
          className="mosaic-inspector" 
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={() => setInspectedTile(null)}
        >
          <div className="mosaic-inspector__card" onClick={(e) => e.stopPropagation()}>
            <div className="mosaic-inspector__header">
              <span className="type-label">Inspecting Photo Moment</span>
              <button 
                className="btn-icon" 
                onClick={() => setInspectedTile(null)}
                aria-label="Close inspector"
              >
                ✕
              </button>
            </div>

            <div className="mosaic-inspector__image-wrapper">
              <img 
                src={
                  (inspectedTile.tile.original instanceof HTMLCanvasElement 
                    ? inspectedTile.tile.original.toDataURL() 
                    : (inspectedTile.tile.original instanceof HTMLImageElement ? inspectedTile.tile.original.src : inspectedTile.tile.thumbnail.toDataURL()))
                } 
                alt="Enlarged photo moment" 
              />
            </div>

            <div className="mosaic-inspector__meta">
              <p className="mosaic-inspector__quote">
                "One of the thousands of moments that form this face."
              </p>
              <div className="mosaic-inspector__coordinates">
                <span>Location: Column {inspectedTile.col + 1} · Row {inspectedTile.row + 1}</span>
              </div>
            </div>

            <button 
              className="btn btn-secondary mosaic-inspector__action"
              onClick={() => setInspectedTile(null)}
            >
              Return to mosaic
            </button>
          </div>
        </div>
      )}

      {/* 360° 3D Camera Studio Mode */}
      {show3DStudio && mosaicResult && (
        <Mosaic3DViewer
          mosaicResult={mosaicResult}
          targetCanvas={activePortrait}
          tileData={tileData}
          onClose={() => handleToggle3DStudio(false)}
          onInspectTile={(tile, col, row) => {
            setInspectedTile({ tile, col, row });
          }}
        />
      )}

      {/* Wall Print & Master Resolution Export Modal */}
      {showWallPrintModal && mosaicResult && (
        <WallPrintModal
          mosaicResult={mosaicResult}
          tiles={tileData}
          config={config}
          portraitCanvas={activePortrait}
          onClose={() => setShowWallPrintModal(false)}
        />
      )}
    </div>
  );
}
