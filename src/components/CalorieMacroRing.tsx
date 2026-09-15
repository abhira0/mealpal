"use client";

import type { Nutrients } from "@/lib/nutrition";
import { EChart, useThemeVars } from "@/components/EChart";

// Chart-only macro hues (DESIGN.md): protein = accent teal, carbs, fat. These are
// CSS custom properties (globals.css) so dark mode re-colors them with no
// component change — DOM consumers (MacroBar) can use var() directly.
export const MACRO_COLOR = { protein: "var(--accent)", carbs: "var(--macro-carbs)", fat: "var(--macro-fat)" };

const pctOf = (value: number, goal: number | null) =>
  goal && goal > 0 ? Math.round((value / goal) * 100) : null;

// Combined view: inner donut = macro split, outer thin arc = calorie progress
// toward goal, calorie total in the center. One chart instead of two.
export function CalorieMacroRing({ cal, macros, goal, n }: {
  cal: number;
  macros: { carbs: number; fat: number; protein: number };
  goal: number;
  n: Pick<Nutrients, "carbsG" | "fatG" | "proteinG">;
}) {
  const theme = useThemeVars({
    protein: ["--accent", "#1E7A8C"],
    carbs: ["--macro-carbs", "#E0A63A"],
    fat: ["--macro-fat", "#E0684A"],
    ink: ["--ink", "#16191C"],
    track: ["--surface-3", "#DADFE4"],
  });
  if (macros.carbs + macros.fat + macros.protein === 0)
    return <p style={{ opacity: 0.6, textAlign: "center", margin: 0 }}>No calories logged.</p>;
  const r = (x: number) => Math.round(x);
  // params.data carries our custom `grams`; gauge series shows calories vs goal.
  const tip = (p: { seriesType: string; name: string; value: number; data?: { grams?: number } }) =>
    p.seriesType === "gauge"
      ? `Calories: ${Math.round(p.value)} / ${goal} kcal · ${pctOf(p.value, goal) ?? 0}%`
      : `${p.name}: ${p.value}% of calories · ${p.data?.grams ?? 0} g`;
  const reduceMotion =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const option = {
    animation: !reduceMotion,
    tooltip: { trigger: "item", formatter: tip },
    legend: {
      bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11, color: theme.ink },
      data: ["Carbs", "Fat", "Protein"],
    },
    series: [
      {
        name: "Macros", type: "pie", radius: ["46%", "68%"], center: ["50%", "46%"],
        avoidLabelOverlap: false, label: { show: false }, labelLine: { show: false },
        emphasis: { scaleSize: 6, itemStyle: { shadowBlur: 6, shadowColor: "rgba(0,0,0,0.2)" } },
        data: [
          { value: r(macros.carbs), name: "Carbs", grams: r(n.carbsG), itemStyle: { color: theme.carbs } },
          { value: r(macros.fat), name: "Fat", grams: r(n.fatG), itemStyle: { color: theme.fat } },
          { value: r(macros.protein), name: "Protein", grams: r(n.proteinG), itemStyle: { color: theme.protein } },
        ],
      },
      {
        type: "gauge", radius: "80%", center: ["50%", "46%"], startAngle: 90, endAngle: -270,
        min: 0, max: goal || 1, silent: false,
        progress: { show: true, width: 8, roundCap: true, itemStyle: { color: theme.protein } },
        axisLine: { lineStyle: { width: 8, color: [[1, theme.track]] } },
        pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        anchor: { show: false },
        detail: {
          offsetCenter: [0, "-4%"], fontSize: 24, fontWeight: 700, color: theme.ink,
          formatter: (v: number) => String(Math.round(v)),
        },
        title: { show: false },
        data: [{ value: cal }],
      },
    ],
  };
  return <EChart option={option as never} height={240} />;
}
