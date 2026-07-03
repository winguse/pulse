import React, { useRef, useEffect, useState, useMemo } from "react";
import { Minimap } from "./Minimap";

// Radix-2 Cooley-Tukey FFT
function fft(real: Float32Array, imag: Float32Array) {
  const n = real.length;
  // bit reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let temp = real[i];
      real[i] = real[j];
      real[j] = temp;
      temp = imag[i];
      imag[i] = imag[j];
      imag[j] = temp;
    }
  }
  // cooley-tukey
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let uReal = 1;
      let uImag = 0;
      for (let j = 0; j < halfLen; j++) {
        const u = i + j;
        const v = i + j + halfLen;
        const vReal = real[v] * uReal - imag[v] * uImag;
        const vImag = real[v] * uImag + imag[v] * uReal;
        real[v] = real[u] - vReal;
        imag[v] = imag[u] - vImag;
        real[u] += vReal;
        imag[u] += vImag;

        const nextUReal = uReal * wReal - uImag * wImag;
        uImag = uReal * wImag + uImag * wReal;
        uReal = nextUReal;
      }
    }
  }
}

function getNextPowerOf2(n: number) {
  let count = 0;
  if (n && !(n & (n - 1))) return n;
  while (n !== 0) {
    n >>= 1;
    count += 1;
  }
  return 1 << count;
}

interface Props {
  audioData: Float32Array | null;
  sampleRate: number;
  startTime: number;
  endTime: number;
}

