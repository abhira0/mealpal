"use client";

import { useState } from "react";

// Brand logo for a shop. Prefers the stored website's domain; falls back to
// guessing it from the name (Costco → costco.com). Source is the DuckDuckGo
// favicon CDN — already globally + browser cached, so we store nothing.
// On load failure, shows a letter badge instead of a broken image.
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
  const domain =
    domainFrom(website) ?? name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
  // Explicit icon overrides the website-derived favicon.
  const src = iconUrl?.trim() || `https://icons.duckduckgo.com/ip3/${domain}.ico`;
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  if (failed) {
    return (
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          borderRadius: 6,
          background: "var(--line)",
          fontSize: size * 0.55,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {initial}
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
      onError={() => setFailed(true)}
      style={{ borderRadius: 6, objectFit: "contain", verticalAlign: "middle", flexShrink: 0 }}
    />
  );
}

// "https://www.costco.com/path" or "costco.com" → "costco.com". null if blank.
export function domainFrom(website?: string | null): string | null {
  const raw = website?.trim();
  if (!raw) return null;
  const host = raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
  return host || null;
}
