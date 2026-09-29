"use client";
// A tiny, dependency-free renderer for Echo's own replies.
//
// Echo's answers arrive as markdown-ish text from the model. Rather than dump
// it as one blob, we split it into labelled sections (Recommendation, Evidence,
// Policy vs practice, Confidence, ...) and render them as a technical
// definition list. Nothing is invented: the section labels are the ones the
// model actually wrote, and the copy is unchanged.
//
// No dangerouslySetInnerHTML anywhere — every string becomes a React text node.

import type { ReactNode } from "react";

/* ------------------------------------------------------------- inline text */

const INLINE =
  /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\))/;

const safeHref = (href: string) =>
  /^(https?:\/\/|\/|#)/i.test(href) ? href : undefined;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(INLINE.source, "g");
  let last = 0;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-i${n++}`;
    if (tok.startsWith("**")) {
      out.push(
        <strong key={key} className="font-semibold text-ink">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok.startsWith("`")) {
      out.push(
        <code
          key={key}
          className="rounded-[8px] border border-line bg-sunken px-1.5 py-0.5 font-mono text-[12px] text-teal"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      const href = link ? safeHref(link[2]) : undefined;
      out.push(
        href ? (
          <a
            key={key}
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel="noreferrer noopener"
            className="text-ink underline decoration-teal-soft underline-offset-2 hover:decoration-teal"
          >
            {link![1]}
          </a>
        ) : (
          <span key={key}>{link ? link[1] : tok}</span>
        ),
      );
    } else {
      out.push(
        <em key={key} className="italic text-ink2">
          {tok.slice(1, -1)}
        </em>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/* --------------------------------------------------------- block structure */

const HEAD =
  /^\s*(?:#{1,6}\s*|\*\*)\s*([^*\n]{2,48}?)\s*(?:\*\*)?\s*:?\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;

type Section = { label: string | null; body: string[] };

/** Split an Echo reply into labelled sections using only the model's own headings. */
export function splitSections(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { label: null, body: [] };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = HEAD.exec(line);
    const label = h?.[1]?.trim() ?? null;
    const isHeading =
      !!label &&
      !label.endsWith(".") &&
      !/^\d/.test(label) &&
      label.split(/\s+/).length <= 5;

    if (isHeading) {
      if (current.body.some((l) => l.trim())) sections.push(current);
      current = { label, body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.body.some((l) => l.trim())) sections.push(current);
  return sections.length ? sections : [{ label: null, body: [text] }];
}

const SUBHEAD = /^\s*#{1,6}\s+(.+?)\s*$/;
const TABLE_ROW = /^\s*\|/;
const TABLE_SEP = /^\s*\|?[\s:|-]*-[\s:|-]*$/;

const isTableRow = (l?: string) => !!l && TABLE_ROW.test(l) && l.includes("|");
const isTableSep = (l?: string) => !!l && TABLE_SEP.test(l) && l.includes("-");
const cells = (l: string) =>
  l
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** The model often answers with a two-column table; render it, never print pipes. */
function Table({ head, rows, k }: { head: string[]; rows: string[][]; k: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => (
              <th
                key={i}
                className="whitespace-nowrap py-2 pr-4 align-bottom text-[11px] font-semibold uppercase tracking-[0.12em] text-ink3"
              >
                {renderInline(h, `${k}-th${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-line/60 last:border-0">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className="py-2 pr-4 align-top text-[13px] leading-[1.6] text-ink2"
                >
                  {ci === 0 ? (
                    <span className="font-medium text-ink">
                      {renderInline(c, `${k}-r${ri}c${ci}`)}
                    </span>
                  ) : (
                    renderInline(c, `${k}-r${ri}c${ci}`)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Blocks({ lines, k }: { lines: string[]; k: string }) {
  const nodes: ReactNode[] = [];
  let para: string[] = [];
  let bullets: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (!para.length) return;
    nodes.push(
      <p key={`${k}-p${nodes.length}`} className="text-[14px] leading-[1.6] text-ink2">
        {renderInline(para.join(" ").trim(), `${k}-p${nodes.length}`)}
      </p>,
    );
    para = [];
  };
  const flushBullets = () => {
    if (!bullets) return;
    const { ordered, items } = bullets;
    const List = ordered ? "ol" : "ul";
    nodes.push(
      <List
        key={`${k}-l${nodes.length}`}
        className={[
          "space-y-2 pl-5",
          ordered ? "list-decimal marker:text-ink3" : "list-disc marker:text-ink3",
        ].join(" ")}
      >
        {items.map((it, i) => (
          <li key={i} className="pl-0.5 text-[14px] leading-[1.6] text-ink2">
            {renderInline(it, `${k}-l${nodes.length}-${i}`)}
          </li>
        ))}
      </List>,
    );
    bullets = null;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (isTableRow(line) && isTableSep(lines[i + 1])) {
      flushPara();
      flushBullets();
      const head = cells(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j])) {
        rows.push(cells(lines[j]));
        j++;
      }
      nodes.push(<Table key={`${k}-t${nodes.length}`} head={head} rows={rows} k={`${k}t${nodes.length}`} />);
      i = j;
      continue;
    }

    const sh = SUBHEAD.exec(line);
    if (sh) {
      flushPara();
      flushBullets();
      nodes.push(
        <p
          key={`${k}-h${nodes.length}`}
          className="pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink3"
        >
          {renderInline(sh[1], `${k}-h${nodes.length}`)}
        </p>,
      );
      i++;
      continue;
    }

    if (!line.trim()) {
      flushPara();
      flushBullets();
    } else if (RULE.test(line)) {
      flushPara();
      flushBullets();
    } else if (BULLET.test(line)) {
      flushPara();
      (bullets ??= { ordered: false, items: [] }).items.push(BULLET.exec(line)![1]);
    } else if (ORDERED.test(line)) {
      flushPara();
      (bullets ??= { ordered: true, items: [] }).items.push(ORDERED.exec(line)![1]);
    } else {
      flushBullets();
      para.push(line.trim());
    }
    i++;
  }
  flushPara();
  flushBullets();

  return <div className="space-y-2.5">{nodes}</div>;
}

/* ------------------------------------------------------------------ export */

export default function EchoMarkdown({ text }: { text: string }) {
  return <Blocks lines={text.split(/\r?\n/)} k="md" />;
}

/** Echo's answer, rendered as labelled sections. */
export function EchoAnswer({ text }: { text: string }) {
  const sections = splitSections(text);
  const lead = sections.filter((s) => s.label === null);
  const labeled = sections.filter((s) => s.label !== null);

  return (
    <div className="space-y-4">
      {lead.map((s, i) => (
        <EchoMarkdown key={`lead${i}`} text={s.body.join("\n")} />
      ))}

      {labeled.length > 0 && (
        <dl className="divide-y divide-line border-t border-line">
          {labeled.map((s, i) => (
            <div
              key={`${s.label}${i}`}
              className="grid grid-cols-1 gap-x-4 gap-y-2 py-3 sm:grid-cols-[112px_1fr]"
            >
              <dt className="text-[11px] font-semibold uppercase leading-[2.4] tracking-[0.12em] text-ink3">
                {s.label}
              </dt>
              <dd className="min-w-0 text-[13px]">
                <Blocks lines={s.body} k={`s${i}`} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
