export interface DSPParams {
  lowpassFreq: number;
  highpassFreq: number;
  notchFreq: number;
  noiseThreshold: number;
  noiseAttenuation: number;
  agcEnabled: boolean;
  agcDecay: number;
}

interface DSPResult {
  filteredAudio: Float32Array;
  envelope: Float32Array;
}

// ---------------------------------------------------------------------------
// Biquad filter — Direct Form I
// ---------------------------------------------------------------------------

interface BiquadCoeffs {
  b0: number; b1: number; b2: number;
  a1: number; a2: number;
}

interface BiquadState {
  x1: number; x2: number;
  y1: number; y2: number;
}

function makeBiquadState(): BiquadState {
  return { x1: 0, x2: 0, y1: 0, y2: 0 };
}

function processBiquad(c: BiquadCoeffs, s: BiquadState, x: number): number {
  const y = c.b0 * x + c.b1 * s.x1 + c.b2 * s.x2
              - c.a1 * s.y1 - c.a2 * s.y2;
  s.x2 = s.x1; s.x1 = x;
  s.y2 = s.y1; s.y1 = y;
  return y;
}

function lowpassCoeffs(freq: number, sr: number, q: number): BiquadCoeffs {
  const w0 = 2 * Math.PI * freq / sr;
  const alpha = Math.sin(w0) / (2 * q);
  const cosW0 = Math.cos(w0);
  const a0 = 1 + alpha;
  return {
    b0: (1 - cosW0) / 2 / a0,
    b1: (1 - cosW0) / a0,
    b2: (1 - cosW0) / 2 / a0,
    a1: -2 * cosW0 / a0,
    a2: (1 - alpha) / a0,
  };
}

function highpassCoeffs(freq: number, sr: number, q: number): BiquadCoeffs {
  const w0 = 2 * Math.PI * freq / sr;
  const alpha = Math.sin(w0) / (2 * q);
  const cosW0 = Math.cos(w0);
  const a0 = 1 + alpha;
  return {
    b0:  (1 + cosW0) / 2 / a0,
    b1: -(1 + cosW0) / a0,
    b2:  (1 + cosW0) / 2 / a0,
    a1: -2 * cosW0 / a0,
    a2: (1 - alpha) / a0,
  };
}

function notchCoeffs(freq: number, sr: number, q: number): BiquadCoeffs {
  const w0 = 2 * Math.PI * freq / sr;
  const alpha = Math.sin(w0) / (2 * q);
  const cosW0 = Math.cos(w0);
  const a0 = 1 + alpha;
  return {
    b0: 1 / a0,
    b1: -2 * cosW0 / a0,
    b2: 1 / a0,
    a1: -2 * cosW0 / a0,
    a2: (1 - alpha) / a0,
  };
}

// ---------------------------------------------------------------------------
// Main processing — synchronous, pure TypeScript (no WASM)
// ---------------------------------------------------------------------------

async function processAudio(
  inputAudio: Float32Array,
  sampleRate: number,
  params: DSPParams,
  onProgress?: (progress: number) => void
): Promise<DSPResult> {
  const len = inputAudio.length;
  const output = new Float32Array(len);
  const envelope = new Float32Array(len);

  // 1. Build filters
  const hpCoeffs = highpassCoeffs(params.highpassFreq, sampleRate, 0.707);
  const lpCoeffs = lowpassCoeffs(params.lowpassFreq, sampleRate, 0.707);
  const notchC   = params.notchFreq > 0
    ? notchCoeffs(params.notchFreq, sampleRate, 10.0)
    : null;

  const hpState   = makeBiquadState();
  const lpState   = makeBiquadState();
  const notchState = makeBiquadState();

  // 2. Noise gate constants
  const gateAttack  = Math.exp(-1 / (sampleRate * 0.005)); // 5 ms
  const gateRelease = Math.exp(-1 / (sampleRate * 0.050)); // 50 ms
  let gateEnv = 0;

  // AGC constants
  const agcAttack     = Math.exp(-1 / (sampleRate * 0.05));
  const agcDecayCoeff = Math.exp(-1 / (sampleRate * params.agcDecay));
  let agcEnv = 0;

  // Envelope constants
  const envCoeffs = lowpassCoeffs(8.0, sampleRate, 0.707);
  const envState  = makeBiquadState();

  // Process in chunks to avoid blocking the main thread and to report progress
  const CHUNK_SIZE = sampleRate * 2; // ~2 seconds of audio per chunk

  for (let offset = 0; offset < len; offset += CHUNK_SIZE) {
    const end = Math.min(offset + CHUNK_SIZE, len);

    for (let i = offset; i < end; i++) {
      let x = inputAudio[i];

      // Filters
      x = processBiquad(hpCoeffs, hpState, x);
      x = processBiquad(lpCoeffs, lpState, x);
      if (notchC) x = processBiquad(notchC, notchState, x);

      // Noise Gate
      const absX = Math.abs(x);
      gateEnv = absX > gateEnv
        ? gateAttack  * gateEnv + (1 - gateAttack)  * absX
        : gateRelease * gateEnv + (1 - gateRelease) * absX;

      let gain: number;
      if (gateEnv >= params.noiseThreshold) {
        gain = 1.0;
      } else {
        const ratio    = gateEnv / (params.noiseThreshold + 1e-6);
        const minGain  = 1 - params.noiseAttenuation;
        gain = minGain + (1 - minGain) * ratio;
      }
      x = x * gain;

      // AGC
      if (params.agcEnabled) {
        const absX2 = Math.abs(x);
        agcEnv = absX2 > agcEnv
          ? agcAttack     * agcEnv + (1 - agcAttack)     * absX2
          : agcDecayCoeff * agcEnv + (1 - agcDecayCoeff) * absX2;

        const targetGain = agcEnv > 1e-4 ? 0.2 / agcEnv : 1.0;
        x = x * Math.min(targetGain, 25.0);
      }

      output[i] = x;

      // Envelope
      envelope[i] = processBiquad(envCoeffs, envState, Math.abs(x));
    }

    if (onProgress) {
      onProgress(Math.min(100, Math.round((end / len) * 100)));
      await new Promise((resolve) => setTimeout(resolve, 0)); // Yield to main thread
    }
  }

  return { filteredAudio: output, envelope };
}

/**
 * Async wrapper kept for API compatibility with existing callers.
 * No longer async under the hood — resolves immediately.
 */
export async function processAudioWithWasm(
  inputAudio: Float32Array,
  sampleRate: number,
  params: DSPParams,
  onProgress?: (progress: number) => void
): Promise<DSPResult> {
  return processAudio(inputAudio, sampleRate, params, onProgress);
}
