"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
  }

  return (
    <main className="app-main" style={{ maxWidth: 420, paddingTop: 56 }}>
      <p className="mono" style={{ letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--paprika)", fontSize: 13, margin: "0 0 8px" }}>
        MealPal
      </p>
      <h1 style={{ marginBottom: 20 }}>
        {mode === "login" ? "Welcome back" : "Set up your household"}
      </h1>
      <form onSubmit={onSubmit} className="stack">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            placeholder="you@household.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {mode === "register" && (
          <div className="field">
            <label htmlFor="household">Household name</label>
            <input
              id="household"
              placeholder="The Kitchen Table"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
            />
          </div>
        )}
        <button type="submit" className="btn btn-primary">
          {mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
      {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
      <button
        type="button"
        className="btn-ghost"
        style={{ marginTop: 16, background: "none", border: "none", cursor: "pointer" }}
        onClick={() => setMode(mode === "login" ? "register" : "login")}
      >
        {mode === "login" ? "Need an account? Register" : "Have an account? Log in"}
      </button>
    </main>
  );
}
