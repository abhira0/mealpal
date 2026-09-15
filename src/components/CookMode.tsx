"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { parseClip, fmtClip } from "@/lib/clip";
import { parseStepDuration, resolveSwipe } from "@/lib/cook-mode-helpers";
import { useFocusTrap } from "@/lib/useFocusTrap";
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
// step text, retime video clips against a live player (hit play to start at
// this step's clip, or scrub + "Set to current time" to find a new one), and
// add/remove steps — each change autosaves via PUT /api/recipes/:id.
export function CookMode({
  recipe,
  videoId,
  onClose,
  onSaved,
  readOnly = false,
}: {
  recipe: EditableRecipe;
  videoId?: string | null;
  onClose: () => void;
  onSaved?: (recipe: EditableRecipe) => void;
  // Public shared view: no editing, no clip API (both are auth-gated).
  readOnly?: boolean;
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
  const overlayRef = useRef<HTMLDivElement | null>(null);
  // Excludes the clip player from swipe detection (see onStepPointerDown) — a
  // touch that starts on the video is the user scrubbing/using its own controls.
  const clipRef = useRef<HTMLDivElement | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [timer, setTimer] = useState<{ remaining: number; running: boolean; done: boolean } | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useFocusTrap(overlayRef, true);

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
    // `go` closes over `steps` (via `save`) — it must be in the deps, or an
    // edit to step text/clip time followed by an arrow key reverts it by
    // saving the stale pre-edit `steps` array.
  }, [steps, i, editing]);

  const curStart = steps[i]?.startSeconds ?? null;
  const curEnd = steps[i]?.endSeconds ?? null;

  // Live player while editing a video recipe: loads at this step's start/end
  // so play previews the clip, and exposes getCurrentTime() for "Set to
  // current time". Recreated whenever the step or its times change.
  useEffect(() => {
    if (!editing || !videoId) return;
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || !playerHostRef.current) return;
      playerRef.current = new window.YT!.Player(playerHostRef.current, {
        videoId,
        playerVars: { rel: 0, start: curStart ?? 0, ...(curEnd != null ? { end: curEnd } : {}) },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [editing, videoId, i, curStart, curEnd]);

  // Clear any running kitchen timer on unmount (per-step reset happens
  // explicitly wherever `i` changes — see resetTimer below — rather than in
  // an effect, to avoid a setState-in-effect cascade).
  useEffect(
    () => () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    },
    [],
  );

  if (steps.length === 0) return null;

  const step = steps[i];

  // Any running/finished kitchen timer belongs to the step that started it —
  // clear it whenever the current step changes.
  function resetTimer() {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setTimer(null);
  }

  function go(next: number) {
    if (editing) save(steps);
    const clamped = Math.max(0, Math.min(next, steps.length - 1));
    if (clamped !== i) resetTimer();
    setI(clamped);
  }

  // Swipe left/right over the step area to change steps. Scoped to this
  // container (not the whole overlay) so it doesn't fight the clip player's
  // own touch handling — a pointerdown starting inside the clip (scrubbing
  // the video) is ignored entirely, and small/vertical drags fall through to
  // normal scrolling.
  function onStepPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (editing) return;
    if (clipRef.current?.contains(e.target as Node)) return;
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
  }

  function onStepPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const dir = resolveSwipe(e.clientX - start.x, e.clientY - start.y);
    if (dir === 1) go(i + 1);
    else if (dir === -1) go(i - 1);
  }

  function onStepPointerCancel() {
    swipeStartRef.current = null;
  }

  // Synthesizes a short beep via Web Audio — no audio asset/dependency needed.
  function playBeep() {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
      osc.onended = () => ctx.close();
    } catch {
      /* Web Audio unsupported/blocked — the "Timer done" state still shows visually. */
    }
  }

  function startTimer(seconds: number) {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setTimer({ remaining: seconds, running: true, done: false });
    timerIntervalRef.current = setInterval(() => {
      setTimer((t) => {
        if (!t) return t;
        const remaining = t.remaining - 1;
        if (remaining <= 0) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
          playBeep();
          return { remaining: 0, running: false, done: true };
        }
        return { ...t, remaining };
      });
    }, 1000);
  }

  function toggleEditing() {
    if (editing) save(steps);
    setEditing((e) => !e);
  }

  function updateStep(patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  }

  function addStepBefore() {
    const next = [...steps.slice(0, i), { text: "", startSeconds: null, endSeconds: null }, ...steps.slice(i)];
    setSteps(next);
    save(next);
  }

  function addStepAfter() {
    const next = [...steps.slice(0, i + 1), { text: "", startSeconds: null, endSeconds: null }, ...steps.slice(i + 1)];
    setSteps(next);
    setI(i + 1);
    save(next);
  }

  function deleteStep() {
    if (steps.length <= 1) return;
    if (!window.confirm("Delete this step?")) return;
    const next = steps.filter((_, n) => n !== i);
    setSteps(next);
    setI((n) => Math.min(n, next.length - 1));
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
    if (res.ok) onSaved?.(await res.json());
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
  // Own cached, muted, brand-free clip — see src/lib/video-clip.ts — instead
  // of embedding YouTube (which always shows its title/channel/suggestions
  // overlay for the first few seconds of every clip, no matter the params).
  const clip = hasClip ? `/api/clip/${videoId}/${step.startSeconds}/${step.endSeconds}` : null;

  // Rough duration parsed out of the step text (e.g. "simmer for 10 minutes"),
  // offered as a one-tap kitchen timer. View mode only — editing shows a textarea.
  const stepDuration = !editing ? parseStepDuration(step.text) : null;

  // Portal to body: on desktop this renders inside the sticky, scrolling
  // .md-pane, which would otherwise clip the fixed overlay to the pane.
  return createPortal(
    <div className="cook-overlay" role="dialog" aria-modal="true" aria-label={`Cooking: ${recipe.name}`} ref={overlayRef}>
      <div className="cook-top">
        <span className="cook-title">{recipe.name}</span>
        <div className="cook-top-actions">
          {!readOnly ? (
            <button type="button" className="btn cook-edit-toggle" onClick={toggleEditing}>
              {editing ? "Done editing" : "✎ Edit"}
            </button>
          ) : null}
          {editing ? (
            <button
              type="button"
              className="btn cook-edit-toggle"
              disabled={steps.length <= 1}
              onClick={deleteStep}
            >
              Delete step
            </button>
          ) : null}
          <button type="button" className="cook-x" onClick={onClose} aria-label="Exit cook mode">
            ✕
          </button>
        </div>
      </div>

      <div
        className="cook-step"
        onPointerDown={onStepPointerDown}
        onPointerUp={onStepPointerUp}
        onPointerCancel={onStepPointerCancel}
      >
        <span className="cook-num">Step {i + 1} of {steps.length}</span>

        {editing ? (
          <div className="cook-edit">
            {videoId ? (
              <div className="cook-edit-media">
                <div className="cook-edit-clip" ref={playerHostRef} />
                <div className="cook-edit-times">
                  <div className="cook-edit-clip-field">
                    <span className="field-label">Start</span>
                    <input
                      type="text"
                      className="input mono"
                      value={fmtClip(step.startSeconds)}
                      onChange={(e) => updateStep({ startSeconds: parseClip(e.target.value) })}
                      placeholder="0:30"
                      aria-label="Clip start"
                    />
                    <button type="button" className="btn" onClick={() => setClipFromPlayer("startSeconds")}>
                      Set to current time
                    </button>
                  </div>
                  <div className="cook-edit-clip-field">
                    <span className="field-label">End</span>
                    <input
                      type="text"
                      className="input mono"
                      value={fmtClip(step.endSeconds)}
                      onChange={(e) => updateStep({ endSeconds: parseClip(e.target.value) })}
                      placeholder="0:48"
                      aria-label="Clip end"
                    />
                    <button type="button" className="btn" onClick={() => setClipFromPlayer("endSeconds")}>
                      Set to current time
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <textarea
              className="cook-text cook-edit-text"
              value={step.text}
              onChange={(e) => updateStep({ text: e.target.value })}
              placeholder={`Step ${i + 1}`}
              rows={3}
            />

          </div>
        ) : (
          <>
            {clip ? (
              <>
                <div className="cook-clip" ref={clipRef}>
                  <video key={`${i}-${replay}`} src={clip} autoPlay playsInline controls /></div>
                <button type="button" className="btn cook-replay" onClick={() => setReplay((n) => n + 1)}>
                  ↻ Replay clip
                </button>
              </>
            ) : null}
            <p className="cook-text">{step.text}</p>
            {stepDuration != null ? (
              timer?.done ? (
                <span className="btn cook-timer done" role="status">⏰ Timer done</span>
              ) : timer?.running ? (
                <span className="btn cook-timer" role="timer" aria-live="polite">
                  {fmtClip(timer.remaining)}
                </span>
              ) : (
                <button type="button" className="btn cook-timer" onClick={() => startTimer(stepDuration)}>
                  ⏱ Start timer ({fmtClip(stepDuration)})
                </button>
              )
            ) : null}
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
        {editing ? (
          <button type="button" className="btn" onClick={addStepBefore}>
            + Before
          </button>
        ) : null}
        {editing ? (
          <button type="button" className="btn" onClick={addStepAfter}>
            + After
          </button>
        ) : null}
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
    </div>,
    document.body,
  );
}
