"use client";
// Echo — AP exception decision system.
//
// Three zones: the exception queue (left), the active investigation (centre,
// always primary), and institutional memory (right). The agent lives in
// lib/echo_agent_core.ts behind POST /api/agent; nothing in this file changes how
// it thinks, what tools it has, or how confidence is computed. This file only
// presents what comes back, and every prompt below is byte-identical to the ones
// the agent was verified against.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import EchoMark from "./EchoMark";
import EchoField from "./EchoField";
import CaseList from "./CaseList";
import Investigation from "./Investigation";
import MemoryRail from "./MemoryRail";
import DecisionBar from "./DecisionBar";
import AskEchoInput from "./AskEchoInput";
import MemoryToggle from "./MemoryToggle";
import ToastHost from "./Toast";
import type { ButtonState } from "./ActionButton";
import { Lbl, cx } from "./ui";
import type {
  CaseItem,
  Evidence,
  OwnerResult,
  PromoteResult,
  RecallArgs,
  RecallResult,
  SaveResult,
  ToastItem,
  Trace,
  Turn,
} from "./echoTypes";

/* -------------------------------------------------------------- demo cases */
/* Messages are byte-identical to the originals the agent was tuned against. */

const CASES: CaseItem[] = [
  {
    key: "nw-1188",
    vendor: "Northwind Freight",
    invoiceNo: "INV-NW-1188",
    invoice: 133900,
    po: 129000,
    poRef: "PO-7981",
    exception: "amount_mismatch",
    label: "3.8%",
    message:
      "Invoice INV-NW-1188 from Northwind Freight: ₹1,33,900 against PO-7981 of ₹1,29,000 (3.8% mismatch). Priya Nair is on leave. What should I do?",
  },
  {
    key: "nw-1195",
    vendor: "Northwind Freight",
    invoiceNo: "INV-NW-1195",
    invoice: 158000,
    po: 150000,
    poRef: "PO-7990",
    exception: "amount_mismatch",
    label: "5.3%",
    message:
      "Invoice INV-NW-1195 from Northwind Freight: ₹1,58,000 against PO-7990 of ₹1,50,000. What should I do?",
  },
  {
    key: "cc-2360",
    vendor: "Contoso Cloud Services",
    invoiceNo: "INV-CC-2360",
    invoice: 22500,
    po: null,
    poRef: null,
    exception: "missing_po",
    label: "No PO",
    message:
      "Invoice INV-CC-2360 from Contoso Cloud Services for ₹22,500 has no PO number. What should I do?",
  },
  {
    key: "zp-0017",
    vendor: "Zenith Packaging",
    invoiceNo: "INV-ZP-0017",
    invoice: 54000,
    po: 50000,
    poRef: "PO-8200",
    exception: "amount_mismatch",
    label: "8%",
    message:
      "Invoice INV-ZP-0017 from Zenith Packaging: ₹54,000 against PO-8200 of ₹50,000. What should I do?",
  },
];

/* ----------------------------------------------------------------- prompts */
/* ESCALATE_TEXT and RESOLVE_APPROVED are the original, verified messages. */

const ESCALATE_TEXT = "Escalate this per policy. Who should I send it to?";
const RESOLVE_APPROVED =
  "I approved it today. Approver: Suresh Iyer. Workaround: the vendor's supporting annexure was attached. Outcome: approved in 1 day. Please save this resolution.";
const PROMOTE_TEXT = "Should this practice become written policy? Check the evidence.";
const DECISION_APPROVE = "I am approving this invoice. Please record this decision in Echo's memory.";
const DECISION_REJECT = "I am rejecting this invoice. Please record this decision in Echo's memory.";

const rejectText = (approver?: string) =>
  `I rejected it today. Approver: ${approver ?? "AP Manager"}. Workaround: none — the condition behind the past approvals was not present. Outcome: rejected in 1 day. Please save this resolution.`;

