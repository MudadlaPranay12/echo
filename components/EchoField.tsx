"use client";
// EchoField — the investigation engine visual.
// 
// A sophisticated orbital background: concentric rings, radial lines, orbiting nodes.
// The central mark breathes. A recall triggers a ripple.
// Memory off quiets the mark. Reduced motion freezes everything.
// 
// All radial coordinates are precomputed to fixed precision to ensure
// server/client hydration consistency.

import { useEffect, useRef, useState } from "react";
import EchoMark from "./EchoMark";

type Props = {
  /** Bumped once per real recall by the parent; changes remount the ripple. */
  ripple?: number;
  /** With memory off the mark quiets. */
  memoryOn?: boolean;
};

// Precomputed radial coordinates (cos/sin at 30° increments, 4 decimal precision)
const RADIAL_LINES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(deg => {
  const rad = (deg * Math.PI) / 180;
  return {
    deg,
    x2: Number((50 + Math.cos(rad) * 48).toFixed(4)),
    y2: Number((50 + Math.sin(rad) * 48).toFixed(4)),
  };
});
const INNER_NODES = [0, 90, 180, 270].map(deg => {
  const rad = (deg * Math.PI) / 180;
  return {
    deg,
    cx: Number((50 + Math.cos(rad) * 30).toFixed(4)),
    cy: Number((50 + Math.sin(rad) * 30).toFixed(4)),
  };
});
const OUTER_NODES = [45, 135, 225, 315].map(deg => {
  const rad = (deg * Math.PI) / 180;
  return {
    deg,
    cx: Number((50 + Math.cos(rad) * 42).toFixed(4)),
    cy: Number((50 + Math.sin(rad) * 42).toFixed(4)),
  };
});

export default function EchoField({ ripple = 0, memoryOn = true }: Props) {
  const markRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!markRef.current || reducedMotion) return;
    const el = markRef.current;
    let rotation = 0;
    const animate = () => {
      rotation += 0.02;
      el.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
      requestAnimationFrame(animate);
    };
    const id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, [reducedMotion]);

  return (
    <div className="echo-field" data-memory={memoryOn ? "on" : "off"} aria-hidden="true">
      {/* Orbital rings - rotating slowly */}
      <div
        ref={markRef}
        className="absolute top-1/2 left-1/2 w-[clamp(400px,60vw,800px)] h-[clamp(400px,60vw,800px)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ opacity: memoryOn ? 1 : 0.3 }}
      >
        {/* Radial lines */}
        {RADIAL_LINES.map(({ deg, x2, y2 }) => (
          <line
            key={deg}
            x1="50%"
            y1="50%"
            x2={`${x2}%`}
            y2={`${y2}%`}
            stroke="rgba(66, 211, 193, 0.03)"
            strokeWidth="0.5"
          />
        ))}
        {/* Inner orbital nodes */}
        {INNER_NODES.map(({ deg, cx, cy }) => (
          <circle
            key={deg}
            cx={`${cx}%`}
            cy={`${cy}%`}
            r="3"
            fill="rgba(66, 211, 193, 0.15)"
          />
        ))}
        {/* Outer orbital nodes */}
        {OUTER_NODES.map(({ deg, cx, cy }) => (
          <circle
            key={deg}
            cx={`${cx}%`}
            cy={`${cy}%`}
            r="2"
            fill="rgba(66, 211, 193, 0.1)"
          />
        ))}
      </div>

      <div className="echo-mark">
        {/* the recall, travelling out from the mark */}
        {ripple > 0 && memoryOn && <span key={ripple} className="echo-ripple" />}

        <span className="echo-ring" style={{ inset: "0%" }} />
        <span className="echo-ring" style={{ inset: "9%" }} />

        <div className="echo-mark-glyph">
          <EchoMark size={32} className="text-inherit" accent="#7fe3d3" />
        </div>
      </div>
    </div>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}