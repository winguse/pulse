import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { PulsePeak } from '../dsp/PulseDetector';

// Autocorrelation pitch detector to find dominant sound frequency
const detectSpikeFrequency = (slice: Float32Array, sampleRate: number): number => {
  if (slice.length < 100) return 0;
  
  const minFreq = 20;
  const maxFreq = 800;
  const minLag = Math.max(1, Math.floor(sampleRate / maxFreq));
  const maxLag = Math.min(slice.length - 1, Math.floor(sampleRate / minFreq));
  
  let bestLag = -1;
  let maxCorrelation = -Infinity;
  
  const numSamples = Math.min(slice.length - maxLag, 512);
  if (numSamples <= 0) return 0;

  let zeroLagEnergy = 0;
  for (let i = 0; i < numSamples; i++) {
    zeroLagEnergy += slice[i] * slice[i];
  }
  if (zeroLagEnergy < 0.00001) return 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0;
    for (let i = 0; i < numSamples; i++) {
      correlation += slice[i] * slice[i + lag];
    }
    
    if (correlation > maxCorrelation) {
      maxCorrelation = correlation;
      bestLag = lag;
    }
  }
  
  if (bestLag > 0 && maxCorrelation > 0) {
    return sampleRate / bestLag;
  }
  return 0;
};

