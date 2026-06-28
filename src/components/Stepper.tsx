"use client";

type StepperProps = {
  value: number;
  min?: number;
  onChange: (n: number) => void;
};

/** − / value / + stepper. Buttons are ≥38px and labelled. No native input. */
export function Stepper({ value, min = 0, onChange }: StepperProps) {
  const canDecrement = value > min;

  return (
    <div className="stepper">
      <button
        type="button"
        aria-label="Decrease"
        disabled={!canDecrement}
        onClick={() => {
          if (canDecrement) onChange(value - 1);
        }}
      >
        −
      </button>
      <span className="val" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase"
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}
