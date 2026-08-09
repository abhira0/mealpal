# Batch Tracker — Plan 2: Today UI (API + agenda + pack flow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make batches usable end-to-end on the phone: REST routes over the Plan-1 domain lib, a Today home screen that lists active batches with a live countdown + one-tap eat + cook-signal + a goal-progress header, and a pack-a-batch sheet — plus a Playwright smoke test.

**Architecture:** Thin REST route handlers under `src/app/api/batches/**` calling `src/lib/batches.ts` (Plan 1, already tested). A new client component `src/components/TodayAgenda.tsx` becomes the home page (`src/app/page.tsx`), replacing `PlanEditor` as the primary surface while reusing the existing planner via a link. Client-side `fetch` to `/api/*` (the codebase's dominant pattern — no shared hook). Reuse existing CSS classes and the `Sheet` component.

**Tech Stack:** Next.js 16 App Router (client components fetch `/api`), better-sqlite3 + Drizzle (via Plan-1 lib), vitest for any lib additions, Playwright (in-repo) for the UI smoke test. Dev server runs on **29999**; login `demo@demo.com` / `demo1234` (per project memory).

**Grounding facts (verified):**
- Route template: `const session = await auth(); if (!session) return NextResponse.json({error:"Unauthorized"},{status:401});` then call a `@/lib` fn with `session.user.householdId`. Import `db` from `@/db`. Next 16 dynamic params are `Promise`: `{ params }: { params: Promise<{ id: string }> }` → `const { id } = await params;`. Parse body with `await req.json().catch(() => null)`.
- Client fetch pattern: `useEffect` + `fetch('/api/...')` + `useState`; a `mounted` guard before rendering dates (server can't know client tz). Reuse `todayISO`/`toISODate` from `@/lib/dates`.
- CSS classes to reuse: `.app`, `.content`, `.stack`/`.stack-sm`, `.card`/`.card-row`, `.row`/`.row-main`, `.btn`/`.btn.block`/`.btn-add`, `.chip`/`.chip.low`/`.chip.run`, `.section-label`, `.field`/`.field-label`/`.input`, `.notice`/`.notice.ok`, `.empty`, `.week`/`.day`, `.eb` (eyebrow), `.chrome`.
- `Sheet` props: `{ open: boolean; title: string; onClose: () => void; children }`.
- Progress bar: replicate the `MacroBar` markup from `src/app/nutrition/page.tsx:279`.
- `GET /api/nutrition/analysis?mode=day&date=YYYY-MM-DD` returns the day's nutrition (has `total`, `planned`, and goals). Confirm its exact response shape when wiring the header.
- Slots via `GET /api/slots` → `[{id,name,timeOfDay}]`. Products `GET /api/products`, recipes `GET /api/recipes`.

Reference spec: `docs/superpowers/specs/2026-08-09-batch-tracker-design.md`. Depends on Plan 1 (merged into this branch).

---

### Task 1: Batch REST routes

**Files:**
- Create: `src/app/api/batches/route.ts` (GET list, POST pack)
- Create: `src/app/api/batches/[id]/route.ts` (GET one)
- Create: `src/app/api/batches/[id]/eat/route.ts` (POST eat, DELETE uneat)

- [ ] **Step 1: Implement `GET`/`POST` on `src/app/api/batches/route.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { listBatches, packBatch, type PackBatchInput } from "@/lib/batches";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(listBatches(db, session.user.householdId));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as Partial<PackBatchInput> | null;
  if (!b || typeof b.slotId !== "number" || !b.label?.trim() || typeof b.mealsTotal !== "number" || b.mealsTotal < 1) {
    return NextResponse.json({ error: "slotId, label, mealsTotal required" }, { status: 400 });
  }
  const batch = packBatch(db, session.user.householdId, {
    slotId: b.slotId, label: b.label.trim(), cookedDate: b.cookedDate ?? new Date().toISOString().slice(0, 10),
    mealsTotal: b.mealsTotal, items: Array.isArray(b.items) ? b.items : [],
  });
  return NextResponse.json(batch, { status: 201 });
}
```

- [ ] **Step 2: Implement `GET` on `src/app/api/batches/[id]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { getBatch } from "@/lib/batches";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const batch = getBatch(db, session.user.householdId, Number(id));
  if (!batch) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(batch);
}
```

- [ ] **Step 3: Implement `POST`/`DELETE` on `src/app/api/batches/[id]/eat/route.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { eatFromBatch, uneatFromBatch, getBatch } from "@/lib/batches";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const date = b?.date ?? new Date().toISOString().slice(0, 10);
  eatFromBatch(db, session.user.householdId, Number(id), date);
  return NextResponse.json(getBatch(db, session.user.householdId, Number(id)));
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const date = b?.date ?? new Date().toISOString().slice(0, 10);
  uneatFromBatch(db, session.user.householdId, Number(id), date);
  return NextResponse.json(getBatch(db, session.user.householdId, Number(id)));
}
```

- [ ] **Step 4: Manual verify + typecheck**

Run: `npx tsc --noEmit` → clean. Confirm `session.user.householdId` is the correct accessor (grep an existing route, e.g. `src/app/api/slots/route.ts`, and match it exactly — adjust if the session shape differs).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/batches
git commit -m "feat(batches): REST routes for list/pack/get/eat"
```

---

### Task 2: TodayAgenda component — active batches with countdown + eat

**Files:**
- Create: `src/components/TodayAgenda.tsx`
- Modify: `src/app/page.tsx`

Behavior: client component. On mount, `fetch('/api/batches')`. Render a header (eyebrow "Today" + the date, gated behind a `mounted` flag using `todayISO()` from `@/lib/dates`). List active batches as `.card` rows: label, slot name, and a countdown `.chip` — `.chip.run` (red) when `mealsRemaining <= 1` (the cook signal, text "cook soon"), else `.chip` showing `{mealsRemaining} left`. Each card has an **"Ate one"** `.btn` that `POST`s `/api/batches/:id/eat` (body `{date: todayISO()}`), optimistically decrements in local state, and reconciles from the response. If `mealsRemaining` is 0, disable "Ate one" and show the card faded. Empty state: `.empty` "No active batches — pack one below." A "＋ Pack a batch" `.btn.block` at the bottom opens the pack sheet (Task 3) — for this task, wire a `useState` `packOpen` and render a placeholder `<Sheet>` you complete in Task 3.

- [ ] **Step 1: Write the component**

Skeleton (fill JSX following `PlanEditor.tsx` / `nutrition/page.tsx` conventions; use the classes listed in the header):

```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { todayISO } from "@/lib/dates";

type Batch = { id: number; slotId: number; label: string; cookedDate: string; mealsTotal: number; mealsRemaining: number };
type Slot = { id: number; name: string; timeOfDay: string };

export function TodayAgenda({ userName }: { userName?: string | null }) {
  const [mounted, setMounted] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [packOpen, setPackOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    const [b, s] = await Promise.all([
      fetch("/api/batches").then((r) => r.json()),
      fetch("/api/slots").then((r) => r.json()),
    ]);
    setBatches(b); setSlots(s);
  }, []);
  useEffect(() => { load(); }, [load]);

  const slotName = (id: number) => slots.find((s) => s.id === id)?.name ?? "";

  async function eat(id: number) {
    setBatches((bs) => bs.map((b) => b.id === id ? { ...b, mealsRemaining: Math.max(0, b.mealsRemaining - 1) } : b));
    const updated: Batch = await fetch(`/api/batches/${id}/eat`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: todayISO() }),
    }).then((r) => r.json());
    setBatches((bs) => bs.map((b) => b.id === id ? updated : b));
  }

  return (
    <div className="app">
      <header className="chrome"><span className="eb">Today</span><h1>{mounted ? todayISO() : ""}</h1></header>
      <div className="content stack">
        {batches.length === 0 && <p className="empty">No active batches — pack one below.</p>}
        {batches.map((b) => {
          const low = b.mealsRemaining <= 1;
          return (
            <div key={b.id} className="card" style={b.mealsRemaining === 0 ? { opacity: 0.5 } : undefined}>
              <div className="row-main"><b>{b.label}</b><span className="section-label">{slotName(b.slotId)}</span></div>
              <span className={low ? "chip run" : "chip"}>{low ? (b.mealsRemaining === 0 ? "empty · cook" : "1 left · cook soon") : `${b.mealsRemaining} left`}</span>
              <button className="btn" disabled={b.mealsRemaining === 0} onClick={() => eat(b.id)}>Ate one</button>
            </div>
          );
        })}
        <button className="btn block" onClick={() => setPackOpen(true)}>＋ Pack a batch</button>
        <Link className="btn-link" href="/plan">Open full planner</Link>
      </div>
      <Sheet open={packOpen} title="Pack a batch" onClose={() => setPackOpen(false)}>
        {/* Task 3 fills this */}
      </Sheet>
    </div>
  );
}
```

- [ ] **Step 2: Mount on the home page**

Replace `src/app/page.tsx` body to render `TodayAgenda` instead of `PlanEditor`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TodayAgenda } from "@/components/TodayAgenda";

export default async function HomePage() {
  const session = await auth();
  if (!session) redirect("/login");
  return <TodayAgenda userName={session.user.name ?? session.user.email ?? null} />;
}
```

