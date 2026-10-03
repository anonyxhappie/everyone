# AGENTS.md — System Invariants & AI Developer Guide

> **MANDATORY NOTICE FOR ALL AI AGENTS & CODING ASSISTANTS**  
> This file contains non-negotiable architectural rules, WebGL/WASM safety protocols, and domain logic for **"Everyone Is Part of You"**.  
> **DO NOT** modify, refactor, or delete the safeguards documented here without adhering strictly to the invariants below.

---

## 1. Core Architecture Overview

"Everyone Is Part of You" is a high-performance web experience that transforms a personal portrait into a mosaic constructed from thousands of micro-photos, rendered both as an interactive 2D canvas and an architectural **360° 3D Bas-Relief Topographic Sculpture** running on Three.js and MediaPipe WASM.

```
                           ┌───────────────────────────┐
                           │      User Portrait        │
                           └─────────────┬─────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
   ┌───────────────────────────┐                   ┌───────────────────────────┐
   │    2D Mosaic Engine       │                   │    3D Bas-Relief Studio   │
   │  - CIE Lab Color Matching │                   │  - MediaPipe ML WASM      │
   │  - Perceptual ΔE Distance │                   │  - Sequential WebGL Init  │
   │  - Multi-scale Crops      │                   │  - Distance Transform DT  │
   │  - Canvas 2D Viewport     │                   │  - 4 Elevation Modes      │
   │  - Master PNG/PDF Export  │                   │  - 60 FPS Buffer Updates  │
   └───────────────────────────┘                   └───────────────────────────┘
```

---

## 2. STRICT INVARIANTS — DO NOT BREAK

### Rule 1: MediaPipe WASM & WebGL Concurrency Mutex
* **Problem**: MediaPipe's Selfie Segmentation WASM engine (`public/mediapipe/selfie_segmentation_solution_simd_wasm_bin.js`) operates on a single-threaded WebGL 2.0 state machine. When `THREE.WebGLRenderer` initializes and starts its 60 FPS animation loop concurrently with MediaPipe inference, WebGL texture binding collisions occur:
  `WebGL: INVALID_OPERATION: bindTexture: object does not belong to this context`
  This causes MediaPipe to hang, time out, and crash.
* **INVARIANT**:
  1. `src/lib/depthMap.ts` implements an **`inferenceMutex`** and **`inFlightSegmentation`** promise deduplication. **NEVER REMOVE** this mutex or promise deduplication.
  2. In `src/components/Mosaic3DViewer.tsx`, depth calculation MUST execute sequentially **before** instantiating `THREE.WebGLRenderer` and starting the animation loop.
  3. Once computed, segmentation data is cached in memory per portrait canvas. Mode switching and height adjustments MUST use cached data synchronously (`computeTileDepthMapSync`) and must **NEVER** re-invoke MediaPipe inference.

### Rule 2: Patched Emscripten WASM Runtime Files
* **Location**: `public/mediapipe/selfie_segmentation_solution_simd_wasm_bin.js` and `public/mediapipe/selfie_segmentation_solution_wasm_bin.js`
* **Problem**: Modern browsers and bundlers crash on unexported Emscripten getters with `RuntimeError: Aborted(Module.arguments has been replaced with plain arguments_)` and `'wasmMemory' was not exported`.
* **INVARIANT**:
  - In `legacyModuleProp` and `unexportedRuntimeSymbol`, handlers are safely patched to no-op.
  - **DO NOT** replace or overwrite the files in `public/mediapipe/` with stock CDN versions without applying these patches.

### Rule 3: 3D Topographic Elevation & Background Flatness
* **INVARIANT**:
  1. **Background Flatness**: Background tiles MUST ALWAYS remain flat foundation (`Z = 0.02` normalized, or `depthConfig.baseHeight`). Background tiles must **NEVER** be extruded or stepped.
  2. **Anatomical Fallback**: If MediaPipe ever fails or is offline, `runFallbackSegmentation` in `src/lib/depthMap.ts` enforces a centered anatomical bust silhouette (head, neck, shoulders). **NEVER** use raw background luminance thresholds (`diff > 14`), as they falsely detect light studio walls and create concentric background contour rings.
  3. **Supported Elevation Modes**:
     - `dome` (**Sculptural Dome** — DEFAULT): Smooth spherical bas-relief dome anchored to subject centroid.
     - `stepped` (**Architectural**): Stepped planar tiers derived from Euclidean distance transform.
     - `face` (**Cameo Medallion**): Classic Italian cameo relief emphasizing facial features with subtle torso taper.
     - `luminance` (**Tactile Relief**): Soft tone modulation mapped strictly over the subject silhouette.

