"use client";
// ThemeToggle — a three-state theme selector: SYSTEM → LIGHT → DARK → SYSTEM.
//
// A *preference*, not a binary switch, because "follow the operating system" is
// a real third choice and must be visibly different from an explicit pick.
//
// The resolved theme and the raw preference are two different attributes, and
// only the bootstrap script in app/layout.tsx writes the resolved one before
// first paint:
//
//   data-theme-pref  system | light | dark   <- what the user chose
//   data-theme       light  | dark           <- what is actually painted
//
// So the control can show which of the three is selected, and in SYSTEM mode it
// can follow a live `prefers-color-scheme` change without a reload.

import { useCallback, useEffect, useRef, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
type Resolved = "light" | "dark";

export const THEME_KEY = "echo-theme";

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/* --------------------------------------------------------------- the bridge */

/** What the bootstrap script installed. Absent if the script threw. */
type Bridge = {
  pref: ThemePref;
  resolve: () => Resolved;
  set: (v: ThemePref) => void;
};

declare global {
  interface Window {
    __echoTheme?: Bridge;
  }
}

function readPref(): ThemePref {
  const v = document.documentElement.getAttribute("data-theme-pref");
  return v === "light" || v === "dark" ? v : "system";
}

function readResolved(): Resolved {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/* ------------------------------------------------------------------- icons */

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1.4v1.6M8 13v1.6M14.6 8H13M3 8H1.4M12.66 3.34l-1.13 1.13M4.47 11.53l-1.13 1.13M12.66 12.66l-1.13-1.13M4.47 4.47 3.34 3.34"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.4 9.6A5.6 5.6 0 0 1 6.4 2.6a5.6 5.6 0 1 0 7 7Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A monitor: "follow the system". */
function SystemIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.6" y="2.6" width="12.8" height="8.6" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.6 13.8h4.8M8 11.2v2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function Glyph({ pref, resolved }: { pref: ThemePref; resolved: Resolved }) {
  if (pref === "light") return <SunIcon />;
  if (pref === "dark") return <MoonIcon />;
  /* In SYSTEM the button shows the monitor — the choice — and the split face
     inside it shows what the OS is currently asking for. */
  return (
    <span className="relative inline-flex">
      <SystemIcon />
      <span
        aria-hidden="true"
        className="echo-theme-split absolute -bottom-[1px] -right-[1px] h-[7px] w-[7px] rounded-full border border-surface"
        style={{ background: resolved === "dark" ? "#8d99a8" : "#f0b429" }}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ control */

export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>("system");
  const [resolved, setResolved] = useState<Resolved>("dark");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /* Adopt whatever the bootstrap script already decided, so the control can
     never disagree with what is on screen on the first paint. */
  useEffect(() => {
    setPref(readPref());
    setResolved(readResolved());
  }, []);

  /* In SYSTEM mode, follow a live OS change. The script already keeps
     `data-theme` current; this only refreshes the split-face indicator. */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setResolved(readResolved());
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /* Dismiss on outside pointer-down or Escape, and return focus to the trigger. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = useCallback((v: ThemePref) => {
    const bridge = window.__echoTheme;
    if (bridge) {
      /* The script owns localStorage, the media listener and both attributes. */
      bridge.set(v);
      setPref(bridge.pref);
      setResolved(bridge.resolve());
    } else {
      const d = document.documentElement;
      const next: Resolved =
        v === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : v;
      d.setAttribute("data-theme-pref", v);
      d.setAttribute("data-theme", next);
      try {
        window.localStorage.setItem(THEME_KEY, v);
      } catch {
        /* private mode: the preference simply does not survive the session */
      }
      setPref(v);
      setResolved(next);
    }
    setOpen(false);
  }, []);

  const current = OPTIONS.find((o) => o.value === pref) ?? OPTIONS[0];
  const detail =
    pref === "system"
      ? `Theme: System (currently ${resolved})`
      : `Theme: ${current.label}`;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={detail}
        title={detail}
        data-theme-state={pref}
        className="echo-theme-toggle flex h-9 w-9 items-center justify-center rounded-[10px] text-ink3 hover:bg-sunken hover:text-ink"
      >
        <Glyph pref={pref} resolved={resolved} />
      </button>

      {open && (
        <div role="menu" aria-label="Theme" className="echo-theme-menu">
          {OPTIONS.map((o) => {
            const active = o.value === pref;
            return (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(o.value)}
                className="echo-theme-menu__item"
                data-active={active}
              >
                <span className="echo-theme-menu__icon">
                  {o.value === "light" ? (
                    <SunIcon />
                  ) : o.value === "dark" ? (
                    <MoonIcon />
                  ) : (
                    <SystemIcon />
                  )}
                </span>
                <span className="flex-1 text-left">{o.label}</span>
                {active && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M3.2 8.4 6.4 11.6 12.8 4.8"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
