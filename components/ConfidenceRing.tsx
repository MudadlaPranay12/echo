"use client";
// ConfidenceRing — an SVG evidence/confidence ring.
// A dim background track and one coloured progress arc drawn from the REAL
// approved/total ratio (stroke-dasharray/dashoffset), not from a tier label.
// The "5/5" centre label is absolutely positioned to the SVG's own bounding
// box only. Confidence tiers only pick the ARC COLOUR — nothing else here.

type Props = {
  /** The deterministic confidence label from the backend. */
  confidence: string;
  /** Number of comparable cases (support count). */
  cases: number;
  /** Number of approved cases. */
  approved: number;
  /** Optional className for positioning. */
  className?: string;
};

// Confidence tiers only pick the ARC COLOUR — nothing else here. The colour is a
// theme variable, not a hex literal, so the ring reads correctly in both themes.
const CONFIDENCE_COLORS: Record<string, string> = {
  "none": "var(--ink-4)",                  // no evidence
  "low (very small sample)": "var(--stop)", // thin evidence
  "medium (small sample)": "var(--warn)",  // partial support
  "higher": "var(--teal)",                  // strong support
  "high": "var(--good)",                    // strongest support
};

const SIZE = 104;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export default function ConfidenceRing({ confidence, cases, approved, className }: Props) {
  const color = CONFIDENCE_COLORS[confidence] ?? CONFIDENCE_COLORS["none"];
  /* The arc reflects the real fraction of comparable decisions approved. */
  const ratio = cases > 0 ? Math.min(approved / cases, 1) : 0;
  const offset = C * (1 - ratio);

  return (
    <div
      className={`echo-confidence-ring ${className ?? ""}`}
      role="img"
      aria-label={`${approved} of ${cases} comparable cases approved`}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle className="echo-confidence-ring__track" cx={SIZE / 2} cy={SIZE / 2} r={R} />
        <circle
          className="echo-confidence-ring__arc"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={color}
          strokeDasharray={C}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <span className="echo-confidence-ring__label">
        {approved}/{cases}
      </span>
    </div>
  );
}