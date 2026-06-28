type Tone = "default" | "low" | "run" | "price";

/**
 * The signature element: a monospace value on label-tape, with a tinted
 * accent bar that encodes meaning (sage = default, turmeric = low,
 * paprika = run-out, enamel = price).
 */
export function QuantityChip({
  value,
  tone = "default",
}: {
  value: string;
  tone?: Tone;
}) {
  const className = tone === "default" ? "chip" : `chip ${tone}`;
  return <span className={className}>{value}</span>;
}
