"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

const inputStyle: React.CSSProperties = {
  background: "var(--paper-raised)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: 11,
  width: "100%",
  font: "inherit",
  fontSize: 15,
  color: "var(--ink)",
};

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 9,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "var(--sage)",
  display: "block",
  marginBottom: 6,
};

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      if (mode === "register") {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password, householdName }),
        });
        if (!res.ok) {
          setError((await res.json()).error ?? "Registration failed");
          return;
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError("Invalid email or password");
      } else {
        window.location.href = "/";
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <div className="chrome">
        <p className="eb">MealPal</p>
        <h1>{mode === "login" ? "Welcome back" : "Set up your household"}</h1>
      </div>

      <div style={{ padding: 16 }}>
        {error && (
          <p
            style={{
              fontSize: 13,
              margin: "0 0 14px",
              padding: "9px 11px",
              borderRadius: 8,
              background: "var(--run-bg)",
              color: "var(--run-ink)",
            }}
          >
            {error}
          </p>
        )}

        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="email" style={labelStyle}>
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@household.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="password" style={labelStyle}>
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          {mode === "register" && (
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="household" style={labelStyle}>
                Household name
              </label>
              <input
                id="household"
                placeholder="The Kitchen Table"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}

          <button type="submit" className="btn" style={{ width: "100%" }} disabled={busy}>
            {busy ? "…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
          style={{
            display: "block",
            width: "100%",
            background: "none",
            border: "none",
            cursor: "pointer",
            marginTop: 18,
            fontFamily: "var(--body)",
            fontWeight: 600,
            fontSize: 14,
            color: "var(--enamel)",
            minHeight: 44,
          }}
        >
          {mode === "login" ? "Need an account? Register" : "Have an account? Log in"}
        </button>
      </div>
    </main>
  );
}
