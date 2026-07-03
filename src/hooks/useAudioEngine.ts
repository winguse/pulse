import { useState, useEffect, useRef, useCallback } from "react";
import { processAudioWithWasm } from "../dsp/dspWrapper";
import type { DSPParams } from "../dsp/dspWrapper";
import { detectPulses } from "../dsp/PulseDetector";
import type { PulsePeak } from "../dsp/PulseDetector";
import { extractAudioFromFile } from "../utils/audioExtractor";
import { float32ToWav } from "../utils/wavExporter";

export const DEFAULT_DSP_PARAMS: DSPParams = {
  lowpassFreq: 150,
  highpassFreq: 20,
  notchFreq: 0,
  noiseThreshold: 0.015,
  noiseAttenuation: 0.9,
  agcEnabled: true,
  agcDecay: 1.5,
};

export const DEFAULT_PULSE_PARAMS = {
  threshold: 0.2,
  maxThreshold: 0.8,
  minBpm: 70,
  maxBpm: 220,
  mode: "peak" as "peak" | "frequency",
  minFreq: 90,
  maxFreq: 110,
};

export type PulseParams = typeof DEFAULT_PULSE_PARAMS;

export function useAudioEngine() {
  const [fileName, setFileName] = useState<string>("");
  const [originalAudio, setOriginalAudio] = useState<Float32Array | null>(null);
  const [filteredAudio, setFilteredAudio] = useState<Float32Array | null>(null);
  const [envelope, setEnvelope] = useState<Float32Array | null>(null);
  const [sampleRate, setSampleRate] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [peaks, setPeaks] = useState<PulsePeak[]>([]);
  const [averageBpm, setAverageBpm] = useState<number>(0);
  const [bpmValues, setBpmValues] = useState<{ time: number; bpm: number }[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [yScale, setYScale] = useState<number>(1.0);

  const [dspParams, setDspParams] = useState<DSPParams>(() => {
    const saved = localStorage.getItem("pulse_dsp_params");
    return saved ? JSON.parse(saved) : DEFAULT_DSP_PARAMS;
  });

  const [pulseParams, setPulseParams] = useState<PulseParams>(() => {
    const saved = localStorage.getItem("pulse_pulse_params");
    return saved ? (JSON.parse(saved) as PulseParams) : DEFAULT_PULSE_PARAMS;
  });

  // Web Audio API refs for volume amplification up to 20x
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Persist params to localStorage
  useEffect(() => {
    localStorage.setItem("pulse_dsp_params", JSON.stringify(dspParams));
  }, [dspParams]);

  useEffect(() => {
    localStorage.setItem("pulse_pulse_params", JSON.stringify(pulseParams));
  }, [pulseParams]);

  // Revoke object URL on change to avoid memory leaks
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const initWebAudio = useCallback(() => {
    if (audioCtxRef.current) return;

    const AudioCtxClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass || !audioRef.current) return;

    const ctx = new AudioCtxClass();
    const gainNode = ctx.createGain();

    try {
      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      sourceNodeRef.current = source;
    } catch (e) {
      console.warn("Media element source already connected:", e);
    }

    gainNodeRef.current = gainNode;
    audioCtxRef.current = ctx;
  }, []);

  // Run DSP pipeline whenever audio or params change
  const runDSPRef = useRef<() => void>(() => {});
  runDSPRef.current = () => {
    if (!originalAudio || sampleRate <= 0) return;

    const runDSP = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { filteredAudio: outAudio, envelope: outEnv } =
          await processAudioWithWasm(originalAudio, sampleRate, dspParams);

        setFilteredAudio(outAudio);
        setEnvelope(outEnv);

        // Auto Y-scale so the max amplitude fills ~90% of the chart
        let maxEnv = 0.001;
        for (let i = 0; i < outEnv.length; i++) {
          if (outEnv[i] > maxEnv) maxEnv = outEnv[i];
        }
        setYScale(Math.max(1.0, Math.min(100.0, 0.9 / maxEnv)));

        // Generate WAV blob URL for playback
        const wavBlob = float32ToWav(outAudio, sampleRate);
        const url = URL.createObjectURL(wavBlob);

        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(url);

        if (audioRef.current) {
          const wasPlaying = !audioRef.current.paused;
          const savedTime = audioRef.current.currentTime;
          audioRef.current.src = url;
          audioRef.current.load();
          audioRef.current.currentTime = Math.min(savedTime, duration);

          if (gainNodeRef.current && audioCtxRef.current) {
            gainNodeRef.current.gain.setValueAtTime(
              gainNodeRef.current.gain.value,
              audioCtxRef.current.currentTime,
            );
          }
          if (wasPlaying) {
            audioRef.current.play().catch((e) => console.error(e));
          }
        }
      } catch (err: any) {
        setError(err.message || "Error executing audio filters.");
      } finally {
        setIsLoading(false);
      }
    };

    runDSP();
  };

  // Re-run DSP immediately when new audio is loaded
  useEffect(() => {
    if (!originalAudio || sampleRate <= 0) return;
    runDSPRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalAudio, sampleRate]);

  // Re-run DSP with 500ms debounce when DSP params change
  const dspDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!originalAudio || sampleRate <= 0) return;
    if (dspDebounceRef.current) clearTimeout(dspDebounceRef.current);
    dspDebounceRef.current = setTimeout(() => {
      runDSPRef.current();
    }, 500);
    return () => {
      if (dspDebounceRef.current) clearTimeout(dspDebounceRef.current);
    };
  }, [dspParams]);

  // Run pulse detection
  const runDetectionRef = useRef<() => void>(() => {});
  runDetectionRef.current = () => {
    if (!envelope || sampleRate <= 0) return;
    const result = detectPulses(
      envelope,
      sampleRate,
      {
        threshold: pulseParams.threshold,
        maxThreshold: pulseParams.maxThreshold,
        minBpm: pulseParams.minBpm,
        maxBpm: pulseParams.maxBpm,
        mode: pulseParams.mode ?? "peak",
        minFreq: pulseParams.minFreq ?? 20,
        maxFreq: pulseParams.maxFreq ?? 120,
      },
      filteredAudio || undefined,
    );
    setPeaks(result.peaks);
    setAverageBpm(result.averageBpm);
    setBpmValues(result.bpmValues);
  };

  // Re-run detection immediately when envelope/audio arrives
  useEffect(() => {
    if (!envelope || sampleRate <= 0) return;
    runDetectionRef.current();
  }, [envelope, filteredAudio, sampleRate]);

  // Re-run detection with 500ms debounce when pulse params change
  const paramDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!envelope || sampleRate <= 0) return;
    if (paramDebounceRef.current) clearTimeout(paramDebounceRef.current);
    paramDebounceRef.current = setTimeout(() => {
      runDetectionRef.current();
    }, 500);
    return () => {
      if (paramDebounceRef.current) clearTimeout(paramDebounceRef.current);
    };
  }, [pulseParams]);

  const processUploadedFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      setFileName(file.name);
      const {
        audioData,
        sampleRate: sr,
        duration: dur,
      } = await extractAudioFromFile(file);
      setSampleRate(sr);
      setDuration(dur);
      setOriginalAudio(audioData);
    } catch (err: any) {
      setError(err.message || "Failed to parse file.");
      setFileName("");
      setOriginalAudio(null);
      setFilteredAudio(null);
      setEnvelope(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    fileName,
    originalAudio,
    filteredAudio,
    envelope,
    sampleRate,
    duration,
    peaks,
    averageBpm,
    bpmValues,
    isLoading,
    error,
    audioUrl,
    yScale,
    dspParams,
    pulseParams,
    setDspParams,
    setPulseParams,
    setError,
    processUploadedFile,
    setYScale,
    audioRef,
    audioCtxRef,
    gainNodeRef,
    initWebAudio,
  };
}