- [ ] **Step 3: Preserve the old planner at `/plan`**

Create `src/app/plan/page.tsx` so the "Open full planner" link works and nothing is lost:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PlanEditor } from "@/components/PlanEditor";

export default async function PlanPage() {
  const session = await auth();
  if (!session) redirect("/login");
  return <PlanEditor userName={session.user.name ?? session.user.email ?? null} />;
}
```

- [ ] **Step 4: Typecheck + eyeball**

Run: `npx tsc --noEmit` → clean. If dev server is running on 29999, open `/` and confirm it renders without console errors (empty state is fine — no batches yet).

- [ ] **Step 5: Commit**

```bash
git add src/components/TodayAgenda.tsx src/app/page.tsx src/app/plan/page.tsx
git commit -m "feat(batches): Today home screen lists active batches with eat/countdown"
```

---

### Task 3: Pack-a-batch sheet

**Files:**
- Modify: `src/components/TodayAgenda.tsx` (fill the `Sheet` body + a `PackForm`)

Behavior: a form inside the sheet. Fields: **slot** (`<select>` from `slots`), **label** (`.input`), **meals** (a number stepper, default 4, min 1), and **contents** — a repeatable list of item lines; each line is a picker choosing a recipe OR a product (fetch `/api/recipes` and `/api/products`) plus an amount `.input`. "Add item" adds a line. On "Pack", `POST /api/batches` with `{slotId, label, mealsTotal, cookedDate: todayISO(), items:[{recipeId?|productId?, amount}]}`, then close the sheet and `load()`. Keep it simple — reuse `.field`/`.input`/`.btn`. YAGNI: no variant picker yet (defer; products with variants just use the base). Mark deferred bits with a `// ponytail:` comment.

