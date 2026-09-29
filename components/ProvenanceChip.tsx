"use client";
// ProvenanceChip — small reusable trust markers.
// COMPUTED (teal) — deterministic calculations
// EVIDENCE (neutral) — Hindsight-retained/retrieved historical facts
// SYNTHESIZED (restrained muted indigo/iris) — LLM-generated interpretation

type Kind = "computed" | "evidence" | "synthesized";

type Props = {
  kind: Kind;
  /** Optional text to show alongside the kind label. */
  children?: React.ReactNode;
  /** Optional className for spacing. */
  className?: string;
};

const KIND_LABELS: Record<string, string> = {
  computed: "COMPUTED",
  evidence: "EVIDENCE",
  synthesized: "SYNTHESIZED",
};

const KIND_CLASSES: Record<string, string> = {
  computed: "echo-provenance--computed",
  evidence: "echo-provenance--evidence",
  synthesized: "echo-provenance--synthesized",
};

export default function ProvenanceChip({ kind, children, className }: Props) {
  return (
    <span className={`echo-provenance ${KIND_CLASSES[kind]} ${className ?? ""}`}>
      {KIND_LABELS[kind]}
      {children && <span>{children}</span>}
    </span>
  );
}