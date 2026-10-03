# Everyone Is Part of You

[![Live Demo](https://img.shields.io/badge/Live%20Demo-everyone.heyakshay.in-black?style=for-the-badge&logo=google-chrome&logoColor=white)](https://everyone.heyakshay.in)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-0.169-black?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)

> **"A face is never just a face. It is an accumulation of every person who ever loved you, every conversation that shaped you, every moment you gave away."**

**Everyone Is Part of You** is a high-performance web experience that transforms a personal portrait into a fine-art photographic mosaic composed of thousands of micro-photos. Beyond classic 2D mosaics, it features an interactive **360° 3D Bas-Relief Topographic Sculpture Studio** powered by Three.js and on-device neural segmentation (MediaPipe WASM).

---

## ✨ Key Features

### 🎨 1. Perceptual CIE Lab Color Matching
- **Color Science**: Converts colors into linearized **CIE L\*a\*b\*** color space under standard D65 illuminant to match human optical perception.
- **Micro-Photo Allocation**: Distributes source photos across the target portrait grid using localized brightness/contrast adjustments and anti-repetition sliding windows to avoid checkerboard artifacts.

### 🏛️ 2. 360° Topographic Bas-Relief Studio
- **Neural Depth Segmentation**: Runs Google MediaPipe Selfie Segmentation via WebGL 2.0 WASM to isolate the subject from the background.
- **4 Elevation Sculptural Modes**:
  - 🌕 **Sculptural Dome** *(Default)*: Smooth organic bas-relief dome sculpted over the subject's anatomy.
  - 🧱 **Architectural**: Stepped geometric tiers calculated via Euclidean distance transforms, creating an architectural relief.
  - 👤 **Cameo Medallion**: Italian Renaissance cameo relief emphasizing facial structure and gentle shoulder taper.
  - ✨ **Tactile Relief**: Subtle surface micro-texture modulated by low-frequency tonal variation.
- **60 FPS Real-time Adjustments**: Height and foundation thickness sliders update Float32 GPU position buffers in real time without geometry re-allocations.
- **Tile Color Side Walls**: Extruded side walls preserve each tile's respective photographic color (`Tile Color (Match Photo)`), or switch to luxury gallery finishes (Obsidian Slate, Studio Graphite, Champagne Brass, Architectural Walnut, Gallery Plaster).
- **Studio Lighting**: Triple-point studio lighting with key light casting soft shadows, cool rim/fill light, and an architectural pedestal plinth.
- **Camera Angles**: Instant cinematic presets (Front, 45° Isometric, Side Profile, Hero Low, Top Down, and 360° Turntable orbit).

### 🔍 3. Macro Tile Inspector & Multi-Scale Exploration
- **14x Needle-Sharp Zoom**: Smooth pinch-to-zoom and mouse wheel navigation centered on cursor position.
- **Single Photo Inspector**: Click any tile to inspect the individual photographic moment with row/column coordinates.
- **Self-Crop Engine**: When a single portrait is uploaded without extra photos, the engine extracts 200+ multi-scale crops (full, chest, facial close-ups, eyes, hair) from that same image.

### 🖨️ 4. Master Resolution Export & Wall Printing
- **Master High-Res PNG**: Renders 3000px+ high-resolution PNG with custom signature watermark.
- **Whole-Image Macro PNG**: Full-canvas export rendering every single row and column at needle-sharp macro scale.
- **Wall Print Multi-Page PDF**: Exports tiled, numbered PDF sheets with assembly cut marks, 1cm overlap margins, and an architectural hanging grid map.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, HTML5 Canvas 2D API
- **3D Graphics**: Three.js, OrbitControls, WebGL 2.0, ACESFilmic Tone Mapping
- **Machine Learning**: MediaPipe Selfie Segmentation (simd/wasm WebGL runtime)
- **PDF & Export**: jsPDF, Canvas Blob, Web Share API
- **Tooling & Build**: Vite 6, Playwright (Automated Browser Testing)
- **Deployment**: GitHub Pages via GitHub Actions CI/CD (`everyone.heyakshay.in`)

---

## 🚀 Getting Started

### Prerequisites
- Node.js (version 20 or higher recommended)
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/heyakshay/everyone.git
cd everyone

# Install dependencies
npm install
```

### Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Production Build

```bash
npm run build
```

This compiles TypeScript, generates the optimized production bundle in `dist/`, and prepares `404.html` for GitHub Pages single-page app routing.

---

## 🧪 Automated Testing & Verification

The project includes automated Playwright verification scripts that run in a headless browser to test WebGL context isolation, MediaPipe neural segmentation, and 3D elevation rendering:

```bash
# Run 3D bas-relief verification on Sophia (demo 1)
node scripts/test_view_3d.mjs

# Run 3D bas-relief verification on Marcus (demo 2)
node scripts/test_marcus_3d.mjs

# Test MediaPipe WASM segmentation directly
node scripts/test_seg_full.mjs
```

Screenshots are saved to `/tmp/` for visual verification.

---

## 🤖 AI Agents & Contributors

If you are an AI assistant (Antigravity, Claude, Copilot, Cursor) working on this repository, **you must read [AGENTS.md](./AGENTS.md)** before modifying any WebGL, WASM, depth, or color engine files. It contains strict rules regarding:
- WebGL context isolation & MediaPipe inference mutex.
- Patched Emscripten WASM runtime files.
- Topographic bas-relief elevation invariants (flat background foundation, anatomical fallback).
- 60 FPS slider buffer mutation protocols.

---

## 📄 License

MIT © [Akshay Saini](https://heyakshay.in)