"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      className="btn-ghost"
      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--paper)", opacity: 0.85 }}
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      Sign out
    </button>
  );
}
