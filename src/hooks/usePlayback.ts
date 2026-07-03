import { useState, useEffect } from "react";

interface UsePlaybackOptions {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  audioCtxRef: React.RefObject<AudioContext | null>;
  gainNodeRef: React.RefObject<GainNode | null>;
  initWebAudio: () => void;
  duration: number;
  originalAudio: Float32Array | null;
}

export function usePlayback({
  audioRef,
  audioCtxRef,
  gainNodeRef,
  initWebAudio,
  duration,
  originalAudio,
}: UsePlaybackOptions) {
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(() => {
    const saved = localStorage.getItem("pulse_playback_speed");
    return saved ? parseFloat(saved) : 1.0;
  });
  const [volume, setVolume] = useState<number>(() => {
    const saved = localStorage.getItem("pulse_volume");
    return saved ? parseFloat(saved) : 0.8;
  });
  const [visibleStart, setVisibleStart] = useState<number>(0);
  const [visibleEnd, setVisibleEnd] = useState<number>(0);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem("pulse_volume", volume.toString());
  }, [volume]);

  useEffect(() => {
    localStorage.setItem("pulse_playback_speed", playbackSpeed.toString());
  }, [playbackSpeed]);

  // Sync visible bounds whenever duration changes
  useEffect(() => {
    if (duration > 0) {
      setVisibleStart(0);
      setVisibleEnd(duration);
    }
  }, [duration]);

  // rAF loop to track playhead at 60 fps
  useEffect(() => {
    if (!isPlaying || !audioRef.current) return;
    let animFrameId: number;
    const update = () => {
      if (audioRef.current) {
        const curr = audioRef.current.currentTime;
        if (duration > 0 && visibleEnd > 0) {
          if (curr > visibleEnd) {
            audioRef.current.currentTime = visibleStart;
            audioRef.current.pause();
            setIsPlaying(false);
            setCurrentTime(visibleStart);
            return;
          } else if (curr < visibleStart) {
            audioRef.current.currentTime = visibleStart;
            setCurrentTime(visibleStart);
            return;
          }
        }
        setCurrentTime(curr);
      }
      animFrameId = requestAnimationFrame(update);
    };
    animFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animFrameId);
  }, [isPlaying, visibleStart, visibleEnd, duration]);

  // Spacebar hotkey
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && originalAudio) {
        e.preventDefault();
        handlePlayPause();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalAudio, isPlaying]);

  const onAudioTimeUpdate = () => {
    if (!audioRef.current) return;
    const curr = audioRef.current.currentTime;
    if (duration > 0 && visibleEnd > 0) {
      if (curr > visibleEnd) {
        audioRef.current.currentTime = visibleStart;
        audioRef.current.pause();
        setIsPlaying(false);
        setCurrentTime(visibleStart);
        return;
      } else if (curr < visibleStart) {
        audioRef.current.currentTime = visibleStart;
        setCurrentTime(visibleStart);
        return;
      }
    }
    setCurrentTime(curr);
  };

  const onAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(visibleStart > 0 ? visibleStart : 0);
  };

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    initWebAudio();
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume();
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (audio.currentTime < visibleStart || audio.currentTime > visibleEnd) {
        audio.currentTime = visibleStart;
        setCurrentTime(visibleStart);
      }
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const handleSeek = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const targetTime = Math.max(visibleStart, Math.min(time, visibleEnd));
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) audioRef.current.playbackRate = speed;
  };

  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    initWebAudio();
    if (audioRef.current) audioRef.current.volume = Math.min(1.0, vol);
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setValueAtTime(vol, audioCtxRef.current.currentTime);
    }
  };

  return {
    currentTime,
    isPlaying,
    playbackSpeed,
    volume,
    visibleStart,
    visibleEnd,
    handlePlayPause,
    handleSeek,
    handleSpeedChange,
    handleVolumeChange,
    setVisibleStart,
    setVisibleEnd,
    setCurrentTime,
    setIsPlaying,
    onAudioTimeUpdate,
    onAudioEnded,
  };
}
