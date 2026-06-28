"use client";

type CheckboxProps = {
  checked: boolean;
  onChange: (b: boolean) => void;
  label?: string;
};

/**
 * Custom checkbox (no native input[type=checkbox]). The box itself carries
 * role=checkbox + aria-checked; space/enter toggle. Wrapped in a 44px row so
 * the whole label is a tap target.
 */
export function Checkbox({ checked, onChange, label }: CheckboxProps) {
  function toggle() {
    onChange(!checked);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      toggle();
    }
  }

  return (
    <label className="check-label" onClick={toggle}>
      <span
        className="checkbox"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onClick={(e) => {
          // The label's onClick already toggles; stop the box from double-toggling.
          e.stopPropagation();
          toggle();
        }}
      />
      {label ? <span>{label}</span> : null}
    </label>
  );
}
