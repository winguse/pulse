import { describe, it, expect } from 'vitest';
import { detectPulses } from './PulseDetector';
import type { PulseDetectionParams } from './PulseDetector';

describe('PulseDetector peak detection', () => {
  it('should detect peaks and calculate average BPM correctly', () => {
    const sampleRate = 100; // 100 samples per second
    const duration = 10; // 10 seconds
    const length = sampleRate * duration;
    const envelope = new Float32Array(length);

    for (let beatTime = 1; beatTime < duration; beatTime++) {
      const peakIndex = beatTime * sampleRate;
      
      // Draw a heartbeat-like bump: height 0.5, surrounding decay
      envelope[peakIndex] = 0.5;
      envelope[peakIndex - 1] = 0.3;
      envelope[peakIndex - 2] = 0.1;
      envelope[peakIndex + 1] = 0.3;
      envelope[peakIndex + 2] = 0.1;
    }

    const params: PulseDetectionParams = {
      threshold: 0.3, // peak relative threshold
      minBpm: 40,
      maxBpm: 200,
    };

    const result = detectPulses(envelope, sampleRate, params);

    // Check that we found exactly 9 peaks (at 1s, 2s, 3s, 4s, 5s, 6s, 7s, 8s, 9s)
    expect(result.peaks.length).toBe(9);

    // Check BPM calculations (60 BPM)
    expect(result.averageBpm).toBe(60);

    // Check peak positions
    expect(result.peaks[0].time).toBe(1.0);
    expect(result.peaks[1].time).toBe(2.0);
    expect(result.peaks[8].time).toBe(9.0);

    // Instantaneous BPM for later peaks should be exactly 60
    for (let i = 1; i < result.peaks.length; i++) {
      expect(result.peaks[i].bpm).toBeCloseTo(60, 1);
    }
  });

  it('should ignore noise peaks below the threshold', () => {
    const sampleRate = 100;
    const envelope = new Float32Array(500);

    // Add a strong pulse at sample 100 (height 0.8)
    envelope[100] = 0.8;
    
    // Add noise peaks (height 0.1)
    envelope[200] = 0.1;
    envelope[300] = 0.15;

    const params: PulseDetectionParams = {
      threshold: 0.5, // 50% of max (which is 0.8 * 0.5 = 0.4)
      minBpm: 40,
      maxBpm: 200,
    };

    const result = detectPulses(envelope, sampleRate, params);

    // Should only detect the strong pulse at index 100
    expect(result.peaks.length).toBe(1);
    expect(result.peaks[0].index).toBe(100);
  });
});
