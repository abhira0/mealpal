"use client";

// THROWAWAY pantry design configurator. Flip the toggles up top; the list
// below re-renders live. Once a combo is chosen, apply to the real
// pantry/page.tsx + globals.css and delete this whole folder.
// Extra styles scoped under .mk to avoid touching globals until we commit.

import { useState } from "react";

type Status = "run" | "low" | "ok" | "out";
type Row = { name: string; icon: string; qty: string; exp?: string; days?: number; status: Status };

const soon: Row[] = [
  { name: "Baby spinach", icon: "🥬", qty: "120 g", exp: "2026-07-04", days: 2, status: "run" },
  { name: "Greek yogurt", icon: "🥛", qty: "1 tub", exp: "2026-07-06", days: 4, status: "low" },
];
const inStock: Row[] = [
  { name: "Chicken thigh", icon: "🍗", qty: "800 g", status: "ok" },
  { name: "Basmati rice", icon: "🍚", qty: "2.4 kg", status: "ok" },
  { name: "Olive oil", icon: "🫒", qty: "300 ml", status: "ok" },
  { name: "Onion", icon: "🧅", qty: "3 ea", status: "ok" },
  { name: "Garlic", icon: "🧄", qty: "60 g", status: "ok" },
];
const low: Row[] = [{ name: "Butter", icon: "🧈", qty: "20 g", status: "low" }];
const out: Row[] = [
  { name: "Eggs", icon: "🥚", qty: "0 ea", status: "out" },
  { name: "Milk", icon: "🥛", qty: "0 ml", status: "out" },
];

// ---- config ----
type Cfg = {
  badge: "emoji" | "mono" | "none";
  status: "chip" | "rail" | "dot";
  qty: "mono" | "chip";
  counts: boolean;
  summary: boolean;
  out: "dim" | "collapse";
  density: "comfy" | "compact";
};

const OPTIONS: { [K in keyof Cfg]: { key: string; vals: [Cfg[K], string][] } } = {
  badge: { key: "Badge", vals: [["emoji", "Emoji"], ["mono", "Monogram"], ["none", "None"]] },
  status: { key: "Status", vals: [["chip", "Chip"], ["rail", "Left rail"], ["dot", "Dot"]] },
  qty: { key: "Qty", vals: [["mono", "Mono text"], ["chip", "Chip"]] },
  counts: { key: "Counts", vals: [[true, "On"], [false, "Off"]] },
  summary: { key: "Summary", vals: [[true, "On"], [false, "Off"]] },
  out: { key: "Out-of-stock", vals: [["dim", "Dim inline"], ["collapse", "Collapsed"]] },
  density: { key: "Density", vals: [["comfy", "Comfy"], ["compact", "Compact"]] },
};

const railClass: Record<Status, string> = { run: "run", low: "low", ok: "ok", out: "out" };
const dotClass: Record<Status, string> = { run: "run", low: "low", ok: "ok", out: "out" };

