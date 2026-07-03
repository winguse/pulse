import React, { useRef, useEffect, useState } from 'react';

interface BpmTrendChartProps {
  bpmValues: { time: number; bpm: number }[];
  duration: number;
  minBpm: number;
  maxBpm: number;
  onSeek?: (time: number) => void;
}

export const BpmTrendChart: React.FC<BpmTrendChartProps> = ({
  bpmValues,
  duration,
  minBpm,
  maxBpm,
  onSeek,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const [hoverPoint, setHoverPoint] = useState<{ time: number; bpm: number; x: number; y: number } | null>(null);

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

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || bpmValues.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Find the closest point in bpmValues
    let closestPoint = bpmValues[0];
    let minDistance = Infinity;
    let closestX = 0;
    let closestY = 0;

    const yMin = Math.max(0, minBpm - 10);
    const yMax = maxBpm + 10;
    const yRange = yMax - yMin;
    const height = 128;

    bpmValues.forEach((val) => {
      const x = (val.time / duration) * rect.width;
      const y = height - ((val.bpm - yMin) / yRange) * (height - 20) - 10;
      const dist = Math.hypot(x - mouseX, y - mouseY);

      if (dist < minDistance) {
        minDistance = dist;
        closestPoint = val;
        closestX = x;
        closestY = y;
      }
    });

    // Hover threshold of 35px
    if (minDistance < 35) {
      setHoverPoint({
        time: closestPoint.time,
        bpm: closestPoint.bpm,
        x: closestX,
        y: closestY,
      });

      // Move main canvas cursor accordingly
      if (onSeek) {
        onSeek(closestPoint.time);
      }
    } else {
      setHoverPoint(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverPoint(null);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = containerWidth;
    const height = 128; // Fixed height matching h-32 layout

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    if (bpmValues.length === 0) {
      // Draw placeholder text
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Accumulating heartbeat data for trend plot...', width / 2, height / 2);
      return;
    }

    // Determine Y scale bounds (add some padding around min/max BPM)
    const yMin = Math.max(0, minBpm - 10);
    const yMax = maxBpm + 10;
    const yRange = yMax - yMin;

    // Draw background grid lines (horizontal BPM markers)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';

    const gridLines = [60, 80, 100, 120, 140, 160, 180, 200];
    gridLines.forEach((bpm) => {
      if (bpm < yMin || bpm > yMax) return;
      const y = height - ((bpm - yMin) / yRange) * (height - 20) - 10;
      
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      ctx.fillText(`${bpm} BPM`, 4, y - 2);
    });

    // Draw grid lines for time
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    const numTimeLines = 5;
    for (let i = 1; i < numTimeLines; i++) {
      const t = (i / numTimeLines) * duration;
      const x = (t / duration) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw the BPM line
    ctx.strokeStyle = '#06b6d4'; // Cyan-500
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(6, 182, 212, 0.6)';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.beginPath();

    let first = true;
    bpmValues.forEach((val) => {
      const x = (val.time / duration) * width;
      const y = height - ((val.bpm - yMin) / yRange) * (height - 20) - 10;

      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Reset shadow
    ctx.shadowBlur = 0;

    // Draw dots at each data point
    ctx.fillStyle = '#22d3ee'; // Cyan-400
    bpmValues.forEach((val) => {
      const x = (val.time / duration) * width;
      const y = height - ((val.bpm - yMin) / yRange) * (height - 20) - 10;
      
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Draw hover highlight if active
    if (hoverPoint) {
      const hx = (hoverPoint.time / duration) * width;
      const hy = height - ((hoverPoint.bpm - yMin) / yRange) * (height - 20) - 10;

      // Vertical line
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hx, 0);
      ctx.lineTo(hx, height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Outer glow circle
      ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
      ctx.beginPath();
      ctx.arc(hx, hy, 8, 0, 2 * Math.PI);
      ctx.fill();

      // Inner highlighted dot
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // DRAW TOOLTIP DIRECTLY ON CANVAS
      const tooltipW = 78;
      const tooltipH = 24;
      let tx = hx - tooltipW / 2;
      let ty = hy - tooltipH - 6;

      // Bound checking
      if (tx < 5) tx = 5;
      if (tx + tooltipW > width - 5) tx = width - tooltipW - 5;
      if (ty < 5) ty = hy + 6; // Draw below if overflows top

      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(tx, ty, tooltipW, tooltipH, 3);
      } else {
        ctx.rect(tx, ty, tooltipW, tooltipH);
      }
      ctx.fill();
      ctx.stroke();

      // Tooltip Text
      ctx.fillStyle = '#22d3ee';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${hoverPoint.bpm.toFixed(2)} BPM`, tx + tooltipW / 2, ty + 9);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '6.5px monospace';
      ctx.fillText(`${hoverPoint.time.toFixed(2)}s`, tx + tooltipW / 2, ty + 18);
    }
  }, [bpmValues, duration, minBpm, maxBpm, containerWidth, hoverPoint]);

  return (
    <div
      ref={containerRef}
      className="w-full flex flex-col gap-1.5 p-4 bg-slate-900/60 backdrop-blur-md rounded border border-slate-800 text-slate-200"
    >
      <div className="relative w-full">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '128px', display: 'block', boxSizing: 'border-box' }}
          className="bpm-trend-canvas bg-slate-950/80 rounded border border-slate-950 cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </div>
    </div>
  );
};
