import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { generateCinematicSoundtrack } from './generate_soundtrack.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const recordingsDir = path.resolve(__dirname, '../recordings');
const outputMp4 = path.resolve(__dirname, '../demo_story_18s.mp4');
const artifactDir = '/Users/akshay/.gemini/antigravity/brain/7513e354-f17e-4f5a-b64a-f8fd63e54b95';
const artifactMp4 = path.join(artifactDir, 'demo_story_18s.mp4');

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

// Get video duration via ffprobe
const ffmpegPath = '/opt/homebrew/bin/ffmpeg';
const ffprobePath = '/opt/homebrew/bin/ffprobe';

let videoDuration = 18.0;
try {
  const probeOutput = execSync(`"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputWebm}"`).toString().trim();
  videoDuration = parseFloat(probeOutput) || 18.0;
  console.log(`⏱️ Recorded video duration: ${videoDuration.toFixed(2)}s`);
} catch (err) {
  console.warn('Could not probe video duration, defaulting to 18.0s');
}

// Generate soundtrack matched to video duration
console.log(`🎵 Generating soundtrack matched to ${videoDuration.toFixed(1)}s...`);
const audioPath = generateCinematicSoundtrack(videoDuration);

// Combine video + audio with smooth audio fade out
const fadeStart = Math.max(0, videoDuration - 1.8).toFixed(2);
const ffmpegCmd = `"${ffmpegPath}" -y -i "${inputWebm}" -i "${audioPath}" \
  -filter_complex "[1:a]afade=t=in:ss=0:d=0.5,afade=t=out:st=${fadeStart}:d=1.8[a]" \
  -map 0:v -map "[a]" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k \
  -shortest -movflags +faststart "${outputMp4}"`;

console.log('⚙️ Merging video with audio track...');
execSync(ffmpegCmd, { stdio: 'inherit' });

if (fs.existsSync(outputMp4)) {
  const stats = fs.statSync(outputMp4);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`✨ Generated Master Story Video: ${outputMp4} (${sizeMb} MB)`);

  if (fs.existsSync(artifactDir)) {
    fs.copyFileSync(outputMp4, artifactMp4);
    console.log(`📦 Copied to conversation artifacts: ${artifactMp4}`);
  }
} else {
  console.error('❌ Failed to create output MP4 file.');
  process.exit(1);
}