### Rule 4: Real-Time 60 FPS Slider Updates
* **INVARIANT**:
  - Elevation scale and foundation thickness adjustments must **NEVER** rebuild Three.js geometry, re-allocate meshes, or re-run segmentation.
  - The height slider in `Mosaic3DViewer.tsx` calls `updateElevationHeights()`, directly mutating the `geometry.attributes.position.array` Float32 buffer in-place (`positionAttribute.needsUpdate = true`). This ensures buttery smooth 60 FPS performance without memory leaks.

### Rule 5: Extruded Tile Side Finish
* **INVARIANT**:
  - The default side finish for extruded 3D tiles is `'photo'` (`Tile Color (Match Photo)`).
  - Side walls of extruded tiles must reflect each tile's respective photographic color, never arbitrary black or inverted colors.

### Rule 6: Dual-Photo vs Single-Photo Mosaic Logic
* **INVARIANT**:
  1. If the user provides a portrait **AND** an album of secondary photos, the mosaic tiles must come **STRICTLY** from the uploaded album photos.
  2. If the user provides **ONLY** a portrait without extra photos, the application generates 200+ multi-scale crops strictly from that same photo (`generateSelfCrops` in `src/lib/imageProcessing.ts`).
  3. Never inject placeholder solid colors or synthetic tiles when photos are available.

### Rule 7: Perceptual Color Matching in CIE Lab
* **Location**: `src/lib/colorMatching.ts`
* **INVARIANT**:
  - Color distance between mosaic cells and source tiles must always be evaluated in **CIE L\*a\*b\*** color space using the D65 standard illuminant and sRGB linearization.
  - Never evaluate color distance using Euclidean RGB (`ΔR² + ΔG² + ΔB²`), which produces muddy, perceptually distorted mosaics.

---

## 3. Directory & File Reference

```
everyone/
├── public/
│   ├── mediapipe/            # Patched MediaPipe Selfie Segmentation WASM runtime
│   ├── portraits/            # Demo portraits (Sophia & Marcus)
│   ├── tiles/                # Pre-cached photographic sample tiles
│   └── CNAME                 # Custom domain configuration (everyone.heyakshay.in)
├── src/
│   ├── components/
│   │   ├── IntroScreen.tsx    # Landing & demo gallery
│   │   ├── ImageUploader.tsx  # Upload flow (single photo or portrait + tiles)
│   │   ├── MosaicViewer.tsx   # 2D high-DPI mosaic viewer, zoom/pan, export controls
│   │   ├── Mosaic3DViewer.tsx # 360° Three.js topographic bas-relief studio
│   │   └── WallPrintModal.tsx # Multi-tile PDF wall print generator
│   ├── lib/
│   │   ├── colorMatching.ts   # CIE Lab perceptual color converter & distance engine
│   │   ├── depthMap.ts        # MediaPipe ML segmentation, distance transform, depth modes
│   │   ├── threeMosaicBuilder.ts # Three.js instanced & segmented 3D mesh generator
│   │   ├── mosaicGenerator.ts # Core 2D grid synthesis & tile assignment
│   │   ├── imageProcessing.ts # Multi-scale self-crops, canvas filters & adjustments
│   │   ├── exportImage.ts     # High-res PNG & macro-detail exporter
│   │   ├── pdfExport.ts       # Print-ready multi-page PDF generation
│   │   └── storage.ts         # IndexedDB session persistence & URL state syncing
│   ├── App.tsx                # Stage router & session restoration
│   └── main.tsx               # React root entrypoint
├── scripts/
│   ├── test_view_3d.mjs       # Headless Playwright verification for 3D viewer & modes
│   ├── test_marcus_3d.mjs     # Multi-subject 3D verification script
│   └── test_seg_full.mjs      # MediaPipe WASM segmentation unit test
└── .github/workflows/
    └── deploy.yml             # GitHub Actions CI/CD to GitHub Pages
```

---

## 4. Verification & Testing Protocol

Before submitting or committing ANY changes to 3D elevation, shaders, segmentation, or UI controls, you **MUST** run the headless browser test suite:

```bash
# 1. Type check and production build
npm run build

# 2. Verify 3D bas-relief modes on Sophia (demo=1)
node scripts/test_view_3d.mjs

# 3. Verify 3D bas-relief modes on Marcus (demo=2)
node scripts/test_marcus_3d.mjs
```

### Verification Checklist:
- [ ] Console output has **zero** WebGL context collisions (`bindTexture: object does not belong to this context`).
- [ ] MediaPipe logs `Successfully created a WebGL context with major version 3`.
- [ ] Background tiles remain 100% flat (`Z = 0.02`).
- [ ] Subject body, face, and shoulders pop forward organically.
- [ ] Mode switching between `dome`, `stepped`, `face`, and `luminance` takes < 1ms.
- [ ] Elevation slider moves at 60 FPS without frame drops or re-allocations.
