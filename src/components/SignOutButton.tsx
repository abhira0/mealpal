"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      style={{
        display: "block",
        width: "100%",
        background: "none",
        border: "none",
        cursor: "pointer",
        fontFamily: "var(--body)",
        fontWeight: 700,
        fontSize: 15,
        color: "var(--paprika)",
        padding: 12,
        minHeight: 44,
      }}
    >
      Sign out
    </button>
  );
}