/* ----------------------------------------------------------------- helpers */

const TABS = [
  { id: "queue", label: "Queue" },
  { id: "history", label: "History" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function buildEvidence(trace: Trace[]): Evidence {
  const rev = [...trace].reverse();
  const result = (t: string) => rev.find((x) => x.tool === t)?.result;
  let args: RecallArgs | undefined;
  const raw = rev.find((x) => x.tool === "recall_exception_pattern")?.args;
  if (raw) {
    try {
      args = JSON.parse(raw) as RecallArgs;
    } catch {
      args = undefined;
    }
  }
  return {
    args,
    recall: result("recall_exception_pattern") as RecallResult | undefined,
    owner: result("find_knowledge_owner") as OwnerResult | undefined,
    promo: result("promote_to_policy") as PromoteResult | undefined,
    saved: result("save_resolution") as SaveResult | undefined,
  };
}

/* ---------------------------------------------------------------- top bar */

function TopBar({
  tab,
  onTab,
  memoryOn,
  onMemory,
  queueCount,
  historyCount,
  onOpenQueue,
  onOpenMemory,
  onSettings,
  settings,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  memoryOn: boolean;
  onMemory: () => void;
  queueCount: number;
  historyCount: number;
  onOpenQueue: () => void;
  onOpenMemory: () => void;
  onSettings: () => void;
  settings: boolean;
}) {
  /* The history count only ever changes because a real resolution was recorded,
     so the one-shot bump is bound to that number and nothing else. */
  const seen = useRef(historyCount);
  const [bumped, setBumped] = useState(false);

  /* Measure the active tab so the single indicator can travel to it. */
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const [ink, setInk] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const nav = tabRefs.current[tab];
    if (!nav) return;
    const measure = () =>
      setInk({ left: nav.offsetLeft, width: nav.offsetWidth });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [tab, queueCount, historyCount]);

  useEffect(() => {
    if (historyCount === seen.current) return;
    seen.current = historyCount;
    setBumped(true);
    const t = window.setTimeout(() => setBumped(false), 340);
    return () => window.clearTimeout(t);
  }, [historyCount]);

  return (
    <header className="relative z-20 flex h-[64px] shrink-0 items-center gap-3 border-b border-line bg-surface px-6">
      <button
        type="button"
        onClick={onOpenQueue}
        aria-label="Open exception queue"
        className="-ml-2 flex h-[44px] w-[44px] items-center justify-center text-ink3 hover:text-ink lg:hidden"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        <span className="flex h-[32px] w-[32px] items-center justify-center rounded-[8px] border border-line">
          <EchoMark size={18} className="text-teal" accent="#45cbb6" />
        </span>
        <span className="text-[18px] font-semibold tracking-tight text-ink">Echo</span>
      </div>

      {/* one ink that slides between the two views rather than two indicators
          that blink in and out */}
      <nav
        className="relative ml-2 hidden h-[44px] items-center lg:flex"
        aria-label="Queue view"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          const n = t.id === "queue" ? queueCount : historyCount;
          const bumping = t.id === "history" && bumped;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              onClick={() => onTab(t.id)}
              aria-current={active ? "page" : undefined}
              className={cx(
                "relative flex min-h-[44px] items-center gap-2 rounded-[8px] px-3 text-[14px]",
                active ? "font-medium text-ink" : "text-ink3 hover:text-ink2",
              )}
            >
              {t.label}
              <span
                className={cx(
                  "font-mono text-[12px] text-ink4",
                  bumping && "echo-bump text-teal",
                )}
              >
                {n}
              </span>
            </button>
          );
        })}
        {ink.width > 0 && (
          <span
            aria-hidden="true"
            className="echo-tab-ink absolute bottom-0 left-0 h-[2px] rounded-full bg-teal"
            style={{ width: ink.width, transform: `translateX(${ink.left}px)` }}
          />
        )}
      </nav>

      <div className="ml-auto flex min-w-0 items-center gap-2">
        <span className="hidden items-center gap-2 md:flex">
          <span aria-hidden="true" className="h-[5px] w-[5px] rounded-full bg-good" />
          <span className="text-[12px] text-ink3">AP Operations</span>
        </span>

        <button
          type="button"
          onClick={onOpenMemory}
          aria-label="Open institutional memory"
          className="flex min-h-[44px] items-center rounded-[12px] border border-line px-3 text-[14px] font-medium text-ink2 hover:text-ink xl:hidden"
        >
          Memory
        </button>

        <MemoryToggle on={memoryOn} onToggle={onMemory} />

        <button
          type="button"
          onClick={onSettings}
          aria-label="Settings"
          aria-expanded={settings}
          className="flex h-[44px] w-[44px] items-center justify-center rounded-[12px] text-ink3 hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M8 1.6v1.7M8 12.7v1.7M14.4 8h-1.7M3.3 8H1.6M12.5 3.5l-1.2 1.2M4.7 11.3l-1.2 1.2M12.5 12.5l-1.2-1.2M4.7 4.7 3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------- app */

