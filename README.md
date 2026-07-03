# PulseAnalyzer

A browser-based pulse detection workstation that extracts, filters, and analyzes heartbeat signals from audio or video recordings — entirely client-side with no data ever leaving your device.

---

## Features

- 📂 **Drag & drop** MP4, WAV, MP3, M4A, or any audio/video file
- 🎛️ **Parametric DSP chain** — highpass, lowpass, notch, noise gate, AGC
- 💓 **Dual detection modes** — peak amplitude or frequency resonator
- 📈 **Live BPM trend chart** with clickable seek
- 🎚️ **Waveform visualizer** with minimap, zoom, and peak markers
- 🔊 **Audio playback** with gain boost up to 20×, speed control, and visible-range looping
- 💾 **Session persistence** via IndexedDB (save / load / delete analyses)
- 📤 **Export** — cleaned WAV, peaks CSV, waveform CSV
- ⚡ **Preset profiles** — save and recall your favorite parameter sets

---

## Technical Overview

### 1. Audio Extraction

When a file is dropped, the browser's native **Web Audio API** (`AudioContext.decodeAudioData`) decodes the container and codec (AAC in MP4, MP3, PCM WAV, etc.). Multi-channel audio is down-mixed to **mono** by averaging all channels.

See [`src/utils/audioExtractor.ts`](src/utils/audioExtractor.ts).

### 2. Signal Filtering (DSP Chain)

The raw mono `Float32Array` is passed through a pure-TypeScript DSP pipeline implemented in [`src/dsp/dspWrapper.ts`](src/dsp/dspWrapper.ts):

| Stage | Method | Purpose |
|---|---|---|
| **Highpass filter** | Biquad Direct Form I (Butterworth Q=0.707) | Removes subsonic drift / DC offset |
| **Lowpass filter** | Biquad Direct Form I | Cuts high-frequency hiss above the pulse band |
| **Notch filter** | Biquad band-reject (Q=10) | Optional 50/60 Hz powerline hum rejection |
| **Noise gate** | Envelope-follower with asymmetric attack/release (5 ms / 50 ms) | Attenuates background silence between pulses |
| **AGC** | Automatic Gain Control — envelope follower (50 ms attack, configurable decay) | Boosts faint signals while clamping gain ≤ 25× |

> **Why biquad filters?** They are O(N) per sample, numerically stable for audio-rate sample rates, and require no FFT — making them ideal for real-time browser processing.

### 3. Envelope Extraction

After the filter chain, the absolute value of the signal is smoothed with an **8 Hz lowpass biquad** to produce a slowly-varying amplitude envelope. This envelope captures the "shape" of each heartbeat beat without fast oscillations.

### 4. Pulse Detection

The envelope is scanned by the peak detector in [`src/dsp/PulseDetector.ts`](src/dsp/PulseDetector.ts):

**Peak Amplitude mode (default)**
- Finds all local maxima within a sliding window sized by `maxBpm` (minimum inter-peak distance).
- Applies a relative amplitude threshold (configurable `threshold` and `maxThreshold` to reject spike noise).
- Computes instantaneous BPM from consecutive peak intervals; only counts beats within the `[minBpm, maxBpm]` physiological range.
- Average BPM is the **median** of all valid beat-to-beat intervals (robust to outliers).

**Frequency Resonator mode**
- Applies a biquad **bandpass filter** (HP + LP in series) to the raw audio at the user-defined heartbeat frequency range.
- Computes a rectified+smoothed envelope (80 ms window) of the bandpassed signal.
- Runs the same peak detector on this frequency-selective envelope.

### 5. Playback & Gain

Filtered audio is encoded to a **WAV blob** (`Float32Array → PCM16`) and served as an object URL to an `<audio>` element. A **Web Audio API gain node** is patched between the media element source and the audio destination, allowing amplification beyond the browser's native 100% cap (up to 20×).

---

## Project Structure

```
src/
├── App.tsx                    # Composition root — wires hooks + components
├── App.css                    # All component styles
│
├── hooks/
│   ├── useAudioEngine.ts      # Audio loading, DSP, and pulse detection state
│   ├── usePlayback.ts         # Playback controls, rAF loop, spacebar hotkey
│   ├── usePresets.ts          # Preset profile save/load/delete
│   └── useSessions.ts         # IndexedDB session persistence
│
├── components/
│   ├── AudioWaveform.tsx      # Canvas waveform visualizer with minimap
│   ├── BpmTrendChart.tsx      # SVG heart rate trend chart
│   ├── PlaybackBar.tsx        # Play/pause, speed, volume, Y-scale controls
│   ├── ExportCard.tsx         # Save / download buttons
│   ├── SavePresetModal.tsx    # Preset naming modal
│   └── sidebar/
│       ├── UploadCard.tsx     # Drag-and-drop file upload zone
│       ├── ParametersCard.tsx # DSP + detector parameter tabs
│       └── SessionsCard.tsx   # Saved sessions list
│
├── dsp/
│   ├── dspWrapper.ts          # Biquad filter chain, noise gate, AGC, envelope
│   └── PulseDetector.ts       # Peak / frequency resonator detection algorithm
│
└── utils/
    ├── audioExtractor.ts      # Web Audio API file decoding → mono Float32Array
    ├── wavExporter.ts         # Float32Array → PCM16 WAV blob
    ├── dataExporter.ts        # Peaks & waveform CSV export
    └── db.ts                  # IndexedDB session storage (save/load/delete)
```

---

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and drop an audio or video file onto the upload zone.

---

## Browser Requirements

- Chrome 66+ / Firefox 76+ / Safari 14.1+ (Web Audio API + `decodeAudioData`)
- IndexedDB support (for session persistence)
- No server required — all processing runs locally in your browser
