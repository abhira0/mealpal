"use client";

import { useState, type CSSProperties } from "react";

// Product photos are scraped from vendor sites (src/lib/scrape-products.ts)
// and cached locally (src/lib/product-image.ts), but a cached file can still
// go missing (manual deletion, disk issue). Same onError -> neutral fallback
// pattern as Favicon: swap to a plain placeholder box instead of the
// browser's broken-image icon.
export function ProductImage({
  src,
  alt,
  width,
  height,
  className,
  style,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        aria-hidden
        className={className}
        style={{
          display: "inline-flex",
          width,
          height,
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r2)",
          boxSizing: "border-box",
          ...style,
        }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
      style={style}
    />
  );
}
