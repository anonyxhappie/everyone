import type { AppStage, PortraitData, TileImages } from '../App';
import type { MosaicConfig, TileDensity, TileShape, Effect3D } from './mosaicGenerator';
import type { FilterPreset, ImageAdjustments } from './imageProcessing';

export const DEFAULT_CONFIG: MosaicConfig = {
  density: 'fine',
  shape: 'square',
  filterPreset: 'none',
  adjustments: {
    contrast: 1.10,
    saturation: 1.0,
    warmth: 0,
    vignette: 0.15,
  },
  overlayOpacity: 0.35,
  colorCorrection: 0.45,
  facialClarity: 1.0,
  effect3D: 'none',
  depth3D: 0.5,
  interactiveTilt: true,
};

const DB_NAME = 'everyone_is_part_of_you_db';
const DB_VERSION = 1;
const STORE_NAME = 'app_session';
const CONFIG_KEY = 'everyone_mosaic_config_v1';
const STAGE_KEY = 'everyone_app_stage_v1';
const DEMO_KEY = 'everyone_demo_index_v1';

/**
 * Open or initialize IndexedDB instance
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Convert HTMLCanvasElement to PNG Blob
 */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to convert canvas to blob'));
    }, 'image/png');
  });
}

/**
 * Convert Blob to HTMLCanvasElement
 */
export function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/**
 * Sync current application state and fine-tune edits to the URL query string
 */
export function syncStateToUrl(
  config: MosaicConfig,
  stage: AppStage,
  demoIndex?: number | null
): void {
  try {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);

    if (stage !== 'intro') {
      url.searchParams.set('stage', stage);
    } else {
      url.searchParams.delete('stage');
    }

    if (demoIndex !== undefined && demoIndex !== null) {
      url.searchParams.set('demo', String(demoIndex));
    } else {
      url.searchParams.delete('demo');
    }

    // Mosaic configuration
    url.searchParams.set('shape', config.shape || 'square');
    url.searchParams.set('density', config.density || 'fine');
    url.searchParams.set('clarity', String(Math.round((config.facialClarity ?? 1.0) * 100)));
    url.searchParams.set('tint', String(Math.round((config.colorCorrection ?? 0.45) * 100)));
    url.searchParams.set('overlay', String(Math.round((config.overlayOpacity ?? 0.35) * 100)));
    
    if (config.filterPreset && config.filterPreset !== 'none') {
      url.searchParams.set('filter', config.filterPreset);
    } else {
      url.searchParams.delete('filter');
    }

    if (config.adjustments) {
      url.searchParams.set('contrast', String(Math.round(config.adjustments.contrast * 100)));
      url.searchParams.set('sat', String(Math.round(config.adjustments.saturation * 100)));
      url.searchParams.set('warmth', String(config.adjustments.warmth));
      url.searchParams.set('vig', String(Math.round(config.adjustments.vignette * 100)));
    }

    // 3D Effect configuration
    if (config.effect3D && config.effect3D !== 'none') {
      url.searchParams.set('effect3d', config.effect3D);
      url.searchParams.set('depth3d', String(Math.round((config.depth3D ?? 0.5) * 100)));
    } else {
      url.searchParams.delete('effect3d');
      url.searchParams.delete('depth3d');
    }

    if (config.interactiveTilt === false) {
      url.searchParams.set('tilt', '0');
    } else {
      url.searchParams.delete('tilt');
    }

    window.history.replaceState(null, '', url.toString());

    // Also persist config into localStorage for instant synchronous retrieval
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    localStorage.setItem(STAGE_KEY, stage);
    if (demoIndex !== undefined && demoIndex !== null) {
      localStorage.setItem(DEMO_KEY, String(demoIndex));
    } else {
      localStorage.removeItem(DEMO_KEY);
    }
  } catch (err) {
    console.warn('Failed to sync state to URL/localStorage:', err);
  }
}

/**
 * Parse config, stage, and demo index from URL parameters, falling back to localStorage
 */
