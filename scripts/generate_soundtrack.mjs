import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const recordingsDir = path.resolve(__dirname, '../recordings');

if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

export function generateCinematicSoundtrack(durationSec = 18.5, sampleRate = 44100) {
  const numSamples = Math.floor(durationSec * sampleRate);
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  // 4 Emotional Chords matching the 4 story acts:
  // 1. Act I (0 - 4.5s): Mystery / Drifting (Am9)
  // 2. Act II (4.5 - 9.0s): Wonder / Synthesis (Fmaj9)
  // 3. Act III (9.0 - 13.5s): Discovery / Macro Zoom (Dm9 -> Cmaj7)
  // 4. Act IV (13.5 - 18.5s): Majestic 3D Sculpture & Outro (E7sus4 -> Am)
  const chordTimeline = [
    {
      start: 0.0,
      dur: 4.8,
      bass: 55.0, // A1
      notes: [110, 164.81, 220, 261.63, 329.63, 493.88], // A2, E3, A3, C4, E4, B4
      arp: [220, 261.63, 329.63, 493.88, 329.63, 261.63]
    },
    {
      start: 4.5,
      dur: 4.8,
      bass: 43.65, // F1
      notes: [87.31, 130.81, 174.61, 220, 261.63, 329.63], // F2, C3, F3, A3, C4, E4
      arp: [174.61, 220, 261.63, 329.63, 261.63, 220]
    },
    {
      start: 9.0,
      dur: 4.8,
      bass: 73.42, // D2
      notes: [146.83, 174.61, 220, 261.63, 349.23, 440.0], // D3, F3, A3, C4, F4, A4
      arp: [220, 261.63, 349.23, 440.0, 349.23, 261.63]
    },
    {
      start: 13.5,
      dur: 5.0,
      bass: 55.0, // A1
      notes: [110, 164.81, 196.0, 246.94, 329.63, 440.0], // A2, E3, G3, B3, E4, A4
      arp: [329.63, 246.94, 196.0, 164.81, 110]
    }
  ];

  // Synthesize Lush Strings & Ambient Pad
  for (const seg of chordTimeline) {
    const startIdx = Math.floor(seg.start * sampleRate);
    const endIdx = Math.min(numSamples, Math.floor((seg.start + seg.dur + 2.5) * sampleRate));

    // Pad notes
    seg.notes.forEach((freq, nIdx) => {
      const pan = 0.25 + (nIdx / seg.notes.length) * 0.5;

      for (let i = startIdx; i < endIdx; i++) {
        const t = (i - startIdx) / sampleRate;
        const attack = Math.min(1, t / 0.8);
        const decay = Math.exp(-t / 4.5);
        const env = attack * decay;

        // Rich detuned dual oscillators (analog synth warmth)
        const osc1 = Math.sin(2 * Math.PI * freq * t);
        const osc2 = Math.sin(2 * Math.PI * (freq * 1.003) * t + 0.5);
        const sub = Math.sin(2 * Math.PI * (freq * 0.5) * t) * 0.25;

        const val = (osc1 * 0.5 + osc2 * 0.4 + sub) * env * 0.08;
        left[i] += val * (1 - pan);
        right[i] += val * pan;
      }
    });

    // Deep Cinematic Sub Bass
    for (let i = startIdx; i < endIdx; i++) {
      const t = (i - startIdx) / sampleRate;
      const attack = Math.min(1, t / 0.4);
      const decay = Math.exp(-t / 3.8);
      const bassVal = Math.sin(2 * Math.PI * seg.bass * t) * attack * decay * 0.22;
      left[i] += bassVal * 0.5;
      right[i] += bassVal * 0.5;
    }

    // Gentle Acoustic Piano Arpeggio Notes
    seg.arp.forEach((freq, aIdx) => {
      const noteTime = seg.start + 0.4 + aIdx * 0.65;
      const nStart = Math.floor(noteTime * sampleRate);
      const nEnd = Math.min(numSamples, nStart + Math.floor(2.8 * sampleRate));
      const notePan = 0.35 + (aIdx % 2) * 0.3;

      for (let i = nStart; i < nEnd; i++) {
        const t = (i - nStart) / sampleRate;
        // Percussive piano hammer attack & warm natural decay
        const pAttack = Math.min(1, t / 0.008);
        const pDecay = Math.exp(-t * 2.8) * 0.75 + Math.exp(-t * 0.9) * 0.25;
        const pEnv = pAttack * pDecay;

        // Multi-harmonic piano string spectrum
        const pWave = Math.sin(2 * Math.PI * freq * t) * 0.6 +
                      Math.sin(2 * Math.PI * freq * 2 * t) * 0.25 +
                      Math.sin(2 * Math.PI * freq * 3 * t) * 0.1 +
                      Math.sin(2 * Math.PI * freq * 4 * t) * 0.05;

        const pVal = pWave * pEnv * 0.16;
        left[i] += pVal * (1 - notePan);
        right[i] += pVal * notePan;
      }
    });
  }

  // Shimmering Stereo Reverb & Space Delay
  const delay1 = Math.floor(0.24 * sampleRate);
  const delay2 = Math.floor(0.38 * sampleRate);
  for (let i = delay2; i < numSamples; i++) {
    left[i] += right[i - delay1] * 0.28 + left[i - delay2] * 0.15;
    right[i] += left[i - delay1] * 0.28 + right[i - delay2] * 0.15;
  }

  // Analog Soft Saturation and Master Fade Out
  const fadeStart = Math.floor((durationSec - 2.2) * sampleRate);
  for (let i = 0; i < numSamples; i++) {
    // Smooth master fade
    let masterVol = 1.0;
    if (i < Math.floor(0.5 * sampleRate)) {
      masterVol = i / Math.floor(0.5 * sampleRate); // fade in
    } else if (i >= fadeStart) {
      masterVol = Math.max(0, 1 - (i - fadeStart) / (numSamples - fadeStart)); // fade out
    }

    // Soft analog tape compression
    left[i] = Math.tanh(left[i] * 1.3) * masterVol;
    right[i] = Math.tanh(right[i] * 1.3) * masterVol;
  }

  // Encode to 16-bit PCM WAV
  const wavBuffer = Buffer.alloc(44 + numSamples * 4);
  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + numSamples * 4, 4);
  wavBuffer.write('WAVE', 8);
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20); // PCM
  wavBuffer.writeUInt16LE(2, 22); // Stereo
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(sampleRate * 4, 28);
  wavBuffer.writeUInt16LE(4, 32);
  wavBuffer.writeUInt16LE(16, 34);
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(numSamples * 4, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    wavBuffer.writeInt16LE(Math.floor(l * 32767), offset);
    wavBuffer.writeInt16LE(Math.floor(r * 32767), offset + 2);
    offset += 4;
  }

  const outputPath = path.join(recordingsDir, 'cinematic_story_music.wav');
  fs.writeFileSync(outputPath, wavBuffer);
  console.log(`🎵 Generated rich cinematic soundtrack: ${outputPath} (${durationSec}s)`);
  return outputPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateCinematicSoundtrack(18.5);
}
