"use client";
// EchoField — the investigation engine visual.
//
// A sophisticated orbital background: concentric rings, radial lines, orbiting nodes.
// The central mark breathes. A recall triggers a ripple.
// Memory off quiets the mark. Reduced motion freezes everything.

import { useEffect, useRef, useState } from "react";
import EchoMark from "./EchoMark";

type Props = {
  /** Bumped once per real recall by the parent; changes remount the ripple. */
  ripple?: number;
  /** With memory off the mark quiets. */
  memoryOn?: boolean;
};

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
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
          <line
            key={deg}
            x1="50%"
            y1="50%"
            x2={`${50 + Math.cos((deg * Math.PI) / 180) * 48}%`}
            y2={`${50 + Math.sin((deg * Math.PI) / 180) * 48}%`}
            stroke="rgba(66, 211, 193, 0.03)"
            strokeWidth="0.5"
          />
        ))}
        {/* Inner orbital nodes */}
        {[0, 90, 180, 270].map((deg) => (
          <circle
            key={deg}
            cx={`${50 + Math.cos((deg * Math.PI) / 180) * 30}%`}
            cy={`${50 + Math.sin((deg * Math.PI) / 180) * 30}%`}
            r="3"
            fill="rgba(66, 211, 193, 0.15)"
          />
        ))}
        {/* Outer orbital nodes */}
        {[45, 135, 225, 315].map((deg) => (
          <circle
            key={deg}
            cx={`${50 + Math.cos((deg * Math.PI) / 180) * 42}%`}
            cy={`${50 + Math.sin((deg * Math.PI) / 180) * 42}%`}
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
