"use client";

import { useEffect, useRef, useState } from "react";

type Step = { position: number; text: string; startSeconds: number | null; endSeconds: number | null };

// Fullscreen step-by-step view that keeps the screen awake while cooking.
export function CookMode({
  steps,
  title,
  videoId,
  onClose,
}: {
  steps: Step[];
  title: string;
  videoId?: string | null;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  // ponytail: Wake Lock is feature-detected; unsupported browsers just don't keep the screen on.
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    async function acquire() {
      try {
        lockRef.current = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        /* denied or unsupported — fine */
      }
    }
    acquire();
    // wake locks drop when the tab is hidden; re-acquire on return
    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, steps.length - 1));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps.length, onClose]);

  if (steps.length === 0) return null;

  const step = steps[i];
  // Show the step's video clip when it has a start time and the recipe has a YouTube video.
  const clip =
    videoId && step.startSeconds != null
      ? `https://www.youtube.com/embed/${videoId}?start=${step.startSeconds}` +
        (step.endSeconds != null ? `&end=${step.endSeconds}` : "") +
        "&autoplay=1&mute=1&rel=0"
      : null;

  return (
    <div className="cook-overlay" role="dialog" aria-label={`Cooking: ${title}`}>
      <div className="cook-top">
        <span className="cook-title">{title}</span>
        <button type="button" className="cook-x" onClick={onClose} aria-label="Exit cook mode">
          ✕
        </button>
      </div>

      <div className="cook-step">
        <span className="cook-num">Step {i + 1} of {steps.length}</span>
        {clip ? (
          <div className="cook-clip">
            <iframe
              key={i}
              src={clip}
              title={`Step ${i + 1} clip`}
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
            />
          </div>
        ) : null}
        <p className="cook-text">{step.text}</p>
      </div>

      <div className="cook-dots" aria-hidden="true">
        {steps.map((s, n) => (
          <span key={s.position ?? n} className={n === i ? "on" : ""} />
        ))}
      </div>

      <div className="cook-nav">
        <button type="button" className="btn" disabled={i === 0} onClick={() => setI((n) => n - 1)}>
          ← Back
        </button>
        {i < steps.length - 1 ? (
          <button type="button" className="btn" onClick={() => setI((n) => n + 1)}>
            Next →
          </button>
        ) : (
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}
