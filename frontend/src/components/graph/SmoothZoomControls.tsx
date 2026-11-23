import React, { useEffect } from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';
import { Maximize2, Minus, Plus } from 'lucide-react';

interface SmoothZoomControlsProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Replaces clunky step-jumping controls with silky damped wheel zoom & 300ms animated zoom buttons.
 */
export const SmoothZoomControls: React.FC<SmoothZoomControlsProps> = ({ containerRef }) => {
  const { zoomIn, zoomOut, fitView, getViewport, setViewport } = useReactFlow();
  const { zoom } = useViewport();

  // Silky momentum-interpolated wheel zoom around cursor (zero jarring jumps on mouse wheels)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let targetZoom = getViewport().zoom;
    let targetX = getViewport().x;
    let targetY = getViewport().y;
    let rafId: number | null = null;
    let active = false;

    const animate = () => {
      const curr = getViewport();
      const dz = targetZoom - curr.zoom;
      const dx = targetX - curr.x;
      const dy = targetY - curr.y;

      if (Math.abs(dz) < 0.0015 && Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4) {
        setViewport({ x: targetX, y: targetY, zoom: targetZoom }, { duration: 0 });
        active = false;
        rafId = null;
        return;
      }

      // Smooth exponential easing (lerp factor 0.22 at 60fps feels ultra-fluid)
      setViewport(
        {
          x: curr.x + dx * 0.22,
          y: curr.y + dy * 0.22,
          zoom: curr.zoom + dz * 0.22,
        },
        { duration: 0 }
      );
      rafId = requestAnimationFrame(animate);
    };

    const onWheel = (e: WheelEvent) => {
      // Only intercept zoom scrolls over the React Flow pane
      const targetEl = e.target as HTMLElement | null;
      if (!targetEl?.closest('.react-flow__pane, .react-flow__viewport')) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;

      if (!active) {
        const cur = getViewport();
        targetZoom = cur.zoom;
        targetX = cur.x;
        targetY = cur.y;
      }

      // Normalize delta across mouse wheel & trackpad pinch smoothly
      const clampedDelta = Math.max(-120, Math.min(120, e.deltaY));
      const factor = Math.exp(-clampedDelta * 0.0022);
      const nextZoom = Math.min(1.85, Math.max(0.28, targetZoom * factor));
      const ratio = nextZoom / targetZoom;

      // Keep point under mouse cursor locked while zooming smoothly
      targetX = pointerX - (pointerX - targetX) * ratio;
      targetY = pointerY - (pointerY - targetY) * ratio;
      targetZoom = nextZoom;

      if (!active) {
        active = true;
        rafId = requestAnimationFrame(animate);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => {
      el.removeEventListener('wheel', onWheel, { capture: true });
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [containerRef, getViewport, setViewport]);

  return (
    <div
      className="absolute bottom-4 right-4 z-10 flex items-center gap-1 p-1 rounded-xl shadow-lg"
      style={{ backgroundColor: 'var(--s1)', border: '1px solid var(--border-strong)' }}
    >
      <button
        type="button"
        onClick={() => zoomOut({ duration: 280 })}
        title="Zoom out"
        className="w-7 h-7 rounded-lg flex items-center justify-center text-t2 hover:text-t1 hover:bg-s2 transition-colors"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>

      <span className="px-1.5 font-mono text-[10px] font-semibold text-t2 min-w-[40px] text-center select-none">
        {Math.round(zoom * 100)}%
      </span>

      <button
        type="button"
        onClick={() => zoomIn({ duration: 280 })}
        title="Zoom in"
        className="w-7 h-7 rounded-lg flex items-center justify-center text-t2 hover:text-t1 hover:bg-s2 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-4 mx-0.5" style={{ backgroundColor: 'var(--border)' }} />

      <button
        type="button"
        onClick={() => fitView({ padding: 0.11, duration: 420 })}
        title="Fit graph smoothly"
        className="w-7 h-7 rounded-lg flex items-center justify-center text-t2 hover:text-t1 hover:bg-s2 transition-colors"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
