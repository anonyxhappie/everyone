import { useEffect, useRef, useCallback, useState } from 'react';
import { loadSamplePortrait } from '../lib/sampleImages';
import { generateSelfCrops } from '../lib/imageProcessing';
import './IntroScreen.css';

interface IntroScreenProps {
  onStartCreate: () => void;
  onExploreDemo: (demoIndex?: number) => void;
  isLoadingDemo?: boolean;
}

interface DriftingPhoto {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  aspect: number;
  opacity: number;
  baseOpacity: number;
  rotation: number;
  vRot: number;
  depth: number;
  tileIndex: number;
}

export default function IntroScreen({ onStartCreate, onExploreDemo, isLoadingDemo = false }: IntroScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photosRef = useRef<DriftingPhoto[]>([]);
  const animFrameRef = useRef<number>(0);
  const mouseRef = useRef({ x: -1, y: -1, targetX: -1, targetY: -1 });
  const tileImagesRef = useRef<HTMLCanvasElement[]>([]);
  const portraitCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [selectedDemo, setSelectedDemo] = useState<number>(1);
  const pausedRef = useRef(false);

  // Load sample portrait and extract self-crops for the drifting field
  useEffect(() => {
    let cancelled = false;
    // Use smaller tiles on the intro screen (120px is plenty for the drifting effect)
    loadSamplePortrait(selectedDemo).then((portrait) => {
      if (cancelled) return;
      portraitCanvasRef.current = portrait;
      const selfCrops = generateSelfCrops(portrait, 120);
      tileImagesRef.current = selfCrops;
      setTilesLoaded(true);
    });

    return () => { cancelled = true; };
  }, [selectedDemo]);

  const createPhotos = useCallback((w: number, h: number, tileCount: number): DriftingPhoto[] => {
    // Reduce particle count on mobile for performance
    const isMobile = w < 640;
    const maxCount = isMobile ? 25 : 80;
    const count = Math.min(maxCount, Math.max(isMobile ? 15 : 35, Math.floor((w * h) / (isMobile ? 30000 : 18000))));
    const photos: DriftingPhoto[] = [];

    for (let i = 0; i < count; i++) {
      const depth = 0.2 + Math.random() * 0.8;
      const size = Math.round((22 + depth * 38) * (Math.min(w, h) / 900));

      photos.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25 * depth,
        vy: -0.15 - Math.random() * 0.3 * depth,
        size,
        aspect: 0.95 + Math.random() * 0.1,
        opacity: 0.15 + depth * 0.45,
        baseOpacity: 0.15 + depth * 0.45,
        rotation: (Math.random() - 0.5) * 0.4,
        vRot: (Math.random() - 0.5) * 0.003,
        depth,
        tileIndex: i % Math.max(1, tileCount),
      });
    }

    return photos;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const resize = () => {
      // Cap DPR at 2 on mobile to avoid enormous backing canvases
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      photosRef.current = createPhotos(w, h, tileImagesRef.current.length || 40);
    };

    resize();
    window.addEventListener('resize', resize);

    // Only track mouse on desktop (no mouse events on touch devices)
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.targetX = e.clientX;
      mouseRef.current.targetY = e.clientY;
    };
    if (window.matchMedia('(hover: hover)').matches) {
      window.addEventListener('mousemove', handleMouseMove);
    }

    // Pause animation when page is hidden
    const handleVisibility = () => {
      pausedRef.current = document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const render = () => {
      if (pausedRef.current) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const w = window.innerWidth;
      const h = window.innerHeight;

      // Mouse smooth tracking
      const m = mouseRef.current;
      m.x += (m.targetX - m.x) * 0.05;
      m.y += (m.targetY - m.y) * 0.05;

      // Deep, pitch-black space
      ctx.fillStyle = '#080808';
      ctx.fillRect(0, 0, w, h);

      // Subtle atmospheric radial glow
      const cx = w / 2;
      const cy = h * 0.46;
      const ambientGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.65);
      ambientGlow.addColorStop(0, 'rgba(214, 192, 160, 0.035)');
      ambientGlow.addColorStop(0.5, 'rgba(26, 22, 32, 0.02)');
      ambientGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = ambientGlow;
      ctx.fillRect(0, 0, w, h);

      // Subtle emergence of human portrait behind the floating memories
      const portrait = portraitCanvasRef.current;
      if (portrait) {
        ctx.save();
        const pAspect = portrait.width / portrait.height;
        const targetH = Math.min(h * 0.72, 640);
        const targetW = targetH * pAspect;
        const px = cx - targetW / 2;
        const py = cy - targetH / 2;

        ctx.globalAlpha = 0.25;
        ctx.drawImage(portrait, px, py, targetW, targetH);

        // Soft dreamlike vignette over the portrait
        const mask = ctx.createRadialGradient(cx, cy, targetW * 0.2, cx, cy, targetW * 0.65);
        mask.addColorStop(0, 'transparent');
        mask.addColorStop(0.7, 'rgba(8, 8, 8, 0.55)');
        mask.addColorStop(1, '#080808');
        ctx.fillStyle = mask;
        ctx.fillRect(px - 40, py - 40, targetW + 80, targetH + 80);
        ctx.restore();
      }

      // Drifting field of tiny photographic moments
      const photos = photosRef.current;
      const tiles = tileImagesRef.current;

      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];

        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.vRot;

        if (p.y < -p.size - 20) {
          p.y = h + p.size + 10;
          p.x = Math.random() * w;
        }
        if (p.x < -p.size - 20) p.x = w + p.size + 10;
        if (p.x > w + p.size + 20) p.x = -p.size - 10;

        // Subtle mouse repulsion (desktop only)
        if (m.x > 0 && m.y > 0) {
          const dx = p.x - m.x;
          const dy = p.y - m.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180) {
            const push = (1 - dist / 180) * 0.5;
            p.x += (dx / dist) * push * 3;
            p.y += (dy / dist) * push * 3;
          }
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.opacity;

        const tileCanvas = tiles[p.tileIndex % tiles.length];
        const pw = p.size;
        const ph = p.size * p.aspect;

        if (tileCanvas) {
          const border = Math.max(1, Math.round(p.size * 0.06));
          ctx.fillStyle = 'rgba(240, 235, 225, 0.2)';
          ctx.fillRect(-pw / 2 - border, -ph / 2 - border, pw + border * 2, ph + border * 2 + border * 2);
          ctx.drawImage(tileCanvas, -pw / 2, -ph / 2, pw, ph);
        } else {
          ctx.fillStyle = 'rgba(180, 160, 140, 0.25)';
          ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
        }

        ctx.restore();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    if (!prefersReducedMotion) {
      animFrameRef.current = requestAnimationFrame(render);
    } else {
      // Single static paint for accessibility
      ctx.fillStyle = '#080808';
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [createPhotos, tilesLoaded]);

  return (
    <div className="intro">
      <canvas ref={canvasRef} className="intro__canvas" />

      {/* Cinematic Vignette */}
      <div className="intro__vignette" />

      <div className="intro__content">
        <header className="intro__brand">
          <span className="type-label intro__eyebrow">Interactive Digital Artwork</span>
        </header>

        <div className="intro__text">
          <h1 className="intro__title type-display">
            <span className="intro__title-line">EVERYONE IS</span>
            <span className="intro__title-line intro__title-line--accent">PART OF YOU.</span>
          </h1>
          <p className="intro__subtitle">
            One face. A thousand little worlds.
          </p>
        </div>

        <div className="intro__actions">
          {/* Primary CTA: Watch the demo transformation */}
          <button 
            className="btn btn-primary intro__cta" 
            onClick={() => onExploreDemo(selectedDemo)}
            disabled={isLoadingDemo}
            autoFocus
          >
            {isLoadingDemo ? (
              <>
                <span className="intro__spinner" />
                Loading...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/>
                  <polygon points="6.5,5 11,8 6.5,11" fill="currentColor"/>
                </svg>
                <span>Watch the transformation</span>
              </>
            )}
          </button>

          {/* Demo subject picker */}
          <div className="intro__demo-pills">
            <button 
              type="button"
              className={`intro__demo-pill ${selectedDemo === 1 ? 'intro__demo-pill--active' : ''}`}
              onClick={() => setSelectedDemo(1)}
              title="Portrait 1: Sophia"
            >
              Sophia
            </button>
            <button 
              type="button"
              className={`intro__demo-pill ${selectedDemo === 2 ? 'intro__demo-pill--active' : ''}`}
              onClick={() => setSelectedDemo(2)}
              title="Portrait 2: Marcus"
            >
              Marcus
            </button>
          </div>

          {/* Secondary CTA: Upload your own */}
          <button 
            className="btn btn-secondary intro__make-yours" 
            onClick={onStartCreate}
          >
            <span>Make yours</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <footer className="intro__footer">
          <div className="privacy-badge intro__privacy">
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M8 1L2 4V7.5C2 11.1 4.5 14.4 8 15.3C11.5 14.4 14 11.1 14 7.5V4L8 1Z" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M5.5 8L7 9.5L10.5 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>100% Client-Side · Your photos never leave your device</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
