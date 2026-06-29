# Nutrition Analysis Tab — Design

**Date:** 2026-06-29
**Status:** Approved

## Goal

Add an analytical view to the nutrition page (MyFitnessPal-style): macro breakdown,
diet scorecards (heart-healthy / low-carb / high-protein), and editable per-household
calorie + macro goals. Day and week views.

## Decisions

- **Placement:** new **Analysis** tab alongside Day / Ingredients on `/nutrition`.
- **Window:** Day and Week, toggled. One `date` state drives both.
- **Goals:** per-household calorie + macro (P/C/F) targets, edited inline on the tab.
- **Layout:** Layout A — calorie ring (ECharts) + macro bars (CSS) + scorecard chips.
- **Charting:** Apache ECharts, used for the calorie ring and the week trend only.

## 1. Data model

New table `nutritionGoals`, one row per household:

```
nutritionGoals {
  householdId  integer PK, FK -> households.id
  calorieGoal  integer
  proteinG     integer
  carbsG       integer
  fatG         integer
}
```

No row = fall back to defaults `{ 2000 kcal, 150 P, 220 C, 65 F }` so the tab works
before anyone sets goals. New Drizzle migration, auto-run after generation.

## 2. Scorecard heuristics

Pure function `scorecards(nutrients): { heartHealthy, lowCarb, highProtein, reasons }`.
Evaluated on the day's totals (Day) or the daily average (Week). Thresholds are named
constants, marked `ponytail:` because they're tunable, DV-based defaults:

- **Heart-healthy** ✓ when: sat fat < 10% of calories AND sodium < 2300 mg AND
  added sugar < 10% of calories.
- **Low-carb** ✓ when: carbs provide < 26% of calories.
- **High-protein** ✓ when: protein provides ≥ 25% of calories.

Each card carries a reason string shown on tap (e.g. "Sodium 2,540mg over 2,300 limit").
Calories for the % math use the macro-derived figure (4·P + 4·C + 9·F) to avoid
divide-by-zero and label rounding noise.

**Test:** one `test_*` / assert-based self-check covering a pass case, a fail case per
card, and the zero-calorie guard.

## 3. Window aggregation

- **Day:** reuse existing `dayNutrition(db, householdId, date)`.
- **Week:** new `weekNutrition(db, householdId, mondayISO)` — loops the 7 days
  (Mon–Sun containing the selected date), returns `{ perDay: DayTotal[], average,
  daysWithMeals }`. The average is over days that have meals only, so a partial week
  isn't dragged down by empty days. Scorecards run on `average`.
- **Navigation:** Day mode uses the existing `<input type="date">`. Week mode shows
  `‹ <range> ›` prev/next buttons shifting the date by ±7 days. Monday is computed
  from the selected date.

## 4. API

- `GET /api/nutrition/analysis?mode=day|week&date=YYYY-MM-DD`
  → `{ goals, nutrients, perDay?, scorecards }`. `perDay` present only in week mode.
- `PUT /api/nutrition/goals` body `{ calorieGoal, proteinG, carbsG, fatG }`
  → upsert the household's row, returns the saved goals.

Both require an authenticated session (existing `auth()` pattern), scoped to
`session.user.householdId`.

## 5. Frontend (Analysis tab)

New `AnalysisTab` component rendered when `tab === "analysis"`, plus the tab button.

- **`<EChart>`** — one tiny component: `useRef` + `useEffect` that calls
  `echarts.init`, `setOption`, and disposes on unmount; re-runs `setOption` when the
  option prop changes. No `echarts-for-react`. `ponytail: direct echarts`.
- **Calorie ring:** ECharts gauge/doughnut, actual vs goal, % in the center.
- **Macro bars:** CSS bars (protein/carbs/fat vs goal grams). `ponytail: CSS, not a chart`.
- **Week trend:** ECharts stacked bar, one bar per day (P/C/F stacked) + goal line.
  Rendered only in Week mode from `perDay`.
- **Scorecard chips:** green pass / red fail; tap reveals the reason.
- **Edit goals:** inline expander with 4 number inputs → `PUT` → re-fetch.

## Out of scope (add later)

- Micronutrient scorecards, multiple diet presets, goal history/trends beyond the week
  view, separate settings page for goals.
