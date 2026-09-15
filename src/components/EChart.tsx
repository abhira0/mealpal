"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// EChart draws to <canvas>, which can't resolve CSS var(...) itself, so chart
// colors that need to follow dark mode (globals.css `@media (prefers-color-scheme)`)
// must be read as resolved values. `spec` maps a result key to [--custom-prop,
// fallback]; re-reads whenever the OS scheme flips (system-driven, no toggle)
// so an already-mounted chart repaints with the new palette.
export function useThemeVars<T extends Record<string, [string, string]>>(
  spec: T
): { [K in keyof T]: string } {
  const read = () =>
    Object.fromEntries(Object.entries(spec).map(([k, [name, fallback]]) => [k, cssVar(name, fallback)])) as {
      [K in keyof T]: string;
    };
  // Lazy initializer runs on mount (i.e. on the client, after hydration), so
  // this is already correct on first render — the effect only needs to
  // subscribe for later OS-level scheme flips.
  const [vals, setVals] = useState(read);
  useEffect(() => {
    const mql = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setVals(read());
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return vals;
}

// ponytail: direct echarts (init/setOption/dispose). Swap to a wrapper lib only
// if we end up with many charts.
export function EChart({ option, height = 200 }: { option: echarts.EChartsOption; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    chart.current = echarts.init(ref.current);
    const onResize = () => chart.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, true);
  }, [option]);

  return <div ref={ref} style={{ width: "100%", height }} />;
}
