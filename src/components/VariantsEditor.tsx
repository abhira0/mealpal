"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { NutritionFactsEditor, EDITOR_KEYS, type PerUnit } from "@/components/NutritionFactsEditor";

type Variant = { id: number; name: string } & Record<string, number | null>;

export function VariantsEditor({ productId, unit }: { productId: number; unit: string }) {
  const [rows, setRows] = useState<Variant[]>([]);
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    fetch(`/api/products/${productId}/variants`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => {});
  }
  useEffect(reload, [productId]);

  async function add() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/products/${productId}/variants`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: n }),
    });
    setBusy(false);
    if (!res.ok) { setError("Couldn't add that variant."); return; }
    const created: Variant = await res.json();
    setName("");
    reload();
    setOpenId(created.id); // open the new variant's facts editor straight away
  }

  async function remove(id: number) {
    await fetch(`/api/variants/${id}`, { method: "DELETE" });
    if (openId === id) setOpenId(null);
    reload();
  }

  return (
    <>
      <span className="section-label">Variants</span>
      <section className="card stack-sm">
        {rows.length === 0 && (
          <p className="empty">No variants yet — add each assorted type below, then tap it to fill in its nutrition.</p>
        )}

        {rows.map((v) => {
          const open = openId === v.id;
          return (
            <div key={v.id}>
              <div className="ing-row" style={{ paddingTop: 0 }}>
                <button
                  type="button"
                  className="btn-link"
                  style={{ flex: 1, textAlign: "left", display: "inline-flex", alignItems: "center", gap: 6, width: "auto" }}
                  onClick={() => setOpenId(open ? null : v.id)}
                  aria-expanded={open}
                >
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  {v.name}
                </button>
                <span className="meta">{v.calories != null ? `${v.calories} cal / ${unit || "unit"}` : "no facts yet"}</span>
                <button type="button" aria-label={`Delete ${v.name}`} onClick={() => remove(v.id)} style={{ color: "var(--paprika)" }}>
                  <Trash2 size={16} />
                </button>
              </div>
              {open && (
                <div style={{ margin: "8px 0 4px" }}>
                  <NutritionFactsEditor
                    savePath={`/api/variants/${v.id}`}
                    unit={unit}
                    showServing={false}
                    initial={{
                      servingSize: null,
                      ...Object.fromEntries(EDITOR_KEYS.map((k) => [k, v[k] ?? null])),
                    } as PerUnit}
                    onSaved={reload}
                  />
                </div>
              )}
            </div>
          );
        })}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Variant name (e.g. Mega Omega)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          />
          <button type="button" className="btn" onClick={add} disabled={busy || !name.trim()}>
            {busy ? "…" : "Add"}
          </button>
        </div>
        {error && <p className="notice" style={{ color: "var(--paprika)" }}>{error}</p>}
      </section>
    </>
  );
}