export function loadStateFromUrlOrStorage(): {
  config: MosaicConfig;
  stage: AppStage;
  demoIndex: number | null;
} {
  const resultConfig: MosaicConfig = { ...DEFAULT_CONFIG, adjustments: { ...DEFAULT_CONFIG.adjustments } };
  let stage: AppStage = 'intro';
  let demoIndex: number | null = null;

  try {
    // 1. First, check localStorage fallback
    if (typeof localStorage !== 'undefined') {
      const storedConfigStr = localStorage.getItem(CONFIG_KEY);
      if (storedConfigStr) {
        try {
          const parsed = JSON.parse(storedConfigStr);
          Object.assign(resultConfig, parsed);
          if (parsed.adjustments) {
            resultConfig.adjustments = { ...DEFAULT_CONFIG.adjustments, ...parsed.adjustments };
          }
        } catch {
          // ignore corrupted json
        }
      }

      const storedStage = localStorage.getItem(STAGE_KEY) as AppStage | null;
      if (storedStage === 'intro' || storedStage === 'upload' || storedStage === 'reveal') {
        stage = storedStage;
      }

      const storedDemo = localStorage.getItem(DEMO_KEY);
      if (storedDemo) {
        demoIndex = parseInt(storedDemo, 10) || 1;
      }
    }

    // 2. Overlay URL search params if present (URL has highest priority!)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);

      const urlStage = params.get('stage') as AppStage | null;
      if (urlStage === 'intro' || urlStage === 'upload' || urlStage === 'reveal') {
        stage = urlStage;
      }

      const urlDemo = params.get('demo');
      if (urlDemo !== null) {
        demoIndex = parseInt(urlDemo, 10) || 1;
      }

      const shape = params.get('shape') as TileShape | null;
      if (shape && ['square', 'rounded', 'circle', 'rectangle', 'triangle', 'hexagon', 'diamond'].includes(shape)) {
        resultConfig.shape = shape;
      }

      const density = params.get('density') as TileDensity | null;
      if (density && ['bold', 'balanced', 'fine'].includes(density)) {
        resultConfig.density = density;
      }

      const clarity = params.get('clarity');
      if (clarity !== null) {
        resultConfig.facialClarity = Math.max(0, Math.min(100, parseInt(clarity, 10))) / 100;
      }

      const tint = params.get('tint');
      if (tint !== null) {
        resultConfig.colorCorrection = Math.max(0, Math.min(80, parseInt(tint, 10))) / 100;
      }

      const overlay = params.get('overlay');
      if (overlay !== null) {
        resultConfig.overlayOpacity = Math.max(0, Math.min(60, parseInt(overlay, 10))) / 100;
      }

      const filter = params.get('filter') as FilterPreset | null;
      if (filter && ['none', 'cinematic', 'noir', 'vintage', 'editorial', 'vivid', 'golden'].includes(filter)) {
        resultConfig.filterPreset = filter;
      }

      const contrast = params.get('contrast');
      if (contrast !== null) {
        resultConfig.adjustments.contrast = parseInt(contrast, 10) / 100;
      }

      const sat = params.get('sat');
      if (sat !== null) {
        resultConfig.adjustments.saturation = parseInt(sat, 10) / 100;
      }

      const warmth = params.get('warmth');
      if (warmth !== null) {
        resultConfig.adjustments.warmth = parseInt(warmth, 10);
      }

      const vig = params.get('vig');
      if (vig !== null) {
        resultConfig.adjustments.vignette = parseInt(vig, 10) / 100;
      }

      // 3D Effect parameters
      const effect3d = params.get('effect3d') as Effect3D | null;
      if (effect3d && ['none', 'emboss', 'floating', 'extrude', 'anaglyph'].includes(effect3d)) {
        resultConfig.effect3D = effect3d;
      }

      const depth3d = params.get('depth3d');
      if (depth3d !== null) {
        resultConfig.depth3D = Math.max(0, Math.min(100, parseInt(depth3d, 10))) / 100;
      }

      const tilt = params.get('tilt');
      if (tilt !== null) {
        resultConfig.interactiveTilt = tilt !== '0';
      }
    }
  } catch (err) {
    console.warn('Error reading stored state:', err);
  }

  return { config: resultConfig, stage, demoIndex };
}

