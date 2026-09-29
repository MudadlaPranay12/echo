"use client";
// ConditionChain — a visually connected chain.
// exception pattern → condition → comparable cases → observed outcome
// Uses thin connectors. No causality claims.
// Animation: exception appears first, condition 150-200ms later,
// evidence 150-200ms later, outcome last. Total ~900ms.

import { useEffect, useState } from "react";

type Props = {
  /** The exception pattern name (e.g., "Fuel-surcharge mismatch"). */
  exceptionPattern: string;
  /** The condition that decided the precedents (e.g., "Annexure attached"). */
  condition: string;
  /** Number of comparable cases. */
  caseCount: number;
  /** Approved count. */
  approvedCount: number;
  /** Total comparable cases. */
  totalCases: number;
  /** Optional className for spacing. */
  className?: string;
};

export default function ConditionChain({
  exceptionPattern,
  condition,
  caseCount,
  approvedCount,
  totalCases,
  className,
}: Props) {
  const [visibleSteps, setVisibleSteps] = useState<Set<number>>(new Set());

  useEffect(() => {
    const steps = [0, 1, 2, 3];
    steps.forEach((step, i) => {
      setTimeout(() => {
        setVisibleSteps((prev) => new Set([...prev, step]));
      }, i * 180);
    });
  }, [exceptionPattern, condition, caseCount, approvedCount]);

  const steps: Array<{
    id: number;
    label: string;
    value: string;
    detail?: string;
  }> = [
    {
      id: 0,
      label: "Exception",
      value: exceptionPattern,
    },
    {
      id: 1,
      label: "Condition",
      value: condition,
    },
    {
      id: 2,
      label: "Evidence",
      value: `${caseCount} comparable case${caseCount === 1 ? "" : "s"}`,
      detail: `${approvedCount} of ${totalCases} approved`,
    },
    {
      id: 3,
      label: "Observed outcome",
      value: `${approvedCount} / ${totalCases} approved`,
    },
  ];

  return (
    <div className={`echo-condition-chain ${className ?? ""}`}>
      {steps.map((step) => {
        const isVisible = visibleSteps.has(step.id);
        if (!isVisible && step.id > 0) return null;

        return (
          <div key={step.id} className="echo-condition-chain__step" data-step={step.id}>
            <div className="echo-condition-chain__connector" />
            <div className="echo-condition-chain__node" />
            <div className="echo-condition-chain__content">
              <div className="echo-condition-chain__label">{step.label}</div>
              <div className="echo-condition-chain__value">{step.value}</div>
              {step.detail && (
                <div className="echo-condition-chain__detail">{step.detail}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}