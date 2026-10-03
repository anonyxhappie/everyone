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
  depth: number; // 0 (far) to 1 (near)
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

  // Load sample portrait and extract self-crops for the drifting field
  useEffect(() => {
    let cancelled = false;
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
    const count = Math.min(80, Math.max(35, Math.floor((w * h) / 18000)));
    const photos: DriftingPhoto[] = [];

    for (let i = 0; i < count; i++) {
      const depth = 0.2 + Math.random() * 0.8; // Parallax depth
      const size = Math.round((22 + depth * 38) * (Math.min(w, h) / 900));

      photos.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25 * depth,
        vy: -0.15 - Math.random() * 0.3 * depth, // Gently drift upwards
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
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(dpr, dpr);

      photosRef.current = createPhotos(w, h, tileImagesRef.current.length || 40);
    };

    resize();
    window.addEventListener('resize', resize);

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.targetX = e.clientX;
      mouseRef.current.targetY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    let startTime = performance.now();

    const render = (now: number) => {
      const elapsed = (now - startTime) / 1000;
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

        // Portrait emerges gradually over 3 seconds
        const emergence = Math.min(1, Math.max(0, (elapsed - 0.4) / 2.5));
        const pulse = Math.sin(elapsed * 0.8) * 0.02;

        ctx.globalAlpha = (0.28 + pulse) * emergence;
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

        // Drift motion
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.vRot;

        // Wrap around boundaries
        if (p.y < -p.size - 20) {
          p.y = h + p.size + 10;
          p.x = Math.random() * w;
        }
        if (p.x < -p.size - 20) p.x = w + p.size + 10;
        if (p.x > w + p.size + 20) p.x = -p.size - 10;

        // Subtle mouse repulsion
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

        // Draw miniature photograph
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.opacity;

        const tileCanvas = tiles[p.tileIndex % tiles.length];
        const pw = p.size;
        const ph = p.size * p.aspect;

        if (tileCanvas) {
          // Thin photographic polaroid/print border
          const border = Math.max(1, Math.round(p.size * 0.06));
          ctx.fillStyle = 'rgba(240, 235, 225, 0.2)';
          ctx.fillRect(-pw / 2 - border, -ph / 2 - border, pw + border * 2, ph + border * 2 + border * 2);

          // The photo image itself
          ctx.drawImage(tileCanvas, -pw / 2, -ph / 2, pw, ph);

          // Subtle glossy reflection
          const gloss = ctx.createLinearGradient(-pw / 2, -ph / 2, pw / 2, ph / 2);
          gloss.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
          gloss.addColorStop(0.5, 'transparent');
          ctx.fillStyle = gloss;
          ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
        } else {
          // Fallback if tiles still loading
          ctx.fillStyle = 'rgba(180, 160, 140, 0.25)';
          ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
        }

        ctx.restore();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
          <p className="intro__quote">
            "You are never just one picture. You are made of countless little moments."
          </p>
        </div>

        <div className="intro__actions">
          <button 
            className="btn btn-primary intro__cta" 
            onClick={onStartCreate}
            autoFocus
          >
            <span>Create your portrait</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <div className="intro__demo-group">
            <button 
              className="btn btn-secondary intro__demo-btn" 
              onClick={() => onExploreDemo(selectedDemo)}
              disabled={isLoadingDemo}
            >
              {isLoadingDemo ? (
                <>
                  <span className="intro__spinner" />
                  Loading gallery demo...
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/>
                    <polygon points="6.5,5 11,8 6.5,11" fill="currentColor"/>
                  </svg>
                  Explore demo ({selectedDemo === 1 ? 'Sophia' : 'Marcus'})
                </>
              )}
            </button>

            {/* Quick Demo Switcher */}
            <div className="intro__demo-pills">
              <button 
                type="button"
                className={`intro__demo-pill ${selectedDemo === 1 ? 'intro__demo-pill--active' : ''}`}
                onClick={() => setSelectedDemo(1)}
                title="Portrait 1: Sophia"
              >
                1
              </button>
              <button 
                type="button"
                className={`intro__demo-pill ${selectedDemo === 2 ? 'intro__demo-pill--active' : ''}`}
                onClick={() => setSelectedDemo(2)}
                title="Portrait 2: Marcus"
              >
                2
              </button>
            </div>
          </div>
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
