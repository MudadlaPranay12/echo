// The one confidence scale in Echo, in its own module so the evidence layer, the
// pattern layer and the client replay panel all import the same definition
// without ever importing the Hindsight adapter.

export function confidenceLabel(supportCount: number): string {
  if (supportCount <= 0) return "none";
  if (supportCount < 3) return "low (very small sample)";
  if (supportCount < 6) return "medium (small sample)";
  return "higher";
}