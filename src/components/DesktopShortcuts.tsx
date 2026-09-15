"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { Sheet } from "@/components/Sheet";

// "g" then a letter jumps to a section — mirrors the bottom nav / command
// palette destinations. Bare keys only, so nothing here ever shadows a
// browser Cmd/Ctrl default (Cmd/Ctrl-K stays in CommandPalette.tsx).
const GOTO: Record<string, { href: string; label: string }> = {
  t: { href: "/", label: "Today" },
  p: { href: "/plan", label: "Plan" },
  n: { href: "/nutrition", label: "Nutrition" },
  a: { href: "/pantry", label: "Pantry" },
  s: { href: "/shop", label: "Shop" },
  r: { href: "/recipes", label: "Recipes" },
};

const GOTO_MS = 900; // window to complete a "g <letter>" chord

/**
 * Global desktop keyboard shortcuts for the dense power-user desktop split
 * (src/views/desktop/*). Mounted once at the layout level; inert on mobile
 * and while any input/textarea/select/contenteditable has focus.
 *
 * "n" (new) and "[" / "]" (prev/next) are context-dependent — the action
 * differs per page — so this only dispatches window events for the mounted
 * view to act on, same pattern as CommandPalette's `platr:open-cmdk` event.
 * Esc is deliberately not handled here: Sheet.tsx already closes the topmost
 * sheet on Escape.
 */
export function DesktopShortcuts() {
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const [cheatOpen, setCheatOpen] = useState(false);
  const pendingGoto = useRef(false);
  const gotoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isDesktop) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }

      if (pendingGoto.current) {
        pendingGoto.current = false;
        if (gotoTimer.current) clearTimeout(gotoTimer.current);
        const dest = GOTO[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          router.push(dest.href);
        }
        return;
      }

      switch (e.key) {
        case "g":
          pendingGoto.current = true;
          gotoTimer.current = setTimeout(() => {
            pendingGoto.current = false;
          }, GOTO_MS);
          break;
        case "n":
          e.preventDefault();
          window.dispatchEvent(new Event("platr:shortcut-new"));
          break;
        case "[":
          e.preventDefault();
          window.dispatchEvent(new Event("platr:shortcut-prev"));
          break;
        case "]":
          e.preventDefault();
          window.dispatchEvent(new Event("platr:shortcut-next"));
          break;
        case "?":
          e.preventDefault();
          setCheatOpen((v) => !v);
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (gotoTimer.current) clearTimeout(gotoTimer.current);
    };
  }, [isDesktop, router]);

  if (!isDesktop) return null;

  return (
    <Sheet open={cheatOpen} title="Keyboard shortcuts" onClose={() => setCheatOpen(false)}>
      <div className="sh-body stack-sm">
        <p className="section-label" style={{ marginTop: 0 }}>Go to</p>
        {Object.entries(GOTO).map(([key, { label }]) => (
          <div key={key} className="row">
            <span className="row-main">{label}</span>
            <span className="chip">g {key}</span>
          </div>
        ))}
        <p className="section-label">Actions</p>
        <div className="row">
          <span className="row-main">New — meal (Today/Plan) or purchase (Pantry)</span>
          <span className="chip">n</span>
        </div>
        <div className="row">
          <span className="row-main">Previous day/week</span>
          <span className="chip">[</span>
        </div>
        <div className="row">
          <span className="row-main">Next day/week</span>
          <span className="chip">]</span>
        </div>
        <div className="row">
          <span className="row-main">Close a sheet</span>
          <span className="chip">esc</span>
        </div>
        <div className="row">
          <span className="row-main">Command palette</span>
          <span className="chip">⌘K</span>
        </div>
        <div className="row">
          <span className="row-main">This cheatsheet</span>
          <span className="chip">?</span>
        </div>
      </div>
    </Sheet>
  );
}