export default function EchoApp() {
  const [memoryOn, setMemoryOn] = useState(true);
  const [log, setLog] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const [activeCase, setActiveCase] = useState<CaseItem | null>(null);
  const [tab, setTab] = useState<Tab>("queue");
  const [drawer, setDrawer] = useState<null | "queue" | "memory">(null);
  const [settings, setSettings] = useState(false);

  const [stage, setStage] = useState(0);
  const [evidenceReady, setEvidenceReady] = useState(false);
  /** The last request to this case failed; the investigation stays open. */
  const [failed, setFailed] = useState(false);
  /** Bumped once per real recall, purely to fire the ripple on the field. */
  const [ripple, setRipple] = useState(0);
  /** Bumped once per real saved resolution, to sweep the memory rail. */
  const [savePulse, setSavePulse] = useState(0);

  const [action, setAction] = useState<{ kind: string; done: boolean } | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [resolved, setResolved] = useState<string[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const seq = useRef(0);
  const caseKey = useRef<string | null>(null);
  const tAction = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => setStage((s) => s + 1), 420);
    return () => clearInterval(t);
  }, [busy]);

  useEffect(
    () => () => {
      if (tAction.current) clearTimeout(tAction.current);
    },
    [],
  );

  useEffect(() => {
    if (!settings) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettings(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings]);

  const push = useCallback((text: string, tone: ToastItem["tone"] = "info") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);

  const activeEv = useMemo(() => {
    for (let i = log.length - 1; i >= 0; i--) if (log[i].ev) return log[i].ev;
    return undefined;
  }, [log]);

  const recorded = !!activeEv?.saved && !activeEv.saved.error;

  async function send(text: string, kind?: string, fresh = false) {
    if (!text.trim() || busy) return;

    const turn: Turn = { role: "user", content: text.trim() };
    // `fresh` starts a new, case-scoped investigation: the transcript must never
    // carry a previous case's request or follow-ups into the dossier.
    const base = fresh ? [] : log;
    const history = [...base, turn].map(({ role, content }) => ({ role, content }));
    setLog([...base, turn]);
    setInput("");
    setBusy(true);
    setStage(0);
    setFailed(false);
    if (tAction.current) clearTimeout(tAction.current);

    let ok = false;
    try {
      const r = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, memoryOn }),
      });
      const data: { reply: string; trace: Trace[] } = await r.json();
      const trace = data.trace ?? [];
      const ev = buildEvidence(trace);
      const tools = trace.map((t) => t.tool);
      ok = true;

      setLog((p) => [
        ...p,
        { role: "assistant", content: data.reply, ev: memoryOn ? ev : undefined, tools },
      ]);

      const recalled = tools.includes("recall_exception_pattern");
      if (!recalled || !ev.recall || ev.recall.no_history) setEvidenceReady(true);

      /* The ripple stands for memory actually being searched and found. It is
         only raised on a successful response that carries real comparable
         decisions, and never while memory is off. */
      if (
        memoryOn &&
        recalled &&
        ev.recall &&
        !ev.recall.no_history &&
        ev.recall.similar_cases.length > 0
      ) {
        setRipple((n) => n + 1);
      }

      if (tools.includes("save_resolution") && ev.saved && !ev.saved.error) {
        push("Resolution recorded", "ok");
        /* The rail lights up because a decision was genuinely written to
           institutional memory, never on a timer or a guess. */
        setSavePulse((n) => n + 1);
        const key = caseKey.current;
        if (key) setResolved((k) => (k.includes(key) ? k : [...k, key]));
        const retained = ev.saved.retained;
        window.setTimeout(
          () => push(retained ? "Saved to Hindsight memory" : "Saved locally, memory sync failed", retained ? "ok" : "info"),
          560,
        );
      }
      if (tools.includes("promote_to_policy")) push("Policy draft created", "info");
      if (kind === "escalate") push("Case escalated", "info");
    } catch {
      /* The investigation is still open: the case, the brief and the queue
         selection all remain, and the workspace says plainly that the analysis
         could not be completed. No provider detail is surfaced. */
      setFailed(true);
      push("Echo could not complete this analysis", "info");
    } finally {
      setBusy(false);
      setStage(0);
      if (kind) {
        if (ok) {
          setAction({ kind, done: true });
          if (tAction.current) clearTimeout(tAction.current);
          tAction.current = window.setTimeout(() => setAction(null), 2400);
        } else {
          setAction(null);
        }
      }
    }
  }

  function openCase(c: CaseItem) {
    caseKey.current = c.key;
    setActiveCase(c);
    setDrawer(null);
    setEvidenceReady(false);
    setFailed(false);
    setAction(null);
    void send(c.message, undefined, true);
  }

  const btn = (kind: string): ButtonState =>
    action?.kind === kind ? (action.done ? "success" : "loading") : "idle";

  const listItems = tab === "history" ? CASES.filter((c) => resolved.includes(c.key)) : CASES;

  return (
    <div className="relative isolate flex h-dvh flex-col overflow-hidden bg-base text-ink">
      <EchoField ripple={ripple} memoryOn={memoryOn} />

      <TopBar
        tab={tab}
        onTab={setTab}
        memoryOn={memoryOn}
        onMemory={() => setMemoryOn((v) => !v)}
        queueCount={CASES.length}
        historyCount={resolved.length}
        onOpenQueue={() => setDrawer("queue")}
        onOpenMemory={() => setDrawer("memory")}
        onSettings={() => setSettings((s) => !s)}
        settings={settings}
      />

      {/* settings */}
      {settings && (
        <>
          <button
            type="button"
            aria-label="Close settings"
            onClick={() => setSettings(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div className="absolute right-6 top-16 z-30 mt-2 w-[288px] rounded-[12px] border border-line bg-surface p-4 shadow-panel">
            <Lbl>System</Lbl>
            <dl className="mt-3 grid grid-cols-[80px_1fr] gap-x-4 gap-y-2 text-[12px] leading-[1.6]">
              <dt className="text-ink4">Memory</dt>
              <dd className="text-ink2">
                {memoryOn ? "Active" : "Off — written policy only"}
              </dd>
              <dt className="text-ink4">Model</dt>
              <dd className="truncate font-mono text-ink2">openai/gpt-oss-120b</dd>
              <dt className="text-ink4">Source</dt>
              <dd className="text-ink2">
                {activeEv?.recall?.memory_source === "hindsight" ? "Hindsight" : "Local"}
              </dd>
              <dt className="text-ink4">Evidence</dt>
              <dd className="text-ink2">
                {activeEv?.recall
                  ? `${activeEv.recall.stats.similar_cases} comparable case${
                      activeEv.recall.stats.similar_cases === 1 ? "" : "s"
                    }`
                  : "not searched"}
              </dd>
            </dl>
            <p className="mt-4 border-t border-line pt-3 text-[12px] leading-[1.6] text-ink4">
              Echo advises. A person decides. Nothing is approved or paid
              automatically, and institutional memory is only written when a
              human confirms it.
            </p>
          </div>
        </>
      )}

      {/* The workspace: 300 / 1fr / 360, 24px between, never wider than 1440,
          and centred. The three columns share a top, a content line and a
          bottom edge because nothing in them decides its own height. */}
      <div className="relative z-10 flex min-h-0 flex-1 justify-center">
        <div className="grid w-full max-w-[1440px] grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          {/* ---------------------------------------------- zone 1: the queue */}
          <div className="hidden min-h-0 lg:flex">
            <CaseList
              title={tab === "history" ? "Resolved" : "Exception Queue"}
              items={listItems}
              activeKey={activeCase?.key ?? null}
              onSelect={openCase}
              busy={busy}
              resolved={resolved}
            />
          </div>

          {/* ------------------------------------------- zone 2: investigation */}
          <main className="flex min-w-0 flex-col">
            <Investigation
              c={activeCase}
              log={log}
              memoryOn={memoryOn}
              busy={busy}
              stage={stage}
              failed={failed}
            />

          {activeCase && (
            <DecisionBar
              busy={busy}
              approve={btn("approve")}
              escalate={btn("escalate")}
              reject={btn("reject")}
              onApprove={() => {
                setDecision("approve");
                void send(DECISION_APPROVE, "approve");
              }}
              onEscalate={() => void send(ESCALATE_TEXT, "escalate")}
              onReject={() => {
                setDecision("reject");
                void send(DECISION_REJECT, "reject");
              }}
              recorded={recorded}
              onRememberConfirm={() => {
                const approver = activeEv?.owner?.owners[0]?.name;
                const text =
                  decision === "reject" ? rejectText(approver) : RESOLVE_APPROVED;
                void send(text, "remember");
              }}
              promo={memoryOn ? activeEv?.promo : undefined}
              promote={btn("promote")}
              onPromote={() => void send(PROMOTE_TEXT, "promote")}
            />
          )}

          {/* the composer decides whether it is an invitation or a full
              composer, so it is always mounted and never jumps */}
          <AskEchoInput
            value={input}
            onChange={setInput}
            onSend={(v) => void send(v ?? input)}
            busy={busy}
            contextLabel={activeCase?.invoiceNo ?? null}
            />
          </main>

          {/* ------------------------------------ zone 3: institutional memory */}
          <div className="hidden min-h-0 xl:flex">
            <MemoryRail
              memoryOn={memoryOn}
              evidence={activeEv ?? {}}
              evidenceReady={evidenceReady}
              onSettled={() => setEvidenceReady(true)}
              pulse={savePulse}
            />
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------- drawers */}
      {drawer && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close panel"
            onClick={() => setDrawer(null)}
            className="absolute inset-0 bg-black/55"
          />
          {drawer === "queue" ? (
            <div className="absolute left-0 top-0 h-full">
              <CaseList
                title={tab === "history" ? "Resolved" : "Exception Queue"}
                items={listItems}
                activeKey={activeCase?.key ?? null}
                onSelect={openCase}
                busy={busy}
                resolved={resolved}
                onClose={() => setDrawer(null)}
              />
            </div>
          ) : (
            <div className="absolute right-0 top-0 h-full">
              <MemoryRail
                memoryOn={memoryOn}
                evidence={activeEv ?? {}}
                evidenceReady={evidenceReady}
                onSettled={() => setEvidenceReady(true)}
                pulse={savePulse}
                onClose={() => setDrawer(null)}
              />
            </div>
          )}
        </div>
      )}

      <ToastHost items={toasts} />
    </div>
  );
}
