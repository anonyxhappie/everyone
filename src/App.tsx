import { useState, useCallback, useEffect } from 'react';
import IntroScreen from './components/IntroScreen';
import ImageUploader from './components/ImageUploader';
import MosaicViewer from './components/MosaicViewer';
import { loadSamplePortrait } from './lib/sampleImages';
import { generateSelfCrops } from './lib/imageProcessing';
import { 
  DEFAULT_CONFIG, 
  loadStateFromUrlOrStorage, 
  syncStateToUrl, 
  saveSessionToIndexedDB, 
  loadSessionFromIndexedDB, 
  clearStoredSession 
} from './lib/storage';
import type { MosaicConfig } from './lib/mosaicGenerator';
import './App.css';

export type AppStage = 'intro' | 'upload' | 'reveal';

export interface PortraitData {
  canvas: HTMLCanvasElement;
  isDemo: boolean;
  name?: string;
}

export interface TileImages {
  canvases: (HTMLCanvasElement | HTMLImageElement)[];
  isUserProvided: boolean;
  originals?: (HTMLCanvasElement | HTMLImageElement)[];
}

export default function App() {
  const [stage, setStage] = useState<AppStage>('intro');
  const [portrait, setPortrait] = useState<PortraitData | null>(null);
  const [tiles, setTiles] = useState<TileImages | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [initialConfig, setInitialConfig] = useState<MosaicConfig>(DEFAULT_CONFIG);
  const [isRestored, setIsRestored] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  // Restore session from URL and browser storage on initial page load
  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const { config, stage: savedStage, demoIndex } = loadStateFromUrlOrStorage();
        setInitialConfig(config);

        if (savedStage === 'reveal') {
          if (demoIndex) {
            // Restore demo portrait & multi-scale crops
            const demoPortrait = await loadSamplePortrait(demoIndex);
            const selfCrops = generateSelfCrops(demoPortrait, 480);
            if (cancelled) return;

            setPortrait({
              canvas: demoPortrait,
              isDemo: true,
              name: demoIndex === 2 ? 'Marcus' : 'Sophia',
            });
            setTiles({ canvases: selfCrops, isUserProvided: false });
            setIsRestored(true);
            setStage('reveal');
            setIsRestoringSession(false);
            return;
          }

          // Check IndexedDB for user's uploaded portrait & tiles
          const session = await loadSessionFromIndexedDB();
          if (session && !cancelled) {
            setPortrait(session.portrait);
            if (session.userTiles && session.userTiles.length > 0) {
              setTiles({
                canvases: session.userTiles,
                isUserProvided: true,
                originals: session.userOriginals || undefined,
              });
            } else {
              const selfCrops = generateSelfCrops(session.portrait.canvas, 480);
              setTiles({ canvases: selfCrops, isUserProvided: false });
            }
            setIsRestored(true);
            setStage('reveal');
            setIsRestoringSession(false);
            return;
          }
        } else if (savedStage === 'upload') {
          if (!cancelled) setStage('upload');
        }
      } catch (err) {
        console.warn('Session restoration failed:', err);
      } finally {
        if (!cancelled) setIsRestoringSession(false);
      }
    };

    restoreSession();
    return () => { cancelled = true; };
  }, []);

  const transitionTo = useCallback((nextStage: AppStage) => {
    setTransitioning(true);
    setTimeout(() => {
      setStage(nextStage);
      requestAnimationFrame(() => {
        setTransitioning(false);
      });
    }, 350);
  }, []);

  const handleStartCreate = useCallback(() => {
    syncStateToUrl(initialConfig, 'upload', null);
    transitionTo('upload');
  }, [transitionTo, initialConfig]);

  // Load a demo portrait: uses crops strictly of that same demo portrait
  const handleExploreDemo = useCallback(async (demoIndex = 1) => {
    if (loadingDemo) return;
    setLoadingDemo(true);
    try {
      const demoPortrait = await loadSamplePortrait(demoIndex);

      // Extract 200+ multi-scale crops strictly of this exact portrait at 480px
      const selfCrops = generateSelfCrops(demoPortrait, 480);

      const portraitData = { 
        canvas: demoPortrait, 
        isDemo: true, 
        name: demoIndex === 2 ? 'Marcus' : 'Sophia' 
      };
      const tileData = { canvases: selfCrops, isUserProvided: false };

      setPortrait(portraitData);
      setTiles(tileData);
      setIsRestored(false);

      // Persist session to IndexedDB and URL
      await saveSessionToIndexedDB(demoPortrait, true, portraitData.name);
      syncStateToUrl(initialConfig, 'reveal', demoIndex);

      transitionTo('reveal');
    } catch (err) {
      console.error('Failed to load demo:', err);
    } finally {
      setLoadingDemo(false);
    }
  }, [loadingDemo, transitionTo, initialConfig]);

  // Handle uploaded portrait:
  // If only a single photo is provided, extract 200+ multi-scale crops strictly from that same photo!
  const handlePortraitReady = useCallback(async (
    portraitCanvas: HTMLCanvasElement, 
    userTiles: HTMLCanvasElement[] | null,
    userOriginals?: (HTMLCanvasElement | HTMLImageElement)[] | null
  ) => {
    setPortrait({ canvas: portraitCanvas, isDemo: false });

    if (userTiles && userTiles.length > 0) {
      // User provided mosaic photo/photos: use ONLY them for mosaic tiles!
      setTiles({ 
        canvases: userTiles, 
        isUserProvided: true,
        originals: userOriginals || undefined
      });
    } else {
      // No mosaic photos provided (single photo mode):
      // Use multi-scale crops of that same image only at 480px
      const selfCrops = generateSelfCrops(portraitCanvas, 480);
      setTiles({ canvases: selfCrops, isUserProvided: false });
    }

    setIsRestored(false);

    // Persist user's portrait and tiles in IndexedDB and sync URL
    await saveSessionToIndexedDB(portraitCanvas, false, undefined, userTiles, userOriginals);
    syncStateToUrl(initialConfig, 'reveal', null);

    transitionTo('reveal');
  }, [transitionTo, initialConfig]);

  const handleStartOver = useCallback(async () => {
    await clearStoredSession();
    setPortrait(null);
    setTiles(null);
    setIsRestored(false);
    syncStateToUrl(initialConfig, 'intro', null);
    transitionTo('intro');
  }, [transitionTo, initialConfig]);

  if (isRestoringSession && (stage === 'reveal')) {
    return (
      <div className="app app--loading-session" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh', 
        background: '#080808',
        color: '#f0ebe2'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="mosaic-viewer__spinner" style={{ margin: '0 auto 16px', width: 24, height: 24 }} />
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.85rem', color: '#9e988f', letterSpacing: '0.04em' }}>
            Restoring your portrait session...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${transitioning ? 'app--transitioning' : ''}`}>
      {stage === 'intro' && (
        <div className={`stage ${transitioning ? 'stage--exit' : 'stage--enter'}`}>
          <IntroScreen
            onStartCreate={handleStartCreate}
            onExploreDemo={handleExploreDemo}
            isLoadingDemo={loadingDemo}
          />
        </div>
      )}
      {stage === 'upload' && (
        <div className={`stage ${transitioning ? 'stage--exit' : 'stage--enter'}`}>
          <ImageUploader
            onPortraitReady={handlePortraitReady}
            onBack={() => {
              syncStateToUrl(initialConfig, 'intro', null);
              transitionTo('intro');
            }}
          />
        </div>
      )}
      {stage === 'reveal' && portrait && tiles && (
        <div className={`stage ${transitioning ? 'stage--exit' : 'stage--enter'}`}>
          <MosaicViewer
            portrait={portrait}
            tiles={tiles}
            initialConfig={initialConfig}
            isRestored={isRestored}
            onStartOver={handleStartOver}
          />
        </div>
      )}
    </div>
  );
}
