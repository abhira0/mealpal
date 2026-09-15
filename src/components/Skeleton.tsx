"use client";

import type { CSSProperties } from "react";

/**
 * Pulsing placeholder block. Reuses the `.skel` pulse defined in globals.css
 * (killed under prefers-reduced-motion by the global animation kill-switch at
 * the bottom of that file). Size it via props to roughly match the content it
 * stands in for, so nothing reflows when the real data arrives.
 */
export function Skeleton({
  width = "100%",
  height = 14,
  radius = 6,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: CSSProperties;
}) {
  return <div className="skel" aria-hidden="true" style={{ width, height, borderRadius: radius, ...style }} />;
}

/** A stack of row-shaped skeletons for lists of unknown length (pantry/shop rows, ticket lines, table rows, …). */
export function SkeletonRows({
  count = 4,
  height = 56,
  gap = 8,
}: {
  count?: number;
  height?: number;
  gap?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </div>
  );
}
