"use client";
// KnowledgeOwner — who decided before.
// The usual approver, their availability, and who else has handled the same
// vendor and exception. Rendered only when the investigation actually asked.

import type { Owner } from "./echoTypes";
import { cx } from "./ui";

const isAway = (o: Owner) => /^on leave/i.test(o.status);

function Availability({ away }: { away: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 text-[10.5px] font-medium",
        away ? "text-brass" : "text-good",
      )}
    >
      <span
        aria-hidden="true"
        className={cx("block h-[5px] w-[5px] rounded-full", away ? "bg-brass" : "bg-good")}
      />
      {away ? "Unavailable" : "Available"}
    </span>
  );
}

function Person({ o }: { o: Owner }) {
  return (
    <li className="flex items-center gap-2 py-[3px]">
      <span className="truncate text-[12px] text-ink">{o.name}</span>
      <Availability away={isAway(o)} />
      <span className="ml-auto shrink-0 font-mono text-[10px] text-ink4">
        ×{o.cases_handled}
      </span>
    </li>
  );
}

export default function KnowledgeOwner({ owners }: { owners: Owner[] }) {
  if (!owners.length) return null;
  const away = owners.filter(isAway);
  const free = owners.filter((o) => !isAway(o));

  return (
    <div>
      {away.length > 0 && (
        <ul>
          {away.map((o) => (
            <Person key={o.name} o={o} />
          ))}
        </ul>
      )}
      {away.length > 0 && free.length > 0 && (
        <p className="mt-2 border-t border-dashed border-line pt-2 text-[11.5px] leading-[1.55] text-ink3">
          Available instead:{" "}
          <span className="text-ink2">{free.map((o) => o.name).join(", ")}</span>
        </p>
      )}
      {away.length === 0 && (
        <ul>
          {free.map((o) => (
            <Person key={o.name} o={o} />
          ))}
        </ul>
      )}
    </div>
  );
}
