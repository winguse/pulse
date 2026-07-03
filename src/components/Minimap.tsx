import React, { useRef, useEffect, useState } from 'react';

interface MinimapProps {
  domainMin: number;
  domainMax: number;
  viewMin: number;
  viewMax: number;
  minViewSpan?: number; // minimum allowed range (e.g. 0.5s or 10Hz)
  onViewChange: (newMin: number, newMax: number) => void;
  renderBackground: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  overlayText?: string;
  renderOverlay?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  height?: number; // default 40
}

export const Minimap: React.FC<MinimapProps> = ({
  domainMin,
  domainMax,
  viewMin,
  viewMax,
  minViewSpan = 0,
  onViewChange,
  renderBackground,
  overlayText,
  renderOverlay,
  height = 40,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  const dragModeRef = useRef<'left' | 'right' | 'pan' | 'none'>('none');
  const dragStartXRef = useRef<number>(0);
  const dragStartViewMinRef = useRef<number>(0);
  const dragStartViewMaxRef = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      if (entries.length > 0) setContainerWidth(Math.floor(entries[0].contentRect.width));
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const domainSpan = domainMax - domainMin;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = containerWidth;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Render provided background
    renderBackground(ctx, width, height);

    // Draw view window overlay
    if (domainSpan > 0) {
      const viewX = ((viewMin - domainMin) / domainSpan) * width;
      const viewW = ((viewMax - viewMin) / domainSpan) * width;

      ctx.fillStyle = 'rgba(192, 132, 252, 0.2)'; // purple tint
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 1.5;
      ctx.fillRect(viewX, 0, viewW, height);
      ctx.strokeRect(viewX, 0.5, viewW, height - 1);

      // Draw handles
      const drawHandle = (x: number) => {
        ctx.fillStyle = '#c084fc';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x - 3, (height - 18) / 2, 6, 18, 2);
        } else {
          ctx.rect(x - 3, (height - 18) / 2, 6, 18);
        }
        ctx.fill();
      };
      drawHandle(viewX);
      drawHandle(viewX + viewW);
    }

    // Render optional custom overlays (e.g., playhead)
    if (renderOverlay) {
      renderOverlay(ctx, width, height);
    }

    // Draw overlay text if provided
    if (overlayText) {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.font = 'bold 8px monospace';
      const textW = ctx.measureText(overlayText).width + 8;
      ctx.fillRect(4, 3, textW, 11);
      
      ctx.fillStyle = '#c084fc';
      ctx.fillText(overlayText, 8, 11);
      ctx.restore();
    }
  }, [containerWidth, height, domainMin, domainMax, domainSpan, viewMin, viewMax, renderBackground, renderOverlay, overlayText]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || domainSpan <= 0) return;
    canvas.setPointerCapture(e.pointerId);

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    const viewX = ((viewMin - domainMin) / domainSpan) * width;
    const viewW = ((viewMax - viewMin) / domainSpan) * width;

    const handleTol = 12;

    if (Math.abs(x - viewX) <= handleTol) {
      dragModeRef.current = 'left';
    } else if (Math.abs(x - (viewX + viewW)) <= handleTol) {
      dragModeRef.current = 'right';
    } else if (x > viewX && x < viewX + viewW) {
      dragModeRef.current = 'pan';
    } else {
      // Clicked outside, jump center
      const clickVal = domainMin + (x / width) * domainSpan;
      const range = viewMax - viewMin;
      let newMin = clickVal - range / 2;
      let newMax = clickVal + range / 2;
      
      if (newMin < domainMin) {
        newMin = domainMin;
        newMax = domainMin + range;
      }
      if (newMax > domainMax) {
        newMax = domainMax;
        newMin = domainMax - range;
      }
      
      onViewChange(newMin, newMax);
      
      dragModeRef.current = 'pan';
      dragStartXRef.current = e.clientX;
      dragStartViewMinRef.current = newMin;
      dragStartViewMaxRef.current = newMax;
      return;
    }

    dragStartXRef.current = e.clientX;
    dragStartViewMinRef.current = viewMin;
    dragStartViewMaxRef.current = viewMax;
    e.preventDefault();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || domainSpan <= 0) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    if (dragModeRef.current === 'none') {
      const viewX = ((viewMin - domainMin) / domainSpan) * width;
      const viewW = ((viewMax - viewMin) / domainSpan) * width;
      const handleTol = 12;

      if (Math.abs(x - viewX) <= handleTol || Math.abs(x - (viewX + viewW)) <= handleTol) {
        canvas.style.cursor = 'ew-resize';
      } else if (x > viewX && x < viewX + viewW) {
        canvas.style.cursor = 'grab';
      } else {
        canvas.style.cursor = 'pointer';
      }
      return;
    }

    const dVal = ((e.clientX - dragStartXRef.current) / width) * domainSpan;

    if (dragModeRef.current === 'pan') {
      const range = dragStartViewMaxRef.current - dragStartViewMinRef.current;
      let newMin = dragStartViewMinRef.current + dVal;
      let newMax = dragStartViewMaxRef.current + dVal;
      
      if (newMin < domainMin) {
        newMin = domainMin;
        newMax = domainMin + range;
      }
      if (newMax > domainMax) {
        newMax = domainMax;
        newMin = domainMax - range;
      }
      onViewChange(newMin, newMax);
    } else if (dragModeRef.current === 'left') {
      let newMin = dragStartViewMinRef.current + dVal;
      if (newMin < domainMin) newMin = domainMin;
      if (newMin > dragStartViewMaxRef.current - minViewSpan) {
        newMin = dragStartViewMaxRef.current - minViewSpan;
      }
      onViewChange(newMin, dragStartViewMaxRef.current);
    } else if (dragModeRef.current === 'right') {
      let newMax = dragStartViewMaxRef.current + dVal;
      if (newMax > domainMax) newMax = domainMax;
      if (newMax < dragStartViewMinRef.current + minViewSpan) {
        newMax = dragStartViewMinRef.current + minViewSpan;
      }
      onViewChange(dragStartViewMinRef.current, newMax);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragModeRef.current = 'none';
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.releasePointerCapture(e.pointerId);
      canvas.style.cursor = 'pointer';
    }
  };

  return (
    <div ref={containerRef} className="w-full">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px`, display: 'block', boxSizing: 'border-box', touchAction: 'none' }}
        className="bg-slate-950/50 rounded cursor-ew-resize border border-slate-950/80"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
};
