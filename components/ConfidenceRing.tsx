"use client";
// ConfidenceRing — a compact evidence/confidence ring.
// The ring represents evidence weight (support count).
// Ring state comes ONLY from deterministic confidence:
// low, medium, higher, high, or the exact existing scale.
// Never convert it to a fake probability.

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

const CONFIDENCE_COLORS: Record<string, string> = {
  "none": "#4a5361",           // ink4
  "low (very small sample)": "#df5d5d", // stop
  "medium (small sample)": "#d8a343",   // warn/brass
  "higher": "#42d3c1",         // teal
  "high": "#43d19e",           // good
};

export default function ConfidenceRing({ confidence, cases, approved, className }: Props) {
  const color = CONFIDENCE_COLORS[confidence] ?? CONFIDENCE_COLORS["none"];
  const progress = confidence === "none" ? 0
    : confidence.startsWith("low") ? 0.25
    : confidence.startsWith("medium") ? 0.5
    : confidence.startsWith("higher") ? 0.75
    : 1;

  const ringStyle = {
    "--ring-progress": `${progress * 100}%`,
    "--ring-color": color,
  } as React.CSSProperties;

  const shortConfidence = confidence
    .replace(" (very small sample)", "")
    .replace(" (small sample)", "")
    .toUpperCase();

  return (
    <div className={`echo-confidence-ring ${className ?? ""}`} style={ringStyle}>
      <span className="echo-confidence-ring__label">{approved}/{cases}</span>
      <span className="echo-confidence-ring__sub">{shortConfidence}</span>
    </div>
  );
}