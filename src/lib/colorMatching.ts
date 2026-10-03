// Types
export interface RGBColor { r: number; g: number; b: number; }
export interface LabColor { L: number; a: number; b: number; }

// Helper: Convert sRGB value (0-255) to linear RGB (0-1)
function sRGBtoLinear(c: number): number {
  const v = c / 255.0;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

// Convert sRGB (0-255) to Lab
export function rgbToLab(rgb: RGBColor): LabColor {
  let r = sRGBtoLinear(rgb.r);
  let g = sRGBtoLinear(rgb.g);
  let b = sRGBtoLinear(rgb.b);

  // Convert linear sRGB to XYZ
  let x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  let y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) / 1.00000;
  let z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;

  // Convert XYZ to Lab
  const f = (t: number) => (t > 0.008856451679035631 ? Math.pow(t, 1 / 3) : 7.787037037037037 * t + 16 / 116);
  x = f(x);
  y = f(y);
  z = f(z);

  return {
    L: Math.max(0, 116 * y - 16),
    a: 500 * (x - y),
    b: 200 * (y - z)
  };
}

// CIEDE76 perceptual distance
export function colorDistance(lab1: LabColor, lab2: LabColor): number {
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

// Get average color of pixel data (Uint8ClampedArray from canvas getImageData)
export function getAverageColor(imageData: Uint8ClampedArray, width: number, height: number): RGBColor {
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < imageData.length; i += 4) {
    // skip fully transparent pixels
    if (imageData[i + 3] === 0) continue;
    r += imageData[i];
    g += imageData[i + 1];
    b += imageData[i + 2];
    count++;
  }
  if (count === 0) return { r: 0, g: 0, b: 0 };
  return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
}

// Get average color of a sub-region of image data
export function getRegionAverageColor(
  imageData: Uint8ClampedArray,
  imgWidth: number,
  x: number, y: number, 
  regionWidth: number, regionHeight: number
): RGBColor {
  let r = 0, g = 0, b = 0, count = 0;
  
  for (let row = 0; row < regionHeight; row++) {
    for (let col = 0; col < regionWidth; col++) {
      const px = x + col;
      const py = y + row;
      const idx = (py * imgWidth + px) * 4;
      
      // Prevent out of bounds
      if (idx >= imageData.length || imageData[idx + 3] === 0) continue;
      
      r += imageData[idx];
      g += imageData[idx + 1];
      b += imageData[idx + 2];
      count++;
    }
  }
  
  if (count === 0) return { r: 0, g: 0, b: 0 };
  return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
}

// Get average color and variance of a sub-region (used to detect facial contrast & feature edges)
export function getRegionStats(
  imageData: Uint8ClampedArray,
  imgWidth: number,
  x: number, y: number, 
  regionWidth: number, regionHeight: number
): { avgColor: RGBColor; variance: number } {
  let r = 0, g = 0, b = 0, count = 0;
  
  for (let row = 0; row < regionHeight; row++) {
    for (let col = 0; col < regionWidth; col++) {
      const px = x + col;
      const py = y + row;
      const idx = (py * imgWidth + px) * 4;
      if (idx >= imageData.length || imageData[idx + 3] === 0) continue;
      
      r += imageData[idx];
      g += imageData[idx + 1];
      b += imageData[idx + 2];
      count++;
    }
  }
  
  if (count === 0) return { avgColor: { r: 0, g: 0, b: 0 }, variance: 0 };
  
  const avgR = r / count;
  const avgG = g / count;
  const avgB = b / count;
  const avgLum = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;

  let varSum = 0;
  for (let row = 0; row < regionHeight; row++) {
    for (let col = 0; col < regionWidth; col++) {
      const px = x + col;
      const py = y + row;
      const idx = (py * imgWidth + px) * 4;
      if (idx >= imageData.length || imageData[idx + 3] === 0) continue;
      
      const lum = 0.299 * imageData[idx] + 0.587 * imageData[idx + 1] + 0.114 * imageData[idx + 2];
      const diff = lum - avgLum;
      varSum += diff * diff;
    }
  }

  return {
    avgColor: { r: Math.round(avgR), g: Math.round(avgG), b: Math.round(avgB) },
    variance: Math.sqrt(varSum / count),
  };
}
