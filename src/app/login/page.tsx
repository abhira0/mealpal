"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

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
    <>
      <header className="chrome">
        <p className="eb">MealPal</p>
        <h1>{mode === "login" ? "Welcome back" : "Set up your household"}</h1>
      </header>

      <div className="content stack">
        {error && <p className="notice">{error}</p>}

        <form onSubmit={onSubmit} className="stack">
          <label className="field">
            <span className="field-label">Email</span>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="you@household.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {mode === "register" && (
            <label className="field">
              <span className="field-label">Household name</span>
              <input
                id="household"
                className="input"
                placeholder="The Kitchen Table"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
              />
            </label>
          )}

          <button type="submit" className="btn block" disabled={busy}>
            {busy ? "…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          className="btn-link"
          style={{ justifyContent: "center" }}
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
        >
          {mode === "login" ? "Need an account? Register" : "Have an account? Log in"}
        </button>
      </div>
    </>
  );
}