/**
 * Save binary session (portrait canvas, user tile canvases, and originals) into IndexedDB
 */
export async function saveSessionToIndexedDB(
  portraitCanvas: HTMLCanvasElement,
  isDemo: boolean,
  name?: string,
  userTiles?: (HTMLCanvasElement | HTMLImageElement)[] | null,
  userOriginals?: (HTMLCanvasElement | HTMLImageElement)[] | null
): Promise<void> {
  try {
    const db = await openDB();
    const portraitBlob = await canvasToBlob(portraitCanvas);

    let tilesBlobs: Blob[] = [];
    if (userTiles && userTiles.length > 0) {
      // Save user tiles
      for (const t of userTiles) {
        if (t instanceof HTMLCanvasElement) {
          tilesBlobs.push(await canvasToBlob(t));
        } else if (t instanceof HTMLImageElement) {
          const c = document.createElement('canvas');
          c.width = t.naturalWidth || t.width || 480;
          c.height = t.naturalHeight || t.height || 480;
          c.getContext('2d')!.drawImage(t, 0, 0);
          tilesBlobs.push(await canvasToBlob(c));
        }
      }
    }

    let origBlobs: Blob[] = [];
    if (userOriginals && userOriginals.length > 0) {
      for (const o of userOriginals) {
        if (o instanceof HTMLCanvasElement) {
          origBlobs.push(await canvasToBlob(o));
        } else if (o instanceof HTMLImageElement) {
          const c = document.createElement('canvas');
          c.width = o.naturalWidth || o.width;
          c.height = o.naturalHeight || o.height;
          c.getContext('2d')!.drawImage(o, 0, 0);
          origBlobs.push(await canvasToBlob(c));
        }
      }
    }

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    store.put(portraitBlob, 'portrait_blob');
    store.put({ isDemo, name }, 'portrait_meta');
    store.put(tilesBlobs, 'tiles_blobs');
    store.put(origBlobs, 'orig_blobs');

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to save session into IndexedDB:', err);
  }
}

/**
 * Load saved binary session from IndexedDB
 */
export async function loadSessionFromIndexedDB(): Promise<{
  portrait: PortraitData;
  userTiles: HTMLCanvasElement[] | null;
  userOriginals?: HTMLCanvasElement[] | null;
} | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const getReq = (key: string): Promise<any> => {
      return new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    };

    const portraitBlob = await getReq('portrait_blob');
    const portraitMeta = await getReq('portrait_meta');
    const tilesBlobs = await getReq('tiles_blobs');
    const origBlobs = await getReq('orig_blobs');

    if (!portraitBlob) return null;

    const portraitCanvas = await blobToCanvas(portraitBlob);
    const isDemo = Boolean(portraitMeta?.isDemo);
    const name = portraitMeta?.name;

    let userTiles: HTMLCanvasElement[] | null = null;
    if (tilesBlobs && Array.isArray(tilesBlobs) && tilesBlobs.length > 0) {
      userTiles = [];
      for (const b of tilesBlobs) {
        userTiles.push(await blobToCanvas(b));
      }
    }

    let userOriginals: HTMLCanvasElement[] | null = null;
    if (origBlobs && Array.isArray(origBlobs) && origBlobs.length > 0) {
      userOriginals = [];
      for (const b of origBlobs) {
        userOriginals.push(await blobToCanvas(b));
      }
    }

    return {
      portrait: { canvas: portraitCanvas, isDemo, name },
      userTiles,
      userOriginals,
    };
  } catch (err) {
    console.warn('Failed to load session from IndexedDB:', err);
    return null;
  }
}

/**
 * Clear all stored state (invoked when user clicks "Start Over" or "New Portrait")
 */
export async function clearStoredSession(): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CONFIG_KEY);
      localStorage.removeItem(STAGE_KEY);
      localStorage.removeItem(DEMO_KEY);
    }

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState(null, '', url.pathname);
    }

    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to clear stored session:', err);
  }
}
