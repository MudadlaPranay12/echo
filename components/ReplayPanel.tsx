"use client";
// ReplayPanel — a deterministic comparison of the same invoice question
// under the condition that decided its precedents versus any other condition.
// Replay is comparison, never prediction.
// Uses the same Hindsight-centric memory architecture.

import { useState, useEffect, useMemo } from "react";
import { computeReplay, type Replay } from "../lib/replay";

type Props = {
  /** The comparable cases returned by recall_exception_pattern. */
  cases: Array<{
    id: string;
    outcome: "approved" | "rejected";
    condition?: string | null;
  }>;
  /** Current observed condition from the evidence. */
  currentCondition?: string;
};

export default function ReplayPanel({ cases, currentCondition }: Props) {
  const [replay, setReplay] = useState<Replay | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<string>(currentCondition ?? "");
  const [alternativeCondition, setAlternativeCondition] = useState<string>("");

  // Compute replay when cases or conditions change
  useEffect(() => {
    const r = computeReplay(cases);
    setReplay(r);
  }, [cases]);

  // Extract unique conditions from cases (excluding null/empty)
  const availableConditions = useMemo(() => {
    const conditions = new Set<string>();
    for (const c of cases) {
      const norm = (c.condition ?? "").trim().toLowerCase();
      if (norm) conditions.add(c.condition!.trim());
    }
    return Array.from(conditions).sort();
  }, [cases]);

  // Determine available conditions for the dropdowns
  const currentOptions = availableConditions;
  const alternativeOptions = availableConditions.filter(
    (c) => c.toLowerCase() !== (selectedCondition ?? "").toLowerCase()
  );

  const handleCurrentChange = (condition: string) => {
    setSelectedCondition(condition);
  };

  const handleAlternativeChange = (condition: string) => {
    setAlternativeCondition(condition);
  };

  if (!replay) return null;

  const hasReplayData = replay.available && (replay.current.count > 0 || replay.alternative.count > 0);

  if (!hasReplayData) {
    return (
      <div className="echo-replay">
        <div className="echo-replay__header">
          <span className="echo-replay__title">Echo Replay</span>
        </div>
        <div className="echo-memory-off">
          <div className="echo-memory-off__icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <div className="echo-memory-off__title">Replay Unavailable</div>
          <p className="echo-memory-off__text">
            No comparable historical practice was retrieved for this condition.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="echo-replay">
      <div className="echo-replay__header">
        <span className="echo-replay__title">Echo Replay</span>
      </div>

      {/* Condition Controls */}
      <div className="echo-replay__controls" style={{ marginBottom: 16 }}>
        <div className="echo-replay__control-group" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-3)", alignSelf: "center", marginRight: 8 }}>
            Current:
          </span>
          <select
            value={selectedCondition}
            onChange={(e) => handleCurrentChange(e.target.value)}
            className="echo-replay__control"
            style={{ minWidth: 200 }}
          >
            {replay.current.caseIds.length > 0 && (
              <option value={replay.current.label}>{replay.current.label}</option>
            )}
            {currentOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="echo-replay__control-group" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-3)", alignSelf: "center", marginRight: 8 }}>
            Replay:
          </span>
          <select
            value={alternativeCondition}
            onChange={(e) => handleAlternativeChange(e.target.value)}
            className="echo-replay__control"
            style={{ minWidth: 200 }}
          >
            {replay.alternative.caseIds.length > 0 && (
              <option value={replay.alternative.label}>{replay.alternative.label}</option>
            )}
            {alternativeOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value="">Any other recorded condition</option>
          </select>
        </div>
      </div>

      {/* Comparison */}
      <div className="echo-replay__comparison">
        {/* Current Condition Side */}
        <div className={`echo-replay__side ${replay.current.count > 0 ? "echo-replay__side--current" : ""}`}>
          <div className="echo-replay__side-label">
            {replay.current.count > 0 ? replay.current.label : "Observed condition"}
          </div>
          {replay.current.count > 0 ? (
            <>
              <div className="echo-replay__stat">
                <span className="echo-replay__stat-value">{replay.current.count}</span>
                <span className="echo-replay__stat-label">cases</span>
              </div>
              <div className="echo-replay__stat">
                <span className="echo-replay__stat-value">{replay.current.approved}/{replay.current.count}</span>
                <span className="echo-replay__stat-label">approved</span>
              </div>
              {replay.current.approvalRate !== null && (
                <div className="echo-replay__stat">
                  <span className="echo-replay__stat-value">{replay.current.approvalRate}%</span>
                  <span className="echo-replay__stat-label">approval rate</span>
                </div>
              )}
              <div className="echo-replay__confidence">
                <span className="echo-provenance echo-provenance--computed">COMPUTED</span>
                {replay.current.confidence}
              </div>
              <div className="echo-replay__case-ids" style={{ marginTop: 8, fontSize: 11, color: "var(--ink-4)" }}>
                {replay.current.caseIds.join(" · ")}
              </div>
            </>
          ) : (
            <p style={{ color: "var(--ink-3)", fontSize: 13 }}>No precedent under this condition.</p>
          )}
        </div>

        {/* Alternative Condition Side */}
        <div className="echo-replay__side">
          <div className="echo-replay__side-label">
            {replay.alternative.count > 0 ? replay.alternative.label : "Any other condition"}
          </div>
          {replay.alternative.count > 0 ? (
            <>
              <div className="echo-replay__stat">
                <span className="echo-replay__stat-value">{replay.alternative.count}</span>
                <span className="echo-replay__stat-label">cases</span>
              </div>
              <div className="echo-replay__stat">
                <span className="echo-replay__stat-value">{replay.alternative.approved}/{replay.alternative.count}</span>
                <span className="echo-replay__stat-label">approved</span>
              </div>
              {replay.alternative.approvalRate !== null && (
                <div className="echo-replay__stat">
                  <span className="echo-replay__stat-value">{replay.alternative.approvalRate}%</span>
                  <span className="echo-replay__stat-label">approval rate</span>
                </div>
              )}
              <div className="echo-replay__confidence">
                <span className="echo-provenance echo-provenance--computed">COMPUTED</span>
                {replay.alternative.confidence}
              </div>
              <div className="echo-replay__case-ids" style={{ marginTop: 8, fontSize: 11, color: "var(--ink-4)" }}>
                {replay.alternative.caseIds.join(" · ")}
              </div>
            </>
          ) : (
            <p style={{ color: "var(--ink-3)", fontSize: 13 }}>No comparable historical precedent was found under alternative conditions.</p>
          )}
        </div>
      </div>

      {/* Explanation */}
      <div className="echo-replay__explanation">
        {replay.explanation}
      </div>

      <p style={{ marginTop: 12, fontSize: 11, color: "var(--ink-4)", fontStyle: "italic" }}>
        A replay compares recorded outcomes — it does not predict how the current invoice will be decided.
      </p>
    </div>
  );
}