export default function PantryMock() {
  const [cfg, setCfg] = useState<Cfg>({
    badge: "emoji", status: "chip", qty: "mono",
    counts: true, summary: false, out: "dim", density: "comfy",
  });
  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg((c) => ({ ...c, [k]: v }));

  const Badge = ({ r }: { r: Row }) =>
    cfg.badge === "none" ? null : (
      <span className="icon-badge mk-badge">
        {cfg.badge === "emoji" ? r.icon : r.name[0]}
      </span>
    );

  const StatusEl = ({ r }: { r: Row }) => {
    if (cfg.status !== "chip") return null;
    if (r.days != null) {
      const t = r.days <= 3 ? "run" : "low";
      return <span className={`chip ${t}`}>{r.days <= 0 ? "expired" : `${r.days}d`}</span>;
    }
    if (r.status === "low") return <span className="chip low">low</span>;
    if (r.status === "out") return <span className="chip">out</span>;
    return null;
  };

  const Qty = ({ r }: { r: Row }) =>
    cfg.qty === "chip"
      ? <span className="chip mk-qtychip">{r.qty}</span>
      : <span className={`mk-qty${r.status === "out" ? " mk-qty--out" : ""}`}>{r.qty}</span>;

  const row = (r: Row, dim?: boolean) => (
    <div
      key={r.name}
      className={[
        "card mk-row",
        cfg.density === "compact" ? "mk-compact" : "",
        cfg.status === "rail" ? `mk-rail mk-rail--${railClass[r.status]}` : "",
        dim ? "mk-dim" : "",
      ].join(" ")}
    >
      {cfg.status === "dot" && <span className={`mk-dot mk-dot--${dotClass[r.status]}`} />}
      <Badge r={r} />
      <div className="mk-main">
        <span className="title">{r.name}</span>
        {r.exp && <p className="meta">expires · {r.exp}</p>}
      </div>
      <div className="mk-right">
        {cfg.status === "chip" && <StatusEl r={r} />}
        {!(cfg.qty === "mono" && cfg.status === "chip" && r.status !== "ok") && <Qty r={r} />}
      </div>
    </div>
  );

  const label = (text: string, n: number) => (
    <p className="section-label">{cfg.counts ? `${text} · ${n}` : text}</p>
  );

  const inAll = [...inStock, ...low];

  return (
    <>
      <style>{`
        .mk-controls{background:var(--paper-raised);border-bottom:1px solid var(--line);padding:12px 16px;position:sticky;top:0;z-index:5;display:flex;flex-direction:column;gap:8px}
        .mk-ctl{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
        .mk-ctl>.lbl{font-family:var(--mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--sage);width:96px;flex:none}
        .mk-row{display:flex;align-items:center;gap:12px}
        .mk-compact{padding:9px 12px}
        .mk-main{flex:1;min-width:0}
        .mk-right{display:flex;align-items:center;gap:8px;white-space:nowrap}
        .mk-badge{width:38px;height:38px;border-radius:8px;background:var(--chip-bg);font-size:20px;line-height:1;font-family:var(--display);font-weight:800;color:var(--enamel-dark)}
        .mk-compact .mk-badge{width:30px;height:30px;font-size:16px}
        .mk-qty{font-family:var(--mono);font-weight:700;font-size:14px;color:var(--ink)}
        .mk-qty--out{color:var(--sage)}
        .mk-qtychip{border-left-color:var(--enamel)}
        .mk-dim{opacity:.5}
        .mk-dim .mk-qty{color:var(--sage)}
        .mk-rail{border-left:4px solid var(--sage)}
        .mk-rail--ok{border-left-color:var(--enamel)}
        .mk-rail--low{border-left-color:var(--turmeric)}
        .mk-rail--run{border-left-color:var(--paprika)}
        .mk-rail--out{border-left-color:var(--line)}
        .mk-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--sage)}
        .mk-dot--ok{background:var(--enamel)}
        .mk-dot--low{background:var(--turmeric)}
        .mk-dot--run{background:var(--paprika)}
        .mk-dot--out{background:var(--line)}
        .mk-summary{display:flex;gap:8px;background:var(--paper-raised);border:1px solid var(--line);border-radius:8px;padding:12px}
        .mk-summary>div{flex:1;text-align:center;display:flex;flex-direction:column;gap:2px}
        .mk-summary b{font-family:var(--display);font-weight:800;font-size:22px}
        .mk-summary span{font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--sage)}
      `}</style>

      <div className="mk-controls">
        {(Object.keys(OPTIONS) as (keyof Cfg)[]).map((k) => (
          <div key={k} className="mk-ctl">
            <span className="lbl">{OPTIONS[k].key}</span>
            <div className="filter">
              {OPTIONS[k].vals.map(([v, txt]) => (
                <button
                  key={String(v)}
                  type="button"
                  aria-pressed={cfg[k] === v}
                  onClick={() => set(k, v as Cfg[typeof k])}
                >
                  {txt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <header className="chrome">
        <p className="eb">Pantry</p>
        <h1>What&apos;s in stock</h1>
      </header>

      <main className="content stack-sm">
        {cfg.summary && (
          <div className="mk-summary">
            <div><b>{inStock.length}</b><span>in stock</span></div>
            <div><b>{low.length}</b><span>low</span></div>
            <div><b>{soon.length}</b><span>use soon</span></div>
            <div><b>{out.length}</b><span>out</span></div>
          </div>
        )}
        {label("Use soon", soon.length)}
        {soon.map((r) => row(r))}
        {label("In stock", inAll.length)}
        {inAll.map((r) => row(r))}
        {cfg.out === "collapse" ? (
          <details>
            <summary className="section-label" style={{ cursor: "pointer" }}>
              Out of stock · {out.length}
            </summary>
            <div className="stack-sm" style={{ marginTop: 8 }}>{out.map((r) => row(r, true))}</div>
          </details>
        ) : (
          <>
            {label("Out of stock", out.length)}
            {out.map((r) => row(r, true))}
          </>
        )}
      </main>
    </>
  );
}
