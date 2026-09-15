"use client";

import { useState } from "react";

// Brand logo for a shop. Prefers an explicit iconUrl, else the stored website's
// domain via the DuckDuckGo favicon CDN (globally + browser cached, so we store
// nothing). House style (DESIGN.md) is a cool near-monochrome field with a
// single teal accent, so:
//   - With no real image source (no iconUrl and no website), we DON'T guess a
//     domain from the name — guessed favicons are the garish red/purple auto-
//     generated blocks. Instead we render a clean neutral monogram tile.
//   - On load failure we fall back to the same neutral monogram tile.
export function Favicon({
  name,
  website,
  iconUrl,
  size = 24,
}: {
  name: string;
  website?: string | null;
  iconUrl?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  const icon = iconUrl?.trim();
  const domain = domainFrom(website);
  // Explicit icon overrides the website-derived favicon. Only build a source
  // when we have a real one — we never guess a domain from the name.
  const src = icon || (domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : null);

  // Neutral monogram tile: on-brand fallback for missing/failed images.
  if (!src || failed) {
    return (
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r2)",
          color: "var(--ink-3)",
          fontFamily: "var(--mono)",
          fontSize: size * 0.42,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          flexShrink: 0,
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        {monogram(name)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      style={{
        objectFit: "contain",
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    />
  );
}

// First 1–2 letters for the fallback tile: initials of the first two words
// (e.g. "Trader Joe's" → "TJ"), else the first two characters of one word.
function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// "https://www.costco.com/path" or "costco.com" → "costco.com". null if blank.
export function domainFrom(website?: string | null): string | null {
  const raw = website?.trim();
  if (!raw) return null;
  const host = raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
  return host || null;
}
