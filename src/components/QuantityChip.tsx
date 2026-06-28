type Tone = "default" | "low" | "price";

const CLASS: Record<Tone, string> = {
  default: "chip",
  low: "chip chip--low",
  price: "chip chip--price",
};

/**
 * The signature element: a monospace value on label-tape, with a tinted
 * accent bar that encodes meaning (sage = fine, turmeric = low, enamel = price).
 */
export function QuantityChip({
  value,
  tone = "default",
}: {
  value: string;
  tone?: Tone;
}) {
  return <span className={CLASS[tone]}>{value}</span>;
}
