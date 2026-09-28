import { parseEchoCaseIds, caseMarker, isEchoCaseId } from "../lib/hindsight.ts";

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
let bad = 0;
const t = (name: string, got: unknown, want: unknown) => {
  const ok = eq(got, want);
  if (!ok) bad++;
  console.log(`  ${ok ? "OK  " : "FAIL"} ${name} -> ${JSON.stringify(got)}`);
};

console.log("parseEchoCaseIds");
t("current marker", parseEchoCaseIds("Approved [C02] on 2026-02-10 for Northwind"), ["C02"]);
t("legacy marker", parseEchoCaseIds("approved [echo-case:C08] earlier"), ["C08"]);
t("dedupes, keeps order", parseEchoCaseIds("[C12] then [C04] then [C12] then [C02]"), ["C12", "C04", "C02"]);
t("ignores prose", parseEchoCaseIds("Case C08 is the fourth similar amount mismatch case."), []);
t("ignores 3-digit / lowercase", parseEchoCaseIds("[C123] [c02] [CX]"), []);
t("ignores bad legacy id", parseEchoCaseIds("[echo-case:not-an-id] [C07]"), ["C07"]);
t("empty", parseEchoCaseIds(""), []);

console.log("caseMarker (dynamic, not hardcoded)");
t("C02", caseMarker("C02"), "[C02]");
t("C47", caseMarker("C47"), "[C47]");
t("round-trips", parseEchoCaseIds(`done ${caseMarker("C11")}`), ["C11"]);

console.log("isEchoCaseId (validates FORMAT only; existence is enforced by the store lookup)");
t("format", [isEchoCaseId("C01"), isEchoCaseId("C47"), isEchoCaseId("C1"), isEchoCaseId("c02"), isEchoCaseId("CX"), isEchoCaseId(undefined)],
  [true, true, false, false, false, false]);
t("a format-valid id that does not exist is dropped by byId.get()", (() => {
  const byId = new Map(["C02", "C08"].map((id) => [id, id]));
  return byId.get(parseEchoCaseIds("nothing here [C00] [C99]") [0] ?? "") ?? "dropped";
})(), "dropped");

console.log(bad === 0 ? "\nALL PARSER TESTS PASSED" : `\n${bad} FAILED`);
process.exit(bad ? 1 : 0);
