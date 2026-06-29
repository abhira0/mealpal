"use client";

import { useState } from "react";

// Downscale a picked photo to a legible JPEG Blob (text must stay readable, so
// much larger than the 64px favicon path) and normalize HEIC/PNG → JPEG.
function toJpegBlob(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1400;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode image"))), "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image")); };
    img.src = url;
  });
}

/**
 * Upload / replace / remove a product's nutrition-facts label photo. Saves to
 * the public folder via /api/products/:id/nutrition; reports the new path back.
 */
export function NutritionPhoto({
  productId,
  photo,
  onChange,
}: {
  productId: number;
  photo: string | null;
  onChange?: (photo: string | null) => void;
}) {
  const [current, setCurrent] = useState(photo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // bump to cache-bust the <img> after a replace (same path, new bytes)
  const [v, setV] = useState(0);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const blob = await toJpegBlob(file);
      const form = new FormData();
      form.append("photo", new File([blob], "label.jpg", { type: "image/jpeg" }));
      const res = await fetch(`/api/products/${productId}/nutrition`, { method: "PUT", body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload failed");
      const { nutritionPhoto } = await res.json();
      setCurrent(nutritionPhoto);
      setV((n) => n + 1);
      onChange?.(nutritionPhoto);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/products/${productId}/nutrition`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) { setCurrent(null); onChange?.(null); }
    else setError("Couldn't remove photo");
  }

  const inputId = `nutrition-photo-${productId}`;
  return (
    <div className="stack-sm">
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${current}?v=${v}`}
          alt="Nutrition facts label"
          style={{ display: "block", maxHeight: 220, borderRadius: 8, border: "1px solid var(--line, #0001)" }}
        />
      ) : (
        <p style={{ margin: 0, opacity: 0.6 }}>No nutrition photo yet.</p>
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <label htmlFor={inputId} className="trigger add" style={{ cursor: "pointer" }}>
          {busy ? "…" : current ? "Replace photo" : "Upload photo"}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
        />
        {current && (
          <button type="button" className="btn-link danger" style={{ width: "auto" }} disabled={busy} onClick={remove}>
            Remove
          </button>
        )}
      </div>
      {error && <p className="notice" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
