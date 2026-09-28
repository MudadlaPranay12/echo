"use client";
// ToastHost — small, quiet confirmations. Never a modal, never a banner.

import type { ToastItem } from "./echoTypes";

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="text-good">
      <path
        d="M2.4 6.3 4.8 8.7 9.6 3.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Info() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="text-teal">
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 5.4v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6" cy="3.5" r="0.7" fill="currentColor" />
    </svg>
  );
}

export default function ToastHost({ items }: { items: ToastItem[] }) {
  return (
    <div
      className="pointer-events-none fixed right-4 top-[56px] z-50 flex flex-col items-end gap-2"
      role="status"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="echo-rise flex items-center gap-2 rounded-[7px] border border-line bg-surface px-3 py-2 shadow-panel"
        >
          {t.tone === "ok" ? <Check /> : <Info />}
          <span className="text-[12px] text-ink">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
