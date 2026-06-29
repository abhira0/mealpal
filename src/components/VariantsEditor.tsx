"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { FACT_ROWS, type FactKey } from "@/components/NutritionFacts";

type Variant = { id: number; name: string } & Partial<Record<FactKey, number | null>>;
const NUM_KEYS: FactKey[] = ["calories", ...FACT_ROWS.map((r) => r.key)];
const LABELS: Record<string, string> = { calories: "Calories", ...Object.fromEntries(FACT_ROWS.map((r) => [r.key, r.label])) };

export function VariantsEditor({ productId, unit }: { productId: number; unit: string }) {
  const [rows, setRows] = useState<Variant[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function reload() {
    fetch(`/api/products/${productId}/variants`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => {});
  }
  useEffect(reload, [productId]);

  function num(v: string | undefined) { return v != null && v !== "" ? Number(v) : undefined; }

  async function add() {
    if (!draft.name?.trim()) return;
    setBusy(true);
    const body: Record<string, unknown> = { name: draft.name.trim() };
    for (const k of NUM_KEYS) { const n = num(draft[k]); if (n !== undefined) body[k] = n; }
    await fetch(`/api/products/${productId}/variants`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    setBusy(false); setDraft({}); reload();
  }

  async function remove(id: number) {
    await fetch(`/api/variants/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <>
      <span className="section-label">Variants (per {unit || "packet"})</span>
      <section className="card stack-sm">
        {rows.length === 0 && <p className="empty">No variants — add the assorted types below.</p>}
        {rows.map((v) => (
          <div key={v.id} className="ing-row" style={{ paddingTop: 0 }}>
            <span style={{ flex: 1 }}>{v.name}</span>
            <span className="meta">{v.calories != null ? `${v.calories} cal` : "—"}</span>
            <button type="button" aria-label={`Delete ${v.name}`} onClick={() => remove(v.id)} style={{ color: "var(--paprika)" }}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <div className="stack-sm" style={{ marginTop: 8 }}>
          <input className="input" placeholder="Variant name (e.g. Mega Omega)"
            value={draft.name ?? ""} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          {NUM_KEYS.map((k) => (
            <label key={k} className="eb" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1 }}>{LABELS[k] ?? k}</span>
              <input className="input mono" inputMode="decimal" style={{ width: 90 }}
                value={draft[k] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value.replace(/[^0-9.]/g, "") }))} />
            </label>
          ))}
          <button type="button" className="btn" onClick={add} disabled={busy || !draft.name?.trim()}>
            {busy ? "…" : "Add variant"}
          </button>
        </div>
      </section>
    </>
  );
}