interface AudioWaveformProps {
  filteredAudio: Float32Array;
  envelope: Float32Array;
  sampleRate: number;
  duration: number;
  peaks: PulsePeak[];
  currentTime: number;
  onSeek: (time: number) => void;
  onVisibleWindowChange?: (start: number, end: number) => void;
  averageBpm: number;
  isPlaying: boolean;
  yScale: number;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  filteredAudio,
  envelope,
  sampleRate,
  duration,
  peaks,
  currentTime,
  onSeek,
  onVisibleWindowChange,
  averageBpm,
  isPlaying,
  yScale,
}) => {
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overviewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Viewport states
  const [zoom, setZoom] = useState(1); // 1x to 100x
  const [scrollTime, setScrollTime] = useState(0); // start time of viewport in seconds

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  // Selection states
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // Dragging refs for high-performance overview timeline brushes
  const dragModeRef = useRef<'left' | 'right' | 'pan' | 'none'>('none');
  const dragStartXRef = useRef<number>(0);
  const dragStartScrollTimeRef = useRef<number>(0);
  const dragStartVisibleDurationRef = useRef<number>(0);

  const visibleDuration = useMemo(() => duration / zoom, [duration, zoom]);

  const [containerWidth, setContainerWidth] = useState(600);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Monitor container width changes to make canvas drawing responsive
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (entries && entries.length > 0) {
        setContainerWidth(Math.floor(entries[0].contentRect.width));
      }
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Synchronize visible zoom window bounds to the parent component
  useEffect(() => {
    if (onVisibleWindowChange) {
      onVisibleWindowChange(scrollTime, scrollTime + visibleDuration);
    }
  }, [scrollTime, visibleDuration, onVisibleWindowChange]);

  // Ensure scrollTime is within valid boundaries when zoom changes
  useEffect(() => {
    setScrollTime((prev) => Math.max(0, Math.min(prev, duration - visibleDuration)));
  }, [visibleDuration, duration]);

  // 1. Draw loop for Main Waveform Canvas
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || filteredAudio.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-DPI screens
    const dpr = window.devicePixelRatio || 1;
    const width = containerWidth;
    const height = 384; // 2x height layout

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Grid Lines (Time markers)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const numGridLines = 10;
    const timeStep = visibleDuration / numGridLines;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '9px monospace';

    for (let i = 0; i <= numGridLines; i++) {
      const t = scrollTime + i * timeStep;
      if (t > duration) break;
      const x = (i / numGridLines) * width;
      
      // Draw grid line
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Draw time label
      const mins = Math.floor(t / 60);
      const secs = Math.floor(t % 60);
      const ms = Math.floor((t % 1) * 100);
      const timeStr = `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
      ctx.fillText(timeStr, x + 4, height - 6);
    }

    const startSample = Math.floor(scrollTime * sampleRate);
    const endSample = Math.floor((scrollTime + visibleDuration) * sampleRate);
    const visibleSamplesCount = endSample - startSample;

    if (visibleSamplesCount <= 0) return;

    // Draw raw/filtered waveform outline
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.25)'; // Purple-200 transparent
    ctx.lineWidth = 1.5;
    ctx.beginPath();


    for (let x = 0; x < width; x++) {
      const idxStart = startSample + Math.floor((x / width) * visibleSamplesCount);
      const idxEnd = startSample + Math.floor(((x + 1) / width) * visibleSamplesCount);
      
      let minVal = 0;
      let maxVal = 0;

      // Find min & max in the pixel bucket
      for (let s = idxStart; s < idxEnd && s < filteredAudio.length; s++) {
        const val = filteredAudio[s];
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }

      // Standardize waveform height around center with Y-Scale amplification
      const scaledMin = Math.max(-1.0, Math.min(1.0, minVal * yScale));
      const scaledMax = Math.max(-1.0, Math.min(1.0, maxVal * yScale));
      const yMin = ((1 - scaledMin) / 2) * (height - 30) + 10;
      const yMax = ((1 - scaledMax) / 2) * (height - 30) + 10;

      ctx.moveTo(x, yMin);
      ctx.lineTo(x, yMax);
    }
    ctx.stroke();

    // Draw Amplitude Envelope (neon pink/cyan)
    ctx.strokeStyle = '#ec4899'; // Pink-500
    ctx.lineWidth = 2;
    ctx.beginPath();
    let first = true;

    for (let x = 0; x < width; x++) {
      const idx = startSample + Math.floor((x / width) * visibleSamplesCount);
      if (idx >= envelope.length) break;

      const val = Math.min(1.0, envelope[idx] * yScale);
      // envelope is positive, draw from bottom up
      const y = height - 25 - val * (height - 40);

      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw heartbeat peak markers
    peaks.forEach((peak) => {
      if (peak.time >= scrollTime && peak.time <= scrollTime + visibleDuration) {
        const x = ((peak.time - scrollTime) / visibleDuration) * width;
        const envVal = Math.min(1.0, (envelope[peak.index] || 0) * yScale);
        const y = height - 25 - envVal * (height - 40);

        // Draw glowing beat pulse marker
        ctx.fillStyle = '#06b6d4'; // Cyan-500
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height - 25);
        ctx.stroke();
        ctx.setLineDash([]);

        // BPM Text bubble if zoomed in enough to see details
        if (zoom >= 2 && peak.bpm) {
          ctx.fillStyle = '#06b6d4';
          ctx.font = 'bold 9px sans-serif';
          ctx.fillText(`${Math.round(peak.bpm)}`, x - 8, y - 10);
        }
      }
    });

    // Draw selection overlay
    if (selectionStart !== null && selectionEnd !== null) {
      const tMin = Math.min(selectionStart, selectionEnd);
      const tMax = Math.max(selectionStart, selectionEnd);

      const startX = Math.max(0, ((tMin - scrollTime) / visibleDuration) * width);
      const endX = Math.min(width, ((tMax - scrollTime) / visibleDuration) * width);

      if (startX < width && endX > 0) {
        ctx.fillStyle = 'rgba(6, 182, 212, 0.12)';
        ctx.fillRect(startX, 0, endX - startX, height);

        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, height);
        ctx.moveTo(endX, 0);
        ctx.lineTo(endX, height);
        ctx.stroke();

        // Draw selection text inside the canvas selected region
        const durationSec = tMax - tMin;
        const totalMs = Math.round(durationSec * 1000);
        const secs = Math.floor(totalMs / 1000);
        const ms = totalMs % 1000;

        // Detect spike frequency in selection
        const startIndex = Math.floor(tMin * sampleRate);
        const endIndex = Math.min(filteredAudio.length, Math.floor(tMax * sampleRate));
        let freqStr = '';
        if (endIndex > startIndex) {
          const slice = filteredAudio.subarray(startIndex, endIndex);
          const freq = detectSpikeFrequency(slice, sampleRate);
          if (freq > 0) {
            freqStr = ` • Freq: ${freq.toFixed(1)} Hz`;
          }
        }
        const labelText = `Sel: ${secs}s ${ms}ms (${tMin.toFixed(2)}s - ${tMax.toFixed(2)}s)${freqStr}`;

        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.font = 'bold 9px monospace';
        const textW = ctx.measureText(labelText).width + 8;
        ctx.fillRect(startX + 4, 6, textW, 14);
        
        ctx.fillStyle = '#06b6d4';
        ctx.fillText(labelText, startX + 8, 16);
        ctx.restore();
      }
    }

    // ECG Pulse Monitor Box (Top Right inside canvas)
    const monitorW = 85;
    const monitorH = 32;
    const monitorX = width - monitorW - 10;
    const monitorY = 10;
    const isBeating = isPlaying && peaks.some(p => currentTime >= p.time && currentTime <= p.time + 0.15);

    ctx.save();
    // backing capsule
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(monitorX, monitorY, monitorW, monitorH, 4);
    } else {
      ctx.rect(monitorX, monitorY, monitorW, monitorH);
    }
    ctx.fill();
    ctx.stroke();

    // blinking heart icon
    const heartSize = 10;
    const heartX = monitorX + 10;
    const heartY = monitorY + 11;
    const heartColor = isBeating ? '#ef4444' : 'rgba(239, 68, 68, 0.25)';
    
    ctx.fillStyle = heartColor;
    if (isBeating) {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 6;
    }
    ctx.beginPath();
    ctx.moveTo(heartX, heartY + heartSize / 4);
    ctx.quadraticCurveTo(heartX, heartY, heartX + heartSize / 2, heartY);
    ctx.quadraticCurveTo(heartX + heartSize, heartY, heartX + heartSize, heartY + heartSize / 3);
    ctx.quadraticCurveTo(heartX + heartSize, heartY + heartSize * 2/3, heartX + heartSize/2, heartY + heartSize);
    ctx.quadraticCurveTo(heartX, heartY + heartSize * 2/3, heartX, heartY + heartSize / 3);
    ctx.quadraticCurveTo(heartX, heartY, heartX, heartY + heartSize / 4);
    ctx.closePath();
    ctx.fill();

    // BPM digits
    ctx.shadowBlur = 0; // reset
    ctx.fillStyle = '#06b6d4';
    ctx.font = 'bold 16px monospace';
    const bpmStr = averageBpm > 0 ? `${averageBpm}` : '--';
    const bpmWidth = ctx.measureText(bpmStr).width;
    ctx.fillText(bpmStr, monitorX + 24, monitorY + 22);

    // BPM unit label
    ctx.fillStyle = 'rgba(6, 182, 212, 0.6)';
    ctx.font = 'bold 7px monospace';
    ctx.fillText('BPM', monitorX + 24 + bpmWidth + 4, monitorY + 18);

    // blinking status light
    ctx.fillStyle = isPlaying ? '#22c55e' : '#64748b';
    ctx.beginPath();
    ctx.arc(monitorX + monitorW - 8, monitorY + 8, 2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();

    // Draw playhead
    if (currentTime >= scrollTime && currentTime <= scrollTime + visibleDuration) {
      const playheadX = ((currentTime - scrollTime) / visibleDuration) * width;

      // Line
      ctx.strokeStyle = '#f97316'; // Orange-500
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // Handle flag
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(playheadX - 6, 0);
      ctx.lineTo(playheadX + 6, 0);
      ctx.lineTo(playheadX + 6, 8);
      ctx.lineTo(playheadX, 14);
      ctx.lineTo(playheadX - 6, 8);
      ctx.closePath();
      ctx.fill();
    }
  }, [filteredAudio, envelope, sampleRate, duration, peaks, currentTime, zoom, scrollTime, visibleDuration, containerWidth, yScale, selectionStart, selectionEnd, averageBpm, isPlaying]);

  // 2. Draw loop for Overview Minimap Canvas
  useEffect(() => {
    const canvas = overviewCanvasRef.current;
    if (!canvas || filteredAudio.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = containerWidth;
    const height = 40; // Fixed height matching h-10 layout

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    // Draw full waveform outline simplified
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const decimation = Math.max(1, Math.floor(filteredAudio.length / width));

    for (let x = 0; x < width; x++) {
      const idx = x * decimation;
      if (idx >= filteredAudio.length) break;

      const val = Math.max(-1.0, Math.min(1.0, filteredAudio[idx] * yScale));
      const yMin = ((1 - Math.abs(val)) / 2) * height;
      const yMax = ((1 + Math.abs(val)) / 2) * height;

      ctx.moveTo(x, yMin);
      ctx.lineTo(x, yMax);
    }
    ctx.stroke();

    // Draw full envelope outline in background
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    let first = true;
    for (let x = 0; x < width; x++) {
      const idx = Math.floor((x / width) * envelope.length);
      const val = Math.min(1.0, (envelope[idx] || 0) * yScale);
      const y = height - val * height;

      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw zoomed viewport window overlay
    const viewX = (scrollTime / duration) * width;
    const viewW = (visibleDuration / duration) * width;

    ctx.fillStyle = 'rgba(192, 132, 252, 0.2)'; // purple tint
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1.5;
    ctx.fillRect(viewX, 0, viewW, height);
    ctx.strokeRect(viewX, 0.5, viewW, height - 1);

    // Draw left and right handle grips
    ctx.fillStyle = '#c084fc';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    const gripH = 18;
    const gripW = 6;
    const gripY = (height - gripH) / 2;

    // Left handle grip pill
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(viewX - gripW / 2, gripY, gripW, gripH, 2);
    } else {
      ctx.rect(viewX - gripW / 2, gripY, gripW, gripH);
    }
    ctx.fill();
    ctx.stroke();

    // Right handle grip pill
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(viewX + viewW - gripW / 2, gripY, gripW, gripH, 2);
    } else {
      ctx.rect(viewX + viewW - gripW / 2, gripY, gripW, gripH);
    }
    ctx.fill();
    ctx.stroke();

    // Draw playhead on minimap
    const playX = (currentTime / duration) * width;
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, height);
    ctx.stroke();

    // Draw zoom window info directly on the minimap canvas (top-left)
    const zoomStart = scrollTime;
    const zoomEnd = scrollTime + visibleDuration;
    const zoomDuration = visibleDuration;
    const zoomText = `Zoom: ${zoomStart.toFixed(1)}s - ${zoomEnd.toFixed(1)}s (${zoomDuration.toFixed(1)}s)`;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.font = 'bold 8px monospace';
    const textW = ctx.measureText(zoomText).width + 8;
    ctx.fillRect(4, 3, textW, 11);
    
    ctx.fillStyle = '#c084fc';
    ctx.fillText(zoomText, 8, 11);
    ctx.restore();
  }, [filteredAudio, envelope, duration, currentTime, scrollTime, visibleDuration, containerWidth, yScale]);

  // Handle Main Waveform click / drag seek & pan & Shift-selection
  const handleMainMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeAtX = scrollTime + (x / rect.width) * visibleDuration;

    if (e.shiftKey) {
      setIsSelecting(true);
      setSelectionStart(timeAtX);
      setSelectionEnd(timeAtX);
      e.preventDefault();
    } else if (e.button === 1) {
      setIsPanning(true);
      dragStartXRef.current = e.clientX;
      dragStartScrollTimeRef.current = scrollTime;
      e.preventDefault();
    } else {
      // Clear selection on normal click
      setSelectionStart(null);
      setSelectionEnd(null);
      setIsScrubbing(true);
      onSeek(Math.max(0, Math.min(timeAtX, duration)));
    }
  };

  const handleMainMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeAtX = scrollTime + (x / rect.width) * visibleDuration;

    if (isSelecting) {
      setSelectionEnd(Math.max(0, Math.min(timeAtX, duration)));
    } else if (isPanning) {
      const dx = e.clientX - dragStartXRef.current;
      const timeDelta = (dx / rect.width) * visibleDuration;
      setScrollTime(
        Math.max(0, Math.min(dragStartScrollTimeRef.current - timeDelta, duration - visibleDuration))
      );
    } else if (isScrubbing) {
      onSeek(Math.max(0, Math.min(timeAtX, duration)));
    }
  };

  const handleMainMouseUp = () => {
    setIsScrubbing(false);
    setIsPanning(false);
    setIsSelecting(false);
  };

  // Zoom centered on cursor on Wheel event
  const handleMainWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = mainCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    // Time value under mouse before zoom
    const timeAtMouse = scrollTime + (mouseX / rect.width) * visibleDuration;

    // Calculate new zoom factor
    const zoomIntensity = 0.05;
    const direction = e.deltaY < 0 ? 1 : -1;
    const factor = 1 + direction * zoomIntensity;
    const newZoom = Math.max(1, Math.min(100, zoom * factor));

    const newVisibleDuration = duration / newZoom;
    // Calculate new start time to keep mouse hovering over same time point
    const newScrollTime = Math.max(
      0,
      Math.min(timeAtMouse - (mouseX / rect.width) * newVisibleDuration, duration - newVisibleDuration)
    );

    setZoom(newZoom);
    setScrollTime(newScrollTime);
  };

  const handleOverviewMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overviewCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    const viewX = (scrollTime / duration) * width;
    const viewW = (visibleDuration / duration) * width;

    // Check hit test on handles (left handle start, right handle end)
    const handleTolerance = 8; // pixels
    if (Math.abs(x - viewX) <= handleTolerance) {
      dragModeRef.current = 'left';
    } else if (Math.abs(x - (viewX + viewW)) <= handleTolerance) {
      dragModeRef.current = 'right';
    } else if (x > viewX && x < viewX + viewW) {
      dragModeRef.current = 'pan';
    } else {
      // Clicked outside the viewport brush: center on click location and pan
      const clickTime = (x / width) * duration;
      const newScrollTime = Math.max(0, Math.min(clickTime - visibleDuration / 2, duration - visibleDuration));
      setScrollTime(newScrollTime);
      dragModeRef.current = 'pan';
      
      dragStartScrollTimeRef.current = newScrollTime;
      dragStartXRef.current = e.clientX;
      dragStartVisibleDurationRef.current = visibleDuration;
      return;
    }

    dragStartXRef.current = e.clientX;
    dragStartScrollTimeRef.current = scrollTime;
    dragStartVisibleDurationRef.current = visibleDuration;
    e.preventDefault();
  };

  const handleOverviewMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overviewCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    if (dragModeRef.current === 'none') {
      const viewX = (scrollTime / duration) * width;
      const viewW = (visibleDuration / duration) * width;
      const handleTolerance = 8;

      if (Math.abs(x - viewX) <= handleTolerance || Math.abs(x - (viewX + viewW)) <= handleTolerance) {
        canvas.style.cursor = 'ew-resize';
      } else if (x > viewX && x < viewX + viewW) {
        canvas.style.cursor = 'grab';
      } else {
        canvas.style.cursor = 'pointer';
      }
      return;
    }

    const dx = e.clientX - dragStartXRef.current;
    const dt = (dx / width) * duration;

    if (dragModeRef.current === 'pan') {
      const newScrollTime = Math.max(0, Math.min(dragStartScrollTimeRef.current + dt, duration - visibleDuration));
      setScrollTime(newScrollTime);
    } else if (dragModeRef.current === 'left') {
      const currentEndTime = dragStartScrollTimeRef.current + dragStartVisibleDurationRef.current;
      const newStartTime = Math.max(0, Math.min(dragStartScrollTimeRef.current + dt, currentEndTime - 0.5));
      const newVisibleDuration = currentEndTime - newStartTime;

      setScrollTime(newStartTime);
      setZoom(duration / newVisibleDuration);
    } else if (dragModeRef.current === 'right') {
      const currentStartTime = dragStartScrollTimeRef.current;
      const newEndTime = Math.max(currentStartTime + 0.5, Math.min(currentStartTime + dragStartVisibleDurationRef.current + dt, duration));
      const newVisibleDuration = newEndTime - currentStartTime;

      setZoom(duration / newVisibleDuration);
    }
  };

  const handleOverviewMouseUp = () => {
    dragModeRef.current = 'none';
    const canvas = overviewCanvasRef.current;
    if (canvas) {
      canvas.style.cursor = 'pointer';
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full flex flex-col gap-2 p-4 bg-slate-900/60 backdrop-blur-md rounded border border-slate-800 text-slate-200"
    >
      {/* Canvas Timeline */}
      <div className="relative">
        <canvas
          ref={mainCanvasRef}
          style={{ width: '100%', height: '384px', display: 'block', boxSizing: 'border-box' }}
          className="waveform-timeline-canvas bg-slate-950/80 rounded cursor-crosshair border border-slate-950"
          onMouseDown={handleMainMouseDown}
          onMouseMove={handleMainMouseMove}
          onMouseUp={handleMainMouseUp}
          onMouseLeave={handleMainMouseUp}
          onWheel={handleMainWheel}
        />

      </div>

      {/* Overview Minimap */}
      <div className="flex flex-col gap-1">
        <canvas
          ref={overviewCanvasRef}
          style={{ width: '100%', height: '40px', display: 'block', boxSizing: 'border-box' }}
          className="waveform-overview-canvas bg-slate-950/50 rounded cursor-ew-resize border border-slate-950/80"
          onMouseDown={handleOverviewMouseDown}
          onMouseMove={handleOverviewMouseMove}
          onMouseUp={handleOverviewMouseUp}
          onMouseLeave={handleOverviewMouseUp}
        />
      </div>


    </div>
  );
};
