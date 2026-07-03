export interface PulseDetectionParams {
  threshold: number;      // 0.0 to 1.0 (sensitivity relative to peak)
  maxThreshold?: number;  // 0.0 to 1.0 (ignore peaks above this relative to max peak, e.g. artifacts)
  minBpm: number;         // e.g. 50
  maxBpm: number;         // e.g. 220
  mode?: 'peak' | 'frequency';
  minFreq?: number;       // e.g. 20 (Hz)
  maxFreq?: number;       // e.g. 120 (Hz)
}

export interface PulsePeak {
  index: number;          // Sample index
  time: number;           // Time in seconds
  amplitude: number;      // Envelope value at peak
  bpm: number | null;     // Instantaneous BPM based on previous peak
}

interface PulseDetectionResult {
  peaks: PulsePeak[];
  averageBpm: number;
  bpmValues: { time: number; bpm: number }[]; // For plotting heart rate trend over time
}

/**
 * Detects heartbeat pulses in the smoothed audio envelope.
 */
export function detectPulses(
  envelope: Float32Array,
  sampleRate: number,
  params: PulseDetectionParams,
  audioData?: Float32Array
): PulseDetectionResult {
  let detectionEnvelope = envelope;
  const len = envelope.length;

  if (len === 0) {
    return { peaks: [], averageBpm: 0, bpmValues: [] };
  }

  // Calculate frequency bandpassed resonator envelope if frequency mode is active
  if (params.mode === 'frequency' && audioData && audioData.length > 0) {
    const f_min = params.minFreq || 20;
    const f_max = params.maxFreq || 120;
    
    // Biquad Highpass Filter (f_min)
    const w0_hp = (2 * Math.PI * f_min) / sampleRate;
    const cos_hp = Math.cos(w0_hp);
    const alpha_hp = Math.sin(w0_hp) / (2 * 0.707); // Q = 0.707
    const b0_hp = (1 + cos_hp) / 2;
    const b1_hp = -(1 + cos_hp);
    const b2_hp = (1 + cos_hp) / 2;
    const a0_hp = 1 + alpha_hp;
    const a1_hp = -2 * cos_hp;
    const a2_hp = 1 - alpha_hp;
    
    const nb0_hp = b0_hp / a0_hp;
    const nb1_hp = b1_hp / a0_hp;
    const nb2_hp = b2_hp / a0_hp;
    const na1_hp = a1_hp / a0_hp;
    const na2_hp = a2_hp / a0_hp;
    
    // Biquad Lowpass Filter (f_max)
    const w0_lp = (2 * Math.PI * f_max) / sampleRate;
    const cos_lp = Math.cos(w0_lp);
    const alpha_lp = Math.sin(w0_lp) / (2 * 0.707); // Q = 0.707
    const b0_lp = (1 - cos_lp) / 2;
    const b1_lp = 1 - cos_lp;
    const b2_lp = (1 - cos_lp) / 2;
    const a0_lp = 1 + alpha_lp;
    const a1_lp = -2 * cos_lp;
    const a2_lp = 1 - alpha_lp;
    
    const nb0_lp = b0_lp / a0_lp;
    const nb1_lp = b1_lp / a0_lp;
    const nb2_lp = b2_lp / a0_lp;
    const na1_lp = a1_lp / a0_lp;
    const na2_lp = a2_lp / a0_lp;
    
    const dataLen = audioData.length;
    const temp = new Float32Array(dataLen);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    
    // Run Highpass
    for (let i = 0; i < dataLen; i++) {
      const x = audioData[i];
      const y = nb0_hp * x + nb1_hp * x1 + nb2_hp * x2 - na1_hp * y1 - na2_hp * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      temp[i] = y;
    }
    
    // Run Lowpass in series
    const bandpassed = new Float32Array(dataLen);
    x1 = 0; x2 = 0; y1 = 0; y2 = 0;
    for (let i = 0; i < dataLen; i++) {
      const x = temp[i];
      const y = nb0_lp * x + nb1_lp * x1 + nb2_lp * x2 - na1_lp * y1 - na2_lp * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      bandpassed[i] = y;
    }
    
    // Smooth rectified signal with 80ms window to build envelope
    const winSize = Math.max(16, Math.floor(sampleRate * 0.08));
    const freqEnv = new Float32Array(dataLen);
    let runningSum = 0;
    for (let i = 0; i < dataLen; i++) {
      runningSum += Math.abs(bandpassed[i]);
      if (i >= winSize) {
        runningSum -= Math.abs(bandpassed[i - winSize]);
      }
      freqEnv[i] = runningSum / winSize;
    }
    detectionEnvelope = freqEnv;
  }

  const detectionLen = detectionEnvelope.length;

  // Find overall maximum of the envelope to scale threshold
  let maxEnv = 0.0001;
  for (let i = 0; i < detectionLen; i++) {
    if (detectionEnvelope[i] > maxEnv) {
      maxEnv = detectionEnvelope[i];
    }
  }

  // Peak must be above this threshold, and below the max cutoff
  const absoluteThreshold = params.threshold * maxEnv;
  const absoluteMaxThreshold = (params.maxThreshold ?? 1.0) * maxEnv;

  // Min distance between peaks in samples (derived from maxBpm)
  // Max BPM = 240 => 4 beats per second => min distance = 0.25 seconds
  const minDistanceSec = 60.0 / params.maxBpm;
  const minDistanceSamples = Math.floor(minDistanceSec * sampleRate);

  // Max distance between peaks (derived from minBpm)
  // Min BPM = 40 => 0.67 beats per second => max distance = 1.5 seconds
  const maxDistanceSec = 60.0 / params.minBpm;

  const peaks: PulsePeak[] = [];

  // 1. Peak detection loop (sliding window local maximum)
  for (let i = 0; i < detectionLen; i++) {
    const val = detectionEnvelope[i];

    // Check if it satisfies amplitude bounds (low-bound threshold and high-bound spike limit)
    if (val < absoluteThreshold || val > absoluteMaxThreshold) continue;

    // Check if it's a local maximum in its window
    let isLocalMax = true;
    const start = Math.max(0, i - minDistanceSamples);
    const end = Math.min(detectionLen - 1, i + minDistanceSamples);

    for (let j = start; j <= end; j++) {
      if (detectionEnvelope[j] > val) {
        isLocalMax = false;
        break;
      }
      // Handle flat tops: take the first occurrence
      if (detectionEnvelope[j] === val && j < i) {
        isLocalMax = false;
        break;
      }
    }

    if (isLocalMax) {
      const time = i / sampleRate;
      let bpm: number | null = null;

      // Compute instantaneous BPM based on the previous peak
      if (peaks.length > 0) {
        const prevPeak = peaks[peaks.length - 1];
        const dt = time - prevPeak.time;
        
        // Only count if within reasonable bounds (to ignore huge gaps)
        if (dt <= maxDistanceSec && dt >= minDistanceSec) {
          bpm = 60.0 / dt;
        }
      }

      peaks.push({
        index: i,
        time,
        amplitude: val,
        bpm,
      });

      // Skip forward by min distance to avoid detecting on the shoulder of the same peak
      i += minDistanceSamples - 1;
    }
  }

  // 2. Compute heart rate trends and average BPM
  const validBpmValues: { time: number; bpm: number }[] = [];
  let bpmSum = 0;
  let bpmCount = 0;

  for (let i = 1; i < peaks.length; i++) {
    const peak = peaks[i];
    const dt = peak.time - peaks[i - 1].time;
    
    // Calculate instantaneous BPM
    if (dt >= minDistanceSec && dt <= maxDistanceSec) {
      const bpm = 60.0 / dt;
      validBpmValues.push({ time: peak.time, bpm });
      
      // We can apply a simple median or moving window filter to smooth out noise
      // For average calculation, just add it
      bpmSum += bpm;
      bpmCount++;
      
      peak.bpm = bpm; // update/confirm peak bpm
    }
  }

  // Average BPM: use median of BPM values if possible to ignore outliers, or robust average
  let averageBpm = 0;
  if (validBpmValues.length > 0) {
    // Sort to get median
    const sorted = [...validBpmValues].map(v => v.bpm).sort((a, b) => a - b);
    averageBpm = sorted[Math.floor(sorted.length / 2)];
  }

  return {
    peaks,
    averageBpm: Math.round(averageBpm),
    bpmValues: validBpmValues,
  };
}
