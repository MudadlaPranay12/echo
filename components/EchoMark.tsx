"use client";
// EchoMark — memory → pattern → decision → memory.
//
// An open ring with one directional return at its end: the loop never quite
// closes on the first pass, it completes one turn and comes back to where it
// started. The filled node on the ring is the decision point that feeds the
// next cycle. Abstract, geometric, and legible at 20px.

type Props = {
  size?: number;
  className?: string;
  /**
   * Colour of the decision node. Defaults to the live teal token rather than a
   * hex literal, so the mark follows the active theme. Only the empty state's
   * muted mark passes an explicit ink value.
   */
  accent?: string;
};

export default function EchoMark({ size = 24, className = "", accent = "var(--teal)" }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="Echo"
    >
      {/* the loop, open at the top-right */}
      <path
        d="M16 4.6A11.4 11.4 0 1 1 4.6 16"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* the return */}
      <path
        d="M2.1 15.4 4.6 18.4 7.1 15.4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* the decision node the loop returns through */}
      <circle cx="16" cy="4.6" r="3" fill={accent} />
    </svg>
  );
}
