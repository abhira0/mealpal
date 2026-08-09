"use client";

import { useEffect, useRef, useState } from "react";
import { parseClip, fmtClip } from "@/lib/clip";
import type { EditableRecipe } from "@/components/RecipeSheet";

type Step = { text: string; startSeconds: number | null; endSeconds: number | null };

type YTPlayer = { getCurrentTime: () => number; destroy: () => void };

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<void> | null = null;
// Loads the YouTube IFrame Player API script once; resolves once window.YT is ready.
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    });
  }
  return ytApiPromise;
}

// Fullscreen step-by-step view that keeps the screen awake while cooking.
// Also doubles as a lightweight recipe-step editor: toggle "Edit" to rewrite
// step text, retime video clips against a live scrubbable player, and
// add/remove/reorder steps — each change autosaves via PUT /api/recipes/:id.
export function CookMode({
  recipe,
  videoId,
  onClose,
  onSaved,
}: {
  recipe: EditableRecipe;
  videoId?: string | null;
  onClose: () => void;
  onSaved: (recipe: EditableRecipe) => void;
}) {
  const [i, setI] = useState(0);
  // bump to remount the clip iframe → reloads at the step's start (YouTube's own
  // replay button ignores start/end and plays the whole video from 0)
  const [replay, setReplay] = useState(0);
  const [editing, setEditing] = useState(false);
  const [steps, setSteps] = useState<Step[]>(() =>
    recipe.steps.map((s) => ({ text: s.text, startSeconds: s.startSeconds ?? null, endSeconds: s.endSeconds ?? null })),
  );
  // ponytail: Wake Lock is feature-detected; unsupported browsers just don't keep the screen on.
  const lockRef = useRef<WakeLockSentinel | null>(null);
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);

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

  // lock background scroll while the overlay is up
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't hijack arrow keys / Escape while typing in the step editor.
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length, i, editing]);

  // Live scrubbable player for retiming clips, only while editing a video recipe.
  useEffect(() => {
    if (!editing || !videoId) return;
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || !playerHostRef.current) return;
      playerRef.current = new window.YT!.Player(playerHostRef.current, {
        videoId,
        playerVars: { rel: 0 },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [editing, videoId]);

  if (steps.length === 0) return null;

  const step = steps[i];

  function go(next: number) {
    if (editing) save(steps);
    setI(Math.max(0, Math.min(next, steps.length - 1)));
  }

  function toggleEditing() {
    if (editing) save(steps);
    setEditing((e) => !e);
  }

  function updateStep(patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  }

  function addStepAfter() {
    const next = [...steps.slice(0, i + 1), { text: "", startSeconds: null, endSeconds: null }, ...steps.slice(i + 1)];
    setSteps(next);
    setI(i + 1);
    save(next);
  }

  function deleteStep() {
    if (steps.length <= 1) return;
    const next = steps.filter((_, n) => n !== i);
    setSteps(next);
    setI((n) => Math.min(n, next.length - 1));
    save(next);
  }

  function moveStep(dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
    setI(j);
    save(next);
  }

  async function save(nextSteps: Step[]) {
    const res = await fetch(`/api/recipes/${recipe.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: recipe.name,
        baseServings: recipe.baseServings,
        notes: recipe.notes,
        totalMinutes: recipe.totalMinutes ?? null,
        ingredients: recipe.ingredients,
        media: recipe.media ?? [],
        steps: nextSteps,
      }),
    });
    if (res.ok) onSaved(await res.json());
  }

  function setClipFromPlayer(field: "startSeconds" | "endSeconds") {
    const t = playerRef.current?.getCurrentTime();
    if (t != null) updateStep({ [field]: Math.round(t) });
  }

  // Only show a clip when the step defines a real range (end after start) and the
  // recipe has a YouTube video. No time given (null, or a 0/0 placeholder) = no video.
  const hasClip =
    videoId != null &&
    step.startSeconds != null &&
    step.endSeconds != null &&
    step.endSeconds > step.startSeconds;
  const clip = hasClip
    ? `https://www.youtube.com/embed/${videoId}?start=${step.startSeconds}&end=${step.endSeconds}&autoplay=1&mute=1&rel=0&controls=0&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0`
    : null;

  return (
    <div className="cook-overlay" role="dialog" aria-label={`Cooking: ${recipe.name}`}>
      <div className="cook-top">
        <span className="cook-title">{recipe.name}</span>
        <div className="cook-top-actions">
          <button type="button" className="btn cook-edit-toggle" onClick={toggleEditing}>
            {editing ? "Done editing" : "✎ Edit"}
          </button>
          <button type="button" className="cook-x" onClick={onClose} aria-label="Exit cook mode">
            ✕
          </button>
        </div>
      </div>

      <div className="cook-step">
        <span className="cook-num">Step {i + 1} of {steps.length}</span>

        {editing ? (
          <div className="cook-edit">
            {videoId ? <div className="cook-edit-player" ref={playerHostRef} /> : null}

            <textarea
              className="input cook-edit-text"
              value={step.text}
              onChange={(e) => updateStep({ text: e.target.value })}
              placeholder={`Step ${i + 1}`}
              rows={3}
            />

            {videoId ? (
              <div className="cook-edit-clip-fields">
                <div className="cook-edit-clip-field">
                  <input
                    type="text"
                    className="input mono"
                    value={fmtClip(step.startSeconds)}
                    onChange={(e) => updateStep({ startSeconds: parseClip(e.target.value) })}
                    placeholder="Start (0:30)"
                    aria-label="Clip start"
                  />
                  <button type="button" className="btn" onClick={() => setClipFromPlayer("startSeconds")}>
                    Set to current time
                  </button>
                </div>
                <div className="cook-edit-clip-field">
                  <input
                    type="text"
                    className="input mono"
                    value={fmtClip(step.endSeconds)}
                    onChange={(e) => updateStep({ endSeconds: parseClip(e.target.value) })}
                    placeholder="End (0:48)"
                    aria-label="Clip end"
                  />
                  <button type="button" className="btn" onClick={() => setClipFromPlayer("endSeconds")}>
                    Set to current time
                  </button>
                </div>
              </div>
            ) : null}

            <div className="cook-edit-step-actions">
              <button type="button" className="btn" disabled={i === 0} onClick={() => moveStep(-1)}>
                ↑ Move up
              </button>
              <button type="button" className="btn" disabled={i === steps.length - 1} onClick={() => moveStep(1)}>
                ↓ Move down
              </button>
              <button type="button" className="btn" onClick={addStepAfter}>
                + Add step after
              </button>
              <button type="button" className="btn" disabled={steps.length <= 1} onClick={deleteStep}>
                Delete step
              </button>
            </div>
          </div>
        ) : (
          <>
            {clip ? (
              <>
                <div className="cook-clip">
                  <iframe
                    key={`${i}-${replay}`}
                    src={clip}
                    title={`Step ${i + 1} clip`}
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                  />
                </div>
                <button type="button" className="btn cook-replay" onClick={() => setReplay((n) => n + 1)}>
                  ↻ Replay clip
                </button>
              </>
            ) : null}
            <p className="cook-text">{step.text}</p>
          </>
        )}
      </div>

      <div className="cook-dots" aria-hidden="true">
        {steps.map((_, n) => (
          <span key={n} className={n === i ? "on" : ""} />
        ))}
      </div>

      <div className="cook-nav">
        <button type="button" className="btn" disabled={i === 0} onClick={() => go(i - 1)}>
          ← Back
        </button>
        {i < steps.length - 1 ? (
          <button type="button" className="btn" onClick={() => go(i + 1)}>
            Next →
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (editing) save(steps);
              onClose();
            }}
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
