"use client";

// THROWAWAY mockup for choosing a pantry redesign. Delete this whole folder
// once a direction is picked. Fake data, real design-system classes; extra
// styles are scoped under .mk to avoid touching globals until we commit.

type Row = { name: string; icon: string; qty: string; exp?: string; days?: number };

const soon: Row[] = [
  { name: "Baby spinach", icon: "🥬", qty: "120 g", exp: "2026-07-04", days: 2 },
  { name: "Greek yogurt", icon: "🥛", qty: "1 tub", exp: "2026-07-06", days: 4 },
];
const inStock: Row[] = [
  { name: "Chicken thigh", icon: "🍗", qty: "800 g" },
  { name: "Basmati rice", icon: "🍚", qty: "2.4 kg" },
  { name: "Olive oil", icon: "🫒", qty: "300 ml" },
  { name: "Onion", icon: "🧅", qty: "3 ea" },
  { name: "Garlic", icon: "🧄", qty: "60 g", days: 99 },
];
const low: Row[] = [{ name: "Butter", icon: "🧈", qty: "20 g" }];
const out: Row[] = [
  { name: "Eggs", icon: "🥚", qty: "0 ea" },
  { name: "Milk", icon: "🥛", qty: "0 ml" },
];

function Head({ n, label }: { n: string; label: string }) {
  return (
    <header className="chrome">
      <p className="eb">Pantry · {n}</p>
      <h1>{label}</h1>
    </header>
  );
}

/* ---- Variant A: current (baseline) ---- */
function VariantA() {
  const row = (r: Row, dim?: boolean) => (
    <div key={r.name} className="card" style={dim ? { opacity: 0.6 } : undefined}>
      <div className="card-row">
        <span style={{ fontWeight: 600, fontSize: 16 }}>{r.name}</span>
        <span className="meta">{r.qty}</span>
      </div>
      {r.exp && <p className="meta">soonest expiry · {r.exp}</p>}
    </div>
  );
  return (
    <>
      <Head n="A" label="Current" />
      <main className="content stack-sm">
        <p className="eb" style={{ color: "var(--paprika)" }}>Use soon</p>
        {soon.map((r) => row(r))}
        <p className="eb" style={{ marginTop: 16 }}>In stock</p>
        {[...inStock, ...low].map((r) => row(r))}
        <p className="eb" style={{ marginTop: 16 }}>Out of stock</p>
        {out.map((r) => row(r))}
      </main>
    </>
  );
}

/* ---- Variant B: polished list (icon badge + chips + dim) ---- */
function VariantB() {
  const row = (r: Row, tone?: "low" | "run", dim?: boolean) => (
    <div key={r.name} className={`card mk-row${dim ? " mk-dim" : ""}`}>
      <span className="icon-badge mk-badge">{r.icon}</span>
      <div className="mk-main">
        <span className="title">{r.name}</span>
        {r.exp && <p className="meta">expires · {r.exp}</p>}
      </div>
      {tone ? (
        <span className={`chip ${tone}`}>
          {r.days != null ? (r.days <= 0 ? "expired" : `${r.days}d`) : "low"}
        </span>
      ) : (
        <span className="mk-qty">{r.qty}</span>
      )}
    </div>
  );
  return (
    <>
      <Head n="B" label="What's in stock" />
      <main className="content stack-sm">
        <p className="section-label">Use soon</p>
        {soon.map((r) => row(r, r.days != null && r.days <= 3 ? "run" : "low"))}
        <p className="section-label">In stock</p>
        {inStock.map((r) => row(r))}
        {low.map((r) => row(r, "low"))}
        <p className="section-label">Out of stock</p>
        {out.map((r) => row(r, undefined, true))}
      </main>
    </>
  );
}

/* ---- Variant C: status rail + summary + big qty ---- */
function VariantC() {
  const row = (r: Row, status: "ok" | "low" | "run" | "out") => (
    <div key={r.name} className={`card mk-rail mk-rail--${status}`}>
      <span className="icon-badge mk-badge">{r.icon}</span>
      <div className="mk-main">
        <span className="title">{r.name}</span>
        {r.exp ? (
          <p className="meta">
            {r.days != null && r.days <= 0 ? "expired" : `${r.days}d left`} · {r.exp}
          </p>
        ) : (
          <p className="meta">
            {status === "out" ? "out of stock" : status === "low" ? "running low" : "in stock"}
          </p>
        )}
      </div>
      <span className={`mk-qty${status === "out" ? " mk-qty--out" : ""}`}>{r.qty}</span>
    </div>
  );
  return (
    <>
      <Head n="C" label="What's in stock" />
      <main className="content stack-sm">
        <div className="mk-summary">
          <div><b>{inStock.length}</b><span>in stock</span></div>
          <div><b>{low.length}</b><span>low</span></div>
          <div><b>{soon.length}</b><span>use soon</span></div>
          <div><b>{out.length}</b><span>out</span></div>
        </div>
        <p className="section-label">Use soon</p>
        {soon.map((r) => row(r, r.days != null && r.days <= 3 ? "run" : "low"))}
        <p className="section-label">In stock</p>
        {inStock.map((r) => row(r, "ok"))}
        {low.map((r) => row(r, "low"))}
        <p className="section-label">Out of stock</p>
        {out.map((r) => row(r, "out"))}
      </main>
    </>
  );
}

export default function PantryMock() {
  return (
    <>
      <style>{`
        .mk-row{display:flex;align-items:center;gap:12px}
        .mk-main{flex:1;min-width:0}
        .mk-badge{width:38px;height:38px;border-radius:8px;background:var(--chip-bg);font-size:20px;line-height:1}
        .mk-qty{font-family:var(--mono);font-weight:700;font-size:14px;color:var(--ink);white-space:nowrap}
        .mk-qty--out{color:var(--sage)}
        .mk-dim{opacity:.55}
        .mk-dim .mk-qty{color:var(--sage)}
        /* variant C */
        .mk-rail{display:flex;align-items:center;gap:12px;border-left:4px solid var(--sage)}
        .mk-rail--ok{border-left-color:var(--enamel)}
        .mk-rail--low{border-left-color:var(--turmeric)}
        .mk-rail--run{border-left-color:var(--paprika)}
        .mk-rail--out{border-left-color:var(--line);opacity:.6}
        .mk-summary{display:flex;gap:8px;background:var(--paper-raised);border:1px solid var(--line);border-radius:8px;padding:12px}
        .mk-summary>div{flex:1;text-align:center;display:flex;flex-direction:column;gap:2px}
        .mk-summary b{font-family:var(--display);font-weight:800;font-size:22px}
        .mk-summary span{font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--sage)}
        .mk-divider{height:2px;background:var(--line);margin:28px 0 0}
      `}</style>
      <VariantA />
      <div className="mk-divider" />
      <VariantB />
      <div className="mk-divider" />
      <VariantC />
    </>
  );
}
