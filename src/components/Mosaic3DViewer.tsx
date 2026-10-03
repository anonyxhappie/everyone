import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MosaicResult, TileData } from '../lib/mosaicGenerator';
import { 
  computeTileDepthMap, 
  computeTileDepthMapSync,
  DEFAULT_DEPTH_CONFIG, 
  type DepthMode, 
  type DepthMapConfig 
} from '../lib/depthMap';
import { 
  buildMosaic3D, 
  updateMosaic3DHeights, 
  getTileFromFaceIndex,
  SIDE_FINISHES, 
  type SideFinish, 
  type BuiltMosaic3D 
} from '../lib/threeMosaicBuilder';
import './Mosaic3DViewer.css';

interface Mosaic3DViewerProps {
  mosaicResult: MosaicResult;
  targetCanvas: HTMLCanvasElement;
  tileData: TileData[];
  onClose: () => void;
  onInspectTile?: (tile: TileData, col: number, row: number) => void;
}

type CameraPreset = 'front' | 'perspective' | 'profile' | 'hero' | 'top';

export default function Mosaic3DViewer({
  mosaicResult,
  targetCanvas,
  tileData,
  onClose,
  onInspectTile,
}: Mosaic3DViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const builtRef = useRef<BuiltMosaic3D | null>(null);
  const depthMapRef = useRef<Float32Array | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // 3D Controls state
  const [depthConfig, setDepthConfig] = useState<DepthMapConfig>(DEFAULT_DEPTH_CONFIG);
  const [sideFinish, setSideFinish] = useState<SideFinish>('tile_color');
  const [autoRotate, setAutoRotate] = useState(false);
  const [isLoadingDepth, setIsLoadingDepth] = useState(true);
  const [activePreset, setActivePreset] = useState<CameraPreset>(() => {
    const p = new URLSearchParams(window.location.search).get('preset') as CameraPreset;
    return p && ['front', 'perspective', 'profile', 'hero', 'top'].includes(p) ? p : 'perspective';
  });
  const [hoveredTile, setHoveredTile] = useState<{ col: number; row: number } | null>(null);
  const [takingSnapshot, setTakingSnapshot] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(() => {
    return new URLSearchParams(window.location.search).get('settings3d') === '1';
  });

  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Compute depth map on mount or when mode changes (async for MediaPipe)
  const getOrComputeDepthMap = useCallback(async (mode: DepthMode): Promise<Float32Array> => {
    const depth = await computeTileDepthMap(targetCanvas, mosaicResult.gridCols, mosaicResult.gridRows, mode);
    depthMapRef.current = depth;
    return depth;
  }, [targetCanvas, mosaicResult.gridCols, mosaicResult.gridRows]);

  // Initialize Three.js Scene, Camera, Lighting, Pedestal, and OrbitControls
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let running = true;
    let cancelled = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let floorGeo: THREE.CylinderGeometry | null = null;
    let floorMat: THREE.MeshStandardMaterial | null = null;
    let handleResize: (() => void) | null = null;

    const setupSceneAndMesh = async () => {
      // 1. STEP 1: Compute depth map via MediaPipe FIRST before creating Three.js WebGLRenderer!
      // This guarantees MediaPipe gets exclusive WebGL access without any context contention.
      let depth: Float32Array;
      try {
        depth = await getOrComputeDepthMap(depthConfig.mode);
      } catch (err) {
        console.error('[Mosaic3DViewer] Depth map computation failed:', err);
        depth = new Float32Array(mosaicResult.gridCols * mosaicResult.gridRows).fill(0.02);
      }

      if (cancelled || !container) return;

      const width = container.clientWidth;
      const height = container.clientHeight;

      // 2. STEP 2: Initialize Three.js Scene, Camera, Lighting, Pedestal, and WebGLRenderer
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0a0c);
      scene.fog = new THREE.FogExp2(0x0a0a0c, 0.0016);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(42, width / height, 1, 3000);
      camera.position.set(0, -180, 260); // initial perspective angle
      cameraRef.current = camera;

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.minDistance = 60;
      controls.maxDistance = 1200;
      controls.target.set(0, 0, 15);
      controls.autoRotate = false;
      controls.autoRotateSpeed = 1.2;
      controlsRef.current = controls;

      // Studio Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
      scene.add(ambientLight);

      // Warm Key Light (top-left) casting dramatic shadows between elevated tiles
      const keyLight = new THREE.DirectionalLight(0xfff3e0, 2.4);
      keyLight.position.set(-150, 220, 280);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 2048;
      keyLight.shadow.mapSize.height = 2048;
      keyLight.shadow.camera.near = 50;
      keyLight.shadow.camera.far = 800;
      keyLight.shadow.camera.left = -180;
      keyLight.shadow.camera.right = 180;
      keyLight.shadow.camera.top = 220;
      keyLight.shadow.camera.bottom = -220;
      keyLight.shadow.bias = -0.0004;
      scene.add(keyLight);

      // Cool Rim / Fill Light (bottom-right)
      const fillLight = new THREE.DirectionalLight(0x90b4e0, 0.9);
      fillLight.position.set(160, -140, 120);
      scene.add(fillLight);

      // Subtle Under-Glow
      const bottomLight = new THREE.DirectionalLight(0xffeedd, 0.4);
      bottomLight.position.set(0, -200, -80);
      scene.add(bottomLight);

      // Architectural Gallery Plinth / Floor Pedestal
      const floorRadius = 240;
      floorGeo = new THREE.CylinderGeometry(floorRadius, floorRadius + 20, 12, 64);
      floorMat = new THREE.MeshStandardMaterial({
        color: 0x121214,
        roughness: 0.82,
        metalness: 0.1,
      });
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.rotation.x = Math.PI / 2;
      floorMesh.position.set(0, 0, -6.1);
      floorMesh.receiveShadow = true;
      scene.add(floorMesh);

      // 3. Build 3D mesh with verified depth map
      const built = buildMosaic3D(
        mosaicResult.canvas,
        mosaicResult.gridCols,
        mosaicResult.gridRows,
        depth,
        depthConfig,
        sideFinish
      );
      builtRef.current = built;
      scene.add(built.mesh);

      animateCameraTo(activePreset, camera, controls);
      setIsLoadingDepth(false);

      // Resize Handler
      handleResize = () => {
        if (!container || !renderer || !camera) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', handleResize);

      // Animation Loop
      const animate = () => {
        if (!running) return;
        controls?.update();
        if (renderer && scene && camera) {
          renderer.render(scene, camera);
        }
        animFrameRef.current = requestAnimationFrame(animate);
      };
      animate();
    };

    setupSceneAndMesh();

    return () => {
      running = false;
      cancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (handleResize) window.removeEventListener('resize', handleResize);
      if (controls) controls.dispose();
      if (builtRef.current) {
        builtRef.current.geometry.dispose();
        builtRef.current.frontMaterial.dispose();
        builtRef.current.sideMaterial.dispose();
        builtRef.current.texture.dispose();
      }
      if (floorGeo) floorGeo.dispose();
      if (floorMat) floorMat.dispose();
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentElement) {
          renderer.domElement.parentElement.removeChild(renderer.domElement);
        }
      }
    };
  }, [mosaicResult, targetCanvas]);

  // Update heights in real time when elevation scale, base thickness, or max height changes (60 FPS smooth!)
  useEffect(() => {
    if (!builtRef.current || !depthMapRef.current) return;
    updateMosaic3DHeights(
      builtRef.current.geometry,
      mosaicResult.gridCols,
      mosaicResult.gridRows,
      depthMapRef.current,
      depthConfig.elevationScale,
      depthConfig.baseHeight,
      depthConfig.maxHeight
    );
  }, [depthConfig.elevationScale, depthConfig.baseHeight, depthConfig.maxHeight, mosaicResult.gridCols, mosaicResult.gridRows]);

  // Update side material finish
  useEffect(() => {
    if (!builtRef.current) return;
    const opt = SIDE_FINISHES.find((s) => s.id === sideFinish) || SIDE_FINISHES[0];
    const isTileColor = sideFinish === 'tile_color';
    if (isTileColor) {
      builtRef.current.sideMaterial.vertexColors = true;
      builtRef.current.sideMaterial.color.setRGB(1, 1, 1);
      builtRef.current.sideMaterial.roughness = 0.38;
      builtRef.current.sideMaterial.metalness = 0.05;
    } else {
      builtRef.current.sideMaterial.vertexColors = false;
      builtRef.current.sideMaterial.color.setHex(opt.color ?? 0x141416);
      builtRef.current.sideMaterial.roughness = opt.roughness;
      builtRef.current.sideMaterial.metalness = opt.metalness;
    }
    builtRef.current.sideMaterial.needsUpdate = true;
  }, [sideFinish]);

  // Toggle auto turntable spin
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  // Smooth camera transition to preset
  const setCameraPreset = (preset: CameraPreset) => {
    setActivePreset(preset);
    if (cameraRef.current && controlsRef.current) {
      animateCameraTo(preset, cameraRef.current, controlsRef.current);
    }
  };

  // Click on tile in 3D space to inspect
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only inspect when directly clicking on the WebGL canvas, not on UI overlays or buttons
    if (e.target !== rendererRef.current?.domElement) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, select, textarea, .mosaic-3d__camera-toolbar, .mosaic-3d__header, .mosaic-3d__drawer, .mosaic-3d__gesture-guide')) {
      return;
    }

    if (!containerRefHasMouseMoved.current && onInspectTile && builtRef.current && cameraRef.current) {
      const rect = mountRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const clickVec = new THREE.Vector2(x, y);
      raycasterRef.current.setFromCamera(clickVec, cameraRef.current);
      const intersects = raycasterRef.current.intersectObject(builtRef.current.mesh);
      if (intersects.length > 0 && intersects[0].faceIndex != null) {
        const { tileIdx, row, col } = getTileFromFaceIndex(
          intersects[0].faceIndex,
          mosaicResult.gridCols * mosaicResult.gridRows,
          mosaicResult.gridCols
        );
        const mappedTileId = mosaicResult.tileMap[row]?.[col] ?? tileIdx;
        const matched = tileData[mappedTileId] || tileData[0];
        if (matched) {
          onInspectTile(matched, col, row);
        }
      }
    }
  };

  const containerRefHasMouseMoved = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.target !== rendererRef.current?.domElement) return;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    containerRefHasMouseMoved.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const dx = Math.abs(e.clientX - dragStartPos.current.x);
    const dy = Math.abs(e.clientY - dragStartPos.current.y);
    if (dx > 4 || dy > 4) {
      containerRefHasMouseMoved.current = true;
    }

    // Only raycast hover tooltip when pointer is directly over the 3D canvas
    if (e.target !== rendererRef.current?.domElement) {
      if (hoveredTile !== null) {
        setHoveredTile(null);
      }
      return;
    }

    // Hover raycasting
    if (builtRef.current && cameraRef.current && mountRef.current) {
      const rect = mountRef.current.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
      const intersects = raycasterRef.current.intersectObject(builtRef.current.mesh);
      if (intersects.length > 0 && intersects[0].faceIndex != null) {
        const { row, col } = getTileFromFaceIndex(
          intersects[0].faceIndex,
          mosaicResult.gridCols * mosaicResult.gridRows,
          mosaicResult.gridCols
        );
        setHoveredTile({ row, col });
      } else {
        setHoveredTile(null);
      }
    }
  };

  // High-Res 3D Snapshot download
  const handleTakeSnapshot = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    setTakingSnapshot(true);

    setTimeout(() => {
      try {
        rendererRef.current?.render(sceneRef.current!, cameraRef.current!);
        const dataUrl = rendererRef.current?.domElement.toDataURL('image/png');
        if (dataUrl) {
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = `mosaic-3d-sculpture-${activePreset}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } catch (err) {
        console.error('Failed to capture 3D snapshot:', err);
      } finally {
        setTakingSnapshot(false);
      }
    }, 100);
  };

  return (
    <div 
      className="mosaic-3d" 
      ref={mountRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoveredTile(null)}
      onClick={handleCanvasClick}
    >
      {/* 3D Neural Depth Map Loading Overlay */}
      {isLoadingDepth && (
        <div className="mosaic-3d__loading-overlay">
          <div className="mosaic-3d__spinner" />
          <span className="mosaic-3d__loading-title">GENERATING 3D TOPOGRAPHIC SCULPTURE</span>
          <span className="mosaic-3d__loading-hint">Computing organic bas-relief volume & depth map...</span>
        </div>
      )}

      {/* Top Header Bar */}
      <header 
        className="mosaic-3d__header"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button className="btn btn-ghost mosaic-3d__back-btn" onClick={onClose} title="Return to 2D Canvas">
          ← Return to 2D View
        </button>

        <div className="mosaic-3d__title-box">
          <span className="mosaic-3d__badge">360° 3D TOPOGRAPHIC SCULPTURE</span>
          <span className="mosaic-3d__subtitle">
            Face and subject tiles pop forward in physical 3D elevation
          </span>
        </div>

        <div className="mosaic-3d__header-actions">
          <button 
            className="btn btn-secondary mosaic-3d__snapshot-btn" 
            onClick={handleTakeSnapshot}
            disabled={takingSnapshot}
            title="Download current 3D perspective angle as PNG"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M2 11V13H14V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 2V10M5 7L8 10L11 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="8" cy="6" r="1.5" fill="currentColor"/>
            </svg>
            <span>{takingSnapshot ? 'Capturing...' : 'Capture 3D Angle'}</span>
          </button>

          <button 
            className={`btn-icon mosaic-3d__settings-toggle ${showSettingsDrawer ? 'mosaic-3d__settings-toggle--active' : ''}`}
            onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
            title="3D Depth & Elevation Settings"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M2 4.5H16M2 9H16M2 13.5H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="6" cy="4.5" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <circle cx="12" cy="9" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <circle cx="7" cy="13.5" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Floating 360° Camera Preset & Turntable Toolbar */}
      <div 
        className="mosaic-3d__camera-toolbar"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mosaic-3d__preset-group">
          <button
            className={`mosaic-3d__preset-btn ${activePreset === 'front' ? 'mosaic-3d__preset-btn--active' : ''}`}
            onClick={() => setCameraPreset('front')}
            title="Straight-on Front View"
          >
            🎯 Front
          </button>
          <button
            className={`mosaic-3d__preset-btn ${activePreset === 'perspective' ? 'mosaic-3d__preset-btn--active' : ''}`}
            onClick={() => setCameraPreset('perspective')}
            title="Isometric 45° Angle (Best Depth Overview)"
          >
            📐 45° Isometric
          </button>
          <button
            className={`mosaic-3d__preset-btn ${activePreset === 'profile' ? 'mosaic-3d__preset-btn--active' : ''}`}
            onClick={() => setCameraPreset('profile')}
            title="Side Profile View (Observe Face Height Profile)"
          >
            👤 Side Profile
          </button>
          <button
            className={`mosaic-3d__preset-btn ${activePreset === 'hero' ? 'mosaic-3d__preset-btn--active' : ''}`}
            onClick={() => setCameraPreset('hero')}
            title="Hero Low-Angle Dramatic View"
          >
            ⛰️ Hero Low
          </button>
          <button
            className={`mosaic-3d__preset-btn ${activePreset === 'top' ? 'mosaic-3d__preset-btn--active' : ''}`}
            onClick={() => setCameraPreset('top')}
            title="Top-Down Plan View"
          >
            🛰️ Top Down
          </button>
        </div>

        <div className="mosaic-3d__toolbar-divider" />

        {/* 360° Turntable Auto-Spin */}
        <button
          className={`mosaic-3d__turntable-btn ${autoRotate ? 'mosaic-3d__turntable-btn--active' : ''}`}
          onClick={() => setAutoRotate(!autoRotate)}
          title={autoRotate ? 'Pause 360° Turntable' : 'Play 360° Turntable Rotation'}
        >
          <span className="mosaic-3d__turntable-icon">{autoRotate ? '⏸' : '🔄'}</span>
          <span>{autoRotate ? 'Pause 360°' : '360° Turntable'}</span>
        </button>
      </div>

      {/* Floating Interactive 360 Gesture Guide */}
      <div 
        className="mosaic-3d__gesture-guide"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span>🖱️ Drag to rotate 360° · Scroll/pinch to zoom · Right-click to pan · Click any tile to inspect</span>
      </div>

      {/* Hovered Tile Tooltip */}
      {hoveredTile && (
        <div className="mosaic-3d__hover-badge">
          Tile [{hoveredTile.col + 1}, {hoveredTile.row + 1}] · Click to inspect
        </div>
      )}

      {/* 3D Depth & Elevation Settings Sidebar Drawer */}
      {showSettingsDrawer && (
        <aside 
          className="mosaic-3d__drawer"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mosaic-3d__drawer-header">
            <h3>3D POP-OUT & ELEVATION</h3>
            <button className="btn-icon" onClick={() => setShowSettingsDrawer(false)}>✕</button>
          </div>

          <div className="mosaic-3d__drawer-body">
            {/* Pop-Out Height Scale */}
            <div className="mosaic-3d__group">
              <div className="mosaic-3d__label-row">
                <span className="type-label">Pop-Out Elevation (Subject Height)</span>
                <span className="mosaic-3d__val">{Math.round(depthConfig.elevationScale * 100)}%</span>
              </div>
              <input
                type="range"
                min="20"
                max="250"
                value={Math.round(depthConfig.elevationScale * 100)}
                onChange={(e) => setDepthConfig((prev) => ({ ...prev, elevationScale: Number(e.target.value) / 100 }))}
                className="mosaic-viewer__slider"
              />
              <span className="mosaic-3d__hint">
                Controls the physical height protrusion of the subject above background tiles
              </span>
            </div>

            {/* Depth Map Mode */}
            <div className="mosaic-3d__group">
              <span className="type-label">Depth Relief Mode</span>
              <div className="mosaic-3d__mode-grid">
                {[
                  { id: 'dome', name: 'Sculptural Dome', icon: '🪙', desc: 'Pure organic bas-relief dome volume — smooth, coherent, user favorite' },
                  { id: 'face', name: 'Cameo Medallion', icon: '👤', desc: 'Smooth face & torso anatomical hierarchy without harsh step cuts' },
                  { id: 'luminance', name: 'Tactile Relief', icon: '✨', desc: 'Organic dome volume with subtle low-frequency facial contours' },
                  { id: 'stepped', name: 'Architectural', icon: '🧱', desc: 'Multi-tiered beveled sculptural terraces' },
                ].map((m) => (
                  <button
                    key={m.id}
                    className={`mosaic-3d__mode-btn ${depthConfig.mode === m.id ? 'mosaic-3d__mode-btn--active' : ''}`}
                    onClick={async () => {
                      const newMode = m.id as DepthMode;
                      setDepthConfig((prev) => ({ ...prev, mode: newMode }));
                      // Instant synchronous depth calculation from cached segmentation data (< 0.5ms!)
                      const syncDepth = computeTileDepthMapSync(
                        targetCanvas,
                        mosaicResult.gridCols,
                        mosaicResult.gridRows,
                        newMode
                      );
                      const depth = syncDepth || await getOrComputeDepthMap(newMode);
                      depthMapRef.current = depth;
                      if (builtRef.current) {
                        updateMosaic3DHeights(
                          builtRef.current.geometry,
                          mosaicResult.gridCols,
                          mosaicResult.gridRows,
                          depth,
                          depthConfig.elevationScale,
                          depthConfig.baseHeight,
                          depthConfig.maxHeight
                        );
                      }
                    }}
                    title={m.desc}
                  >
                    <span className="mosaic-3d__mode-icon">{m.icon}</span>
                    <span className="mosaic-3d__mode-name">{m.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Side Finish (Extruded Wall Color) */}
            <div className="mosaic-3d__group">
              <span className="type-label">Extruded Side Wall Finish</span>
              <div className="mosaic-3d__finish-grid">
                {SIDE_FINISHES.map((f) => (
                  <button
                    key={f.id}
                    className={`mosaic-3d__finish-btn ${sideFinish === f.id ? 'mosaic-3d__finish-btn--active' : ''}`}
                    onClick={() => setSideFinish(f.id)}
                  >
                    <span 
                      className="mosaic-3d__finish-swatch" 
                      style={{ background: f.previewColor }} 
                    />
                    <span className="mosaic-3d__finish-name">{f.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Base Elevation */}
            <div className="mosaic-3d__group">
              <div className="mosaic-3d__label-row">
                <span className="type-label">Base Foundation Thickness</span>
                <span className="mosaic-3d__val">{depthConfig.baseHeight.toFixed(1)}u</span>
              </div>
              <input
                type="range"
                min="5"
                max="80"
                value={Math.round(depthConfig.baseHeight * 10)}
                onChange={(e) => setDepthConfig((prev) => ({ ...prev, baseHeight: Number(e.target.value) / 10 }))}
                className="mosaic-viewer__slider"
              />
            </div>

            {/* Reset View */}
            <div className="mosaic-3d__drawer-actions">
              <button 
                className="btn btn-secondary mosaic-3d__reset-btn"
                onClick={() => setCameraPreset('perspective')}
              >
                Reset Camera
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

/**
 * Camera positioning helper for smooth preset transitions
 */
function animateCameraTo(preset: CameraPreset, camera: THREE.PerspectiveCamera, controls: OrbitControls) {
  controls.target.set(0, 0, 15);

  switch (preset) {
    case 'front':
      camera.position.set(0, 0, 320);
      break;
    case 'perspective':
      camera.position.set(0, -180, 260);
      break;
    case 'profile':
      // 90 degree side profile to clearly see height step differences
      camera.position.set(310, 0, 45);
      break;
    case 'hero':
      // Dramatic low angle looking upwards
      camera.position.set(0, -280, 80);
      break;
    case 'top':
      // Top down plan view
      camera.position.set(0, 20, 350);
      break;
  }

  camera.lookAt(controls.target);
  controls.update();
}
