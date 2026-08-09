"use client";

import { useState } from "react";

// Readonly URL + Copy button. Mono, no uppercasing (the value is case-sensitive).
export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (insecure origin) — the field is selectable, copy manually */
    }
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
      <input
        className="input mono"
        style={{ flex: 1, minWidth: 0, textTransform: "none", fontSize: 12 }}
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" className="btn-add" style={{ whiteSpace: "nowrap" }} onClick={copy}>
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}
