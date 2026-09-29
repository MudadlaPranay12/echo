"use client";
// MemoryToggle — Echo's mode selector.
// Not a switch with a label beside it: a system mode. On, institutional memory
// is searched and the answer can be compared against precedent. Off, the answer
// rests on the written policy alone and the rail says so. The two states are
// stated in words, the track carries a single gradient, and the knob overshoots
// as it travels. Keyboard operable, and aria-pressed always states the truth.

import { cx } from "./ui";

export default function MemoryToggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      data-on={on ? "true" : "false"}
      aria-label={
        on
          ? "Institutional memory is active. Switch to written policy only."
          : "Written policy only. Switch on to search institutional memory."
      }
      className="echo-switch-group flex h-[44px] shrink-0 items-center gap-2.5 rounded-[12px] px-3"
    >
      <span aria-hidden="true" className="echo-switch">
        <span className="echo-switch-knob" />
      </span>

      <span
        className={cx(
          "echo-switch-label font-mono text-[13px] font-semibold tracking-[0.14em]",
          on ? "text-teal" : "text-ink3",
        )}
      >
        <span className="echo-switch-label-on">MEMORY ACTIVE</span>
        <span className="echo-switch-label-off">POLICY ONLY</span>
      </span>
    </button>
  );
}
