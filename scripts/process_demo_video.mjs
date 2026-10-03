import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const recordingsDir = path.resolve(__dirname, '../recordings');
const outputMp4 = path.resolve(__dirname, '../demo_showcase.mp4');
const artifactDir = '/Users/akshay/.gemini/antigravity/brain/7513e354-f17e-4f5a-b64a-f8fd63e54b95';
const artifactMp4 = path.join(artifactDir, 'demo_showcase.mp4');

// Find latest .webm file in recordings directory
const webmFiles = fs.readdirSync(recordingsDir)
  .filter(f => f.endsWith('.webm'))
  .map(f => ({
    name: f,
    path: path.join(recordingsDir, f),
    time: fs.statSync(path.join(recordingsDir, f)).mtimeMs
  }))
  .sort((a, b) => b.time - a.time);

if (webmFiles.length === 0) {
  console.error('❌ No recorded .webm video found in recordings directory!');
  process.exit(1);
}

const inputWebm = webmFiles[0].path;
console.log(`🎬 Processing input video: ${inputWebm}`);

const ffmpegPath = '/opt/homebrew/bin/ffmpeg';

// Transcode to high-quality universal MP4 (H.264, yuv420p, 60fps smoothing, faststart)
const ffmpegCmd = `"${ffmpegPath}" -y -i "${inputWebm}" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart "${outputMp4}"`;

console.log('⚙️ Running FFmpeg encoding...');
execSync(ffmpegCmd, { stdio: 'inherit' });

if (fs.existsSync(outputMp4)) {
  const stats = fs.statSync(outputMp4);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`✨ Generated Master MP4: ${outputMp4} (${sizeMb} MB)`);

  // Copy to conversation artifact directory
  if (fs.existsSync(artifactDir)) {
    fs.copyFileSync(outputMp4, artifactMp4);
    console.log(`📦 Copied video to artifacts directory: ${artifactMp4}`);
  }
} else {
  console.error('❌ Failed to create output MP4 file.');
  process.exit(1);
}