- [ ] **Step 1: Add recipe/product fetching + PackForm state**

Extend `TodayAgenda` to also fetch `/api/recipes` and `/api/products` in `load()`, store as `recipes`/`products`. Add a `PackForm` (inline component or within the sheet) holding `slotId`, `label`, `mealsTotal`, and `items: {kind:'recipe'|'product'; refId:number; amount:number}[]`.

- [ ] **Step 2: Render the form in the Sheet and wire submit**

```tsx
async function pack(form: { slotId: number; label: string; mealsTotal: number; items: { kind: "recipe" | "product"; refId: number; amount: number }[] }) {
  const items = form.items.map((it) => it.kind === "recipe"
    ? { recipeId: it.refId, amount: it.amount }
    : { productId: it.refId, amount: it.amount });
  await fetch("/api/batches", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slotId: form.slotId, label: form.label, mealsTotal: form.mealsTotal, cookedDate: todayISO(), items }),
  });
  setPackOpen(false);
  await load();
}
```

Build the form JSX with `.field`/`.field-label`/`.input`, a slot `<select>`, a meals stepper (two `.btn` +/- around a number, or reuse the `Stepper` component `PlanEditor` imports — check its props first), and the item-line editor. Validate `slotId` and non-empty `label` before enabling "Pack".

- [ ] **Step 3: Typecheck + manual verify**

Run: `npx tsc --noEmit` → clean. With the dev server, pack a batch (e.g. slot Lunch, label "Biryani lunch", 4 meals, one product item) → sheet closes → batch appears with "4 left".

- [ ] **Step 4: Commit**

```bash
git add src/components/TodayAgenda.tsx
git commit -m "feat(batches): pack-a-batch sheet (slot, label, meals, items)"
```

---

### Task 4: Goal-progress header on Today

**Files:**
- Modify: `src/components/TodayAgenda.tsx`
- Modify (only if needed): `src/app/nutrition/page.tsx` (export `MacroBar`) — otherwise replicate the markup locally

