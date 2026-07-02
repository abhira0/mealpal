"use client";

import type { Nutrients } from "@/lib/nutrition";
import { EChart } from "@/components/EChart";

export const MACRO_COLOR = { protein: "#115E59", carbs: "#E0A526", fat: "#D1492C" };

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
  if (macros.carbs + macros.fat + macros.protein === 0)
    return <p style={{ opacity: 0.6, textAlign: "center", margin: 0 }}>No calories logged.</p>;
  const r = (x: number) => Math.round(x);
  // params.data carries our custom `grams`; gauge series shows calories vs goal.
  const tip = (p: { seriesType: string; name: string; value: number; data?: { grams?: number } }) =>
    p.seriesType === "gauge"
      ? `Calories: ${Math.round(p.value)} / ${goal} kcal · ${pctOf(p.value, goal) ?? 0}%`
      : `${p.name}: ${p.value}% of calories · ${p.data?.grams ?? 0} g`;
  const option = {
    tooltip: { trigger: "item", formatter: tip },
    legend: {
      bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11 },
      data: ["Carbs", "Fat", "Protein"],
    },
    series: [
      {
        name: "Macros", type: "pie", radius: ["42%", "62%"], center: ["50%", "46%"],
        avoidLabelOverlap: false, label: { show: false }, labelLine: { show: false },
        emphasis: { scaleSize: 6, itemStyle: { shadowBlur: 6, shadowColor: "rgba(0,0,0,0.2)" } },
        data: [
          { value: r(macros.carbs), name: "Carbs", grams: r(n.carbsG), itemStyle: { color: MACRO_COLOR.carbs } },
          { value: r(macros.fat), name: "Fat", grams: r(n.fatG), itemStyle: { color: MACRO_COLOR.fat } },
          { value: r(macros.protein), name: "Protein", grams: r(n.proteinG), itemStyle: { color: MACRO_COLOR.protein } },
        ],
      },
      {
        type: "gauge", radius: "92%", center: ["50%", "46%"], startAngle: 90, endAngle: -270,
        min: 0, max: goal || 1, silent: false,
        progress: { show: true, width: 7, roundCap: true, itemStyle: { color: MACRO_COLOR.protein } },
        axisLine: { lineStyle: { width: 7, color: [[1, "#e3ddcc"]] } },
        pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        anchor: { show: false },
        detail: {
          offsetCenter: [0, "-4%"], fontSize: 24, fontWeight: 800, color: "#20262B",
          formatter: (v: number) => String(Math.round(v)),
        },
        title: { show: false },
        data: [{ value: cal }],
      },
    ],
  };
  return <EChart option={option as never} height={240} />;
}