export const FrequencySpectrumChart: React.FC<Props> = ({
  audioData,
  sampleRate,
  startTime,
  endTime,
}) => {
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  const [plotMinFreq, setPlotMinFreq] = useState(0);
  const [plotMaxFreq, setPlotMaxFreq] = useState(200);
  const [hoverData, setHoverData] = useState<{
    freq: number;
    mag: number;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      if (entries.length > 0)
        setContainerWidth(Math.floor(entries[0].contentRect.width));
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const spectrumData = useMemo(() => {
    if (!audioData || sampleRate <= 0 || endTime <= startTime) return null;

    let startSample = Math.floor(startTime * sampleRate);
    let endSample = Math.floor(endTime * sampleRate);
    startSample = Math.max(0, startSample);
    endSample = Math.min(audioData.length, endSample);

    let numSamples = endSample - startSample;
    if (numSamples <= 0) return null;

    // Limit to max 16384 samples for performance
    const MAX_SAMPLES = 16384;
    let sliceStart = startSample;

    if (numSamples > MAX_SAMPLES) {
      const mid = startSample + Math.floor(numSamples / 2);
      sliceStart = mid - MAX_SAMPLES / 2;
      numSamples = MAX_SAMPLES;
    }

    const n = getNextPowerOf2(numSamples);
    const real = new Float32Array(n);
    const imag = new Float32Array(n);

    // Apply Hann window
    for (let i = 0; i < numSamples; i++) {
      const multiplier =
        0.5 * (1 - Math.cos((2 * Math.PI * i) / (numSamples - 1)));
      real[i] = audioData[sliceStart + i] * multiplier;
    }

    fft(real, imag);

    const magnitudes = new Float32Array(n / 2);
    let maxMag = 0.0001;
    for (let i = 0; i < n / 2; i++) {
      const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
      magnitudes[i] = mag;
      if (mag > maxMag) maxMag = mag;
    }

    return { magnitudes, maxMag, n, maxAbsoluteFreq: sampleRate / 2 };
  }, [audioData, sampleRate, startTime, endTime]);

  const drawSpectrum = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    minFreq: number,
    maxFreq: number,
    isMinimap: boolean,
  ) => {
    if (!spectrumData) return;
    const { magnitudes, maxMag, maxAbsoluteFreq } = spectrumData;
    const numBins = magnitudes.length;

    const startBin = Math.max(
      0,
      Math.floor((minFreq / maxAbsoluteFreq) * numBins),
    );
    const endBin = Math.min(
      numBins,
      Math.ceil((maxFreq / maxAbsoluteFreq) * numBins),
    );

    ctx.beginPath();
    let first = true;
    for (let i = startBin; i < endBin; i++) {
      const freq = (i / numBins) * maxAbsoluteFreq;
      const x = ((freq - minFreq) / (maxFreq - minFreq)) * width;

      const normalizedMag = magnitudes[i] / maxMag;
      const logMag = Math.max(0, Math.log10(normalizedMag * 9 + 1));

      const y = height - logMag * (isMinimap ? height : height - 20);

      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }

    if (isMinimap) {
      ctx.strokeStyle = "rgba(168, 85, 247, 0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Fill
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.fillStyle = "rgba(34, 211, 238, 0.15)";
      ctx.fill();
    }
  };

  // Main Canvas Render
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || !spectrumData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = containerWidth;
    const height = 150;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "rgba(15, 23, 42, 0.5)";
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.beginPath();
    const range = plotMaxFreq - plotMinFreq;
    const step = Math.pow(10, Math.floor(Math.log10(range || 1)));
    let gridStep = step;
    if (range / gridStep > 10) gridStep *= 2;
    if (range / gridStep < 4) gridStep /= 2;

    const startGrid = Math.ceil(plotMinFreq / gridStep) * gridStep;
    for (let freq = startGrid; freq <= plotMaxFreq; freq += gridStep) {
      const x = ((freq - plotMinFreq) / range) * width;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "9px monospace";
      ctx.fillText(`${Math.round(freq)}Hz`, x + 2, 10);
    }
    ctx.stroke();

    drawSpectrum(ctx, width, height, plotMinFreq, plotMaxFreq, false);

    // Draw hover info
    if (hoverData) {
      const { freq, mag, x, y } = hoverData;
      // Crosshair
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Point
      ctx.fillStyle = "#f97316";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Tooltip
      const label = `${Math.round(freq)} Hz | ${(mag * 100).toFixed(1)}%`;
      ctx.font = "bold 11px sans-serif";
      const textW = ctx.measureText(label).width + 8;
      let toolX = x + 8;
      if (toolX + textW > width) toolX = x - textW - 8;
      let toolY = y - 10;
      if (toolY < 20) toolY = y + 20;

      ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
      ctx.fillRect(toolX, toolY - 12, textW, 16);
      ctx.fillStyle = "#f97316";
      ctx.fillText(label, toolX + 4, toolY);
    }
  }, [spectrumData, containerWidth, plotMinFreq, plotMaxFreq, hoverData]);

  // Handle Zoom via Wheel on Main Canvas
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || !spectrumData) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;

      const freqAtMouse =
        plotMinFreq + (mouseX / rect.width) * (plotMaxFreq - plotMinFreq);
      const zoomIntensity = 0.1;
      const factor = e.deltaY < 0 ? 1 - zoomIntensity : 1 + zoomIntensity;

      let currentRange = plotMaxFreq - plotMinFreq;
      let newRange = currentRange * factor;

      const maxDomain = Math.min(2000, spectrumData.maxAbsoluteFreq);

      // Boundaries
      if (newRange > maxDomain) newRange = maxDomain;
      if (newRange < 10) newRange = 10;

      let newMin = freqAtMouse - (mouseX / rect.width) * newRange;
      let newMax =
        freqAtMouse + ((rect.width - mouseX) / rect.width) * newRange;

      // Snap to edges
      if (newMin < 0) {
        newMin = 0;
        newMax = newRange;
      }
      if (newMax > maxDomain) {
        newMax = maxDomain;
        newMin = newMax - newRange;
      }

      setPlotMinFreq(newMin);
      setPlotMaxFreq(newMax);
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [spectrumData, plotMinFreq, plotMaxFreq]);

  const handleMainMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!spectrumData) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const freq = plotMinFreq + (x / rect.width) * (plotMaxFreq - plotMinFreq);

    // Find closest bin
    const binIndex = Math.floor(
      (freq / spectrumData.maxAbsoluteFreq) * spectrumData.magnitudes.length,
    );
    const mag =
      spectrumData.magnitudes[
        Math.min(spectrumData.magnitudes.length - 1, Math.max(0, binIndex))
      ];

    const normalizedMag = mag / spectrumData.maxMag;
    const logMag = Math.max(0, Math.log10(normalizedMag * 9 + 1));
    const pointY = 150 - logMag * (150 - 20); // 150 is height

    setHoverData({ freq, mag: normalizedMag, x, y: pointY });
  };

  return (
    <div
      ref={containerRef}
      className="panel-card w-full flex flex-col gap-2 p-4 bg-slate-900/60 backdrop-blur-md rounded border border-slate-800 text-slate-200 mt-4"
    >
      <canvas
        ref={mainCanvasRef}
        style={{
          width: "100%",
          height: "150px",
          display: "block",
          touchAction: "none",
        }}
        className="bg-slate-950/80 rounded border border-slate-950 cursor-crosshair"
        onMouseMove={handleMainMouseMove}
        onMouseLeave={() => setHoverData(null)}
      />

      {spectrumData && (
        <Minimap
          domainMin={0}
          domainMax={Math.min(2000, spectrumData.maxAbsoluteFreq)}
          viewMin={plotMinFreq}
          viewMax={plotMaxFreq}
          minViewSpan={10}
          onViewChange={(newMin, newMax) => {
            setPlotMinFreq(newMin);
            setPlotMaxFreq(newMax);
          }}
          renderBackground={(ctx, width, height) => {
            drawSpectrum(
              ctx,
              width,
              height,
              0,
              Math.min(2000, spectrumData.maxAbsoluteFreq),
              true,
            );
          }}
          overlayText={`Range: ${Math.round(plotMinFreq)}Hz - ${Math.round(plotMaxFreq)}Hz | Window: ${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s`}
          height={40}
        />
      )}
    </div>
  );
};