Behavior: below the header, show today's progress. Fetch `GET /api/nutrition/analysis?mode=day&date=<todayISO()>` and render calorie + protein bars using the `MacroBar` markup (cooked/planned/goal). Also show a simple "meals eaten today" count if easily available from the response; otherwise just kcal + protein. **First read the analysis route + `nutrition/page.tsx` to confirm the exact response field names** (`total.calories`, `total.proteinG`, `planned.*`, and where goals come from) and match them.

- [ ] **Step 1: Fetch analysis for today and render bars**

Add to `load()` a fetch of the analysis endpoint for `todayISO()`; store in state. Render two `MacroBar`s (Calories, Protein) beneath the header. Replicate the `MacroBar` component markup from `nutrition/page.tsx:279` locally in `TodayAgenda` (do NOT restructure the nutrition page) unless exporting it is trivially clean.

- [ ] **Step 2: Typecheck + verify**

Run: `npx tsc --noEmit` → clean. With a batch packed and one serving eaten, confirm the Calories/Protein bars move (eaten basis: eating increments them).

- [ ] **Step 3: Commit**

```bash
git add src/components/TodayAgenda.tsx
git commit -m "feat(batches): Today goal-progress bars (kcal, protein) on eaten basis"
```

---

### Task 5: Playwright smoke test for the batch loop

**Files:**
- Create: `e2e/batches.spec.ts` (match the repo's existing Playwright dir/config — find it first)

- [ ] **Step 1: Locate the Playwright setup**

Find the existing e2e tests + config (`grep -rl "@playwright/test" .` , look for `playwright.config.*` and any existing `*.spec.ts`). Match their login helper, baseURL (dev server on 29999), and file location exactly. If a login fixture/helper exists, reuse it (`demo@demo.com` / `demo1234`).

- [ ] **Step 2: Write the smoke test**

Test flow (adapt selectors to the real DOM + the repo's existing test style):
1. Log in and go to `/`.
2. Assert the Today header renders.
3. Click "＋ Pack a batch", fill slot + label ("E2E Lunch") + meals (2) + one item, submit.
4. Assert a card with "E2E Lunch" and "2 left" appears.
5. Click "Ate one" → assert it shows "1 left · cook soon" (the low/cook-signal state).
6. Click "Ate one" again → assert "empty · cook" and the button is disabled.

Use resilient selectors (roles/text), not brittle CSS. Keep it one spec file.

- [ ] **Step 3: Run it**

Run the repo's Playwright command (e.g. `npx playwright test e2e/batches.spec.ts`) against the dev server on 29999 (start it if needed per project memory). Expected: PASS. If the runner needs the server, follow the repo's existing convention (webServer in config, or a running instance).

- [ ] **Step 4: Commit**

```bash
git add e2e/batches.spec.ts
git commit -m "test(batches): e2e smoke — pack, eat, cook-signal"
```

---

## Self-review notes

- **Spec coverage (Plan 2 slice):** cook-day/countdown + one-tap eat + progress header (Tasks 2, 4), pack flow incl. the ＋ (Tasks 2–3), API surface (Task 1), e2e proof (Task 5). Home replaced by the agenda with the old planner preserved at `/plan`.
- **Deferred to Plan 3:** the full *adaptive 7-day scroll* (past eaten-summary / future cook-flags), the *fixed daily template* auto-fill, the ＋ "one-off meal" option, cloning a past batch / cook-flag pre-fill, mixed batch+stock *component* modeling on template meals, variant pickers in the pack sheet, and the global rewire of non-batch meal-event nutrition to an eaten basis. This plan delivers the working batch loop; Plan 3 turns it into the full agenda.
- **Placeholder note:** component JSX is specified as structure + skeletons + exact data contracts rather than every line, because the implementer should mirror the established `PlanEditor.tsx` / `nutrition/page.tsx` patterns and the listed CSS classes. All API routes and the data-flow contracts are given as complete code. The implementer must read `nutrition/page.tsx` (MacroBar + analysis shape), `Stepper`/`Sheet` props, and the Playwright setup before those tasks.
- **Type consistency:** the `Batch` shape (`id, slotId, label, cookedDate, mealsTotal, mealsRemaining`) matches Plan-1's `batches` table and `packBatch`/`getBatch` returns. Endpoints: `GET/POST /api/batches`, `GET /api/batches/:id`, `POST/DELETE /api/batches/:id/eat`.
