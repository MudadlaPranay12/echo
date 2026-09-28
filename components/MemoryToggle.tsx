"use client";
// MemoryToggle — Echo's signature control.
// A real switch: keyboard operable, focusable, and it never reloads the page.
// Flipping it changes only whether organisational memory is searched; the memory
// rail then states plainly that nothing in it may be treated as precedent.

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
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      aria-label={
        on
          ? "Memory is on. Turn memory off to answer from written policy only."
          : "Memory is off. Turn memory on to search institutional memory."
      }
      className={cx(
        "flex items-center gap-2 rounded-[6px] border px-2 py-[5px]",
        "transition-[background-color,border-color,transform] duration-200 ease-out active:scale-[0.97]",
        on
          ? "border-teal-soft bg-teal-wash hover:bg-teal-wash/70"
          : "border-line bg-surface hover:border-ink4 hover:bg-sunken",
      )}
    >
      <span
        className={cx(
          "text-[11.5px] font-medium transition-colors duration-200",
          on ? "text-ink" : "text-ink2",
        )}
      >
        Memory
      </span>

      <span
        aria-hidden="true"
        className={cx(
          "relative block h-[15px] w-[27px] rounded-full transition-colors duration-200",
          on ? "bg-teal" : "bg-line2",
        )}
      >
        <span
          className={cx(
            "absolute top-[2px] block h-[11px] w-[11px] rounded-full bg-white shadow-soft",
            "transition-[left] duration-200 ease-out",
            on ? "left-[14px]" : "left-[2px]",
          )}
        />
      </span>

      <span
        aria-hidden="true"
        className={cx(
          "w-[18px] font-mono text-[10px] font-medium transition-colors duration-200",
          on ? "text-teal" : "text-ink3",
        )}
      >
        {on ? "ON" : "OFF"}
      </span>
    </button>
  );
}
