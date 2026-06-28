# MealPal Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Next.js + SQLite app you can log into, where every user belongs to a household and all data will be scoped by `household_id`.

**Architecture:** Single Next.js (App Router, TypeScript) repo running with `next start` on a home server. SQLite via better-sqlite3, schema + migrations via Drizzle. Auth.js (NextAuth v5) Credentials provider with bcrypt-hashed passwords and JWT sessions. Registration creates a household + its first user in one transaction; the user's `household_id` rides in the JWT/session so later features can scope queries to it. No roles, no invites — one shared household per user for now.

**Tech Stack:** Next.js 15, TypeScript, better-sqlite3, Drizzle ORM + drizzle-kit, next-auth@beta (Auth.js v5), bcryptjs, Vitest.

---

## File Structure

- `package.json`, `tsconfig.json`, `next.config.ts` — scaffold (created by `create-next-app`).
- `.env.local` — `AUTH_SECRET`, `DATABASE_URL` (gitignored).
- `drizzle.config.ts` — drizzle-kit config pointing at the schema + sqlite file.
- `src/db/schema.ts` — Drizzle tables: `households`, `users`. The base every future table scopes against.
- `src/db/index.ts` — singleton better-sqlite3 connection + Drizzle client.
- `src/lib/password.ts` — `hashPassword` / `verifyPassword` (pure, unit-tested).
- `src/lib/users.ts` — `registerHousehold` (creates household + user in a tx) and `findUserByEmail` (the data-layer logic, unit-tested against in-memory SQLite).
- `src/auth.ts` — NextAuth config (Credentials provider, JWT callbacks injecting `householdId`).
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js route handlers.
- `src/app/api/register/route.ts` — registration endpoint.
- `src/middleware.ts` — redirects unauthenticated users to `/login`.
- `src/app/login/page.tsx` — login + register form (client component).
- `src/app/page.tsx` — protected home page showing the logged-in user + household.
- `vitest.config.ts`, `src/test/db.ts` — test runner + in-memory DB helper.

---

## Task 1: Scaffold the Next.js project

**Files:**
- Create: entire project scaffold in `/Users/abhishekr/git_repos/mealpal`

- [ ] **Step 1: Scaffold into the current directory**

Run (the `.` targets the current dir; it is empty except `docs/`):

```bash
cd /Users/abhishekr/git_repos/mealpal
npx create-next-app@latest . --ts --app --src-dir --eslint --no-tailwind --import-alias "@/*" --use-npm --no-turbopack
```

If it refuses because `docs/` exists, answer "yes" to proceed in a non-empty directory.

- [ ] **Step 2: Initialize git and verify dev server boots**

```bash
git init
npm run dev
```

Expected: dev server starts on http://localhost:3000 and serves the default page. Stop it with Ctrl-C.

- [ ] **Step 3: Commit the scaffold**

```bash
git add -A
git commit -m "chore: scaffold Next.js app"
```

---

## Task 2: Install dependencies and configure SQLite + Drizzle

**Files:**
- Create: `drizzle.config.ts`, `src/db/schema.ts`, `src/db/index.ts`
- Modify: `.gitignore`, `package.json` (scripts)
- Create: `.env.local`

- [ ] **Step 1: Install dependencies**

```bash
npm install better-sqlite3 drizzle-orm next-auth@beta bcryptjs
npm install -D drizzle-kit @types/better-sqlite3 vitest
```

- [ ] **Step 2: Create the env file and gitignore it**

Create `.env.local`:

```
DATABASE_URL=./mealpal.db
AUTH_SECRET=replace-with-a-long-random-string
```

Generate a real secret and paste it over the placeholder:

```bash
npx auth secret
```

Append to `.gitignore`:

```
# local database
*.db
*.db-journal
.env.local
```

- [ ] **Step 3: Write the Drizzle schema**

Create `src/db/schema.ts`:

```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const households = sqliteTable("households", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id")
    .notNull()
    .references(() => households.id),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

- [ ] **Step 4: Write the DB client**

Create `src/db/index.ts`:

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database(process.env.DATABASE_URL ?? "./mealpal.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
```

- [ ] **Step 5: Write the drizzle-kit config**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "./mealpal.db" },
});
```

- [ ] **Step 6: Add db scripts to package.json**

In `package.json` `"scripts"`, add:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"test": "vitest run"
```

- [ ] **Step 7: Generate and apply the first migration**

```bash
npm run db:generate
npm run db:migrate
```

Expected: a `drizzle/0000_*.sql` file is created and applied; `mealpal.db` now exists with `households` and `users` tables. Verify:

```bash
sqlite3 mealpal.db ".tables"
```

Expected output includes `households` and `users`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add SQLite + Drizzle with households/users schema"
```

---

## Task 3: Password hashing utility (TDD)

**Files:**
- Create: `src/lib/password.ts`
- Create: `vitest.config.ts`
- Test: `src/lib/password.test.ts`

- [ ] **Step 1: Write the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/password.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("hunter2");
    expect(await verifyPassword("hunter2", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("hunter2");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("produces different hashes for the same input (salted)", async () => {
    expect(await hashPassword("x")).not.toBe(await hashPassword("x"));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/lib/password.test.ts`
Expected: FAIL — cannot resolve `@/lib/password`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/password.ts`:

```ts
import bcrypt from "bcryptjs";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/lib/password.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add password hashing utility"
```

---

## Task 4: Registration data layer (TDD)

**Files:**
- Create: `src/test/db.ts` (in-memory test DB helper)
- Create: `src/lib/users.ts`
- Test: `src/lib/users.test.ts`

- [ ] **Step 1: Write the in-memory test DB helper**

Create `src/test/db.ts`:

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/db/schema";

export function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

export type TestDb = ReturnType<typeof makeTestDb>;
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/users.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { registerHousehold, findUserByEmail } from "@/lib/users";

let db: TestDb;
beforeEach(() => {
  db = makeTestDb();
});

describe("registerHousehold", () => {
  it("creates a household and its first user, scoped together", async () => {
    const user = await registerHousehold(db, {
      email: "a@b.com",
      password: "hunter2",
      name: "Abhishek",
      householdName: "Home",
    });
    expect(user.email).toBe("a@b.com");
    expect(user.householdId).toBeTypeOf("number");

    const found = await findUserByEmail(db, "a@b.com");
    expect(found?.householdId).toBe(user.householdId);
    expect(found?.passwordHash).not.toBe("hunter2"); // stored hashed
  });

  it("rejects a duplicate email", async () => {
    const args = {
      email: "a@b.com",
      password: "x",
      name: null,
      householdName: "Home",
    };
    await registerHousehold(db, args);
    await expect(registerHousehold(db, args)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/lib/users.test.ts`
Expected: FAIL — cannot resolve `@/lib/users`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/users.ts`:

```ts
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "@/db";
import { hashPassword } from "@/lib/password";

type Db = BetterSQLite3Database<typeof schema>;

export interface RegisterInput {
  email: string;
  password: string;
  name: string | null;
  householdName: string;
}

export async function registerHousehold(db: Db, input: RegisterInput) {
  const passwordHash = await hashPassword(input.password);
  return db.transaction((tx) => {
    const [household] = tx
      .insert(schema.households)
      .values({ name: input.householdName })
      .returning()
      .all();
    const [user] = tx
      .insert(schema.users)
      .values({
        householdId: household.id,
        email: input.email,
        passwordHash,
        name: input.name,
      })
      .returning()
      .all();
    return user;
  });
}

export async function findUserByEmail(db: Db, email: string) {
  return db.query.users.findFirst({ where: eq(schema.users.email, email) });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/lib/users.test.ts`
Expected: PASS (2 tests). Duplicate-email throws because of the `unique` constraint on `users.email`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add household registration data layer"
```

---

## Task 5: Auth.js configuration

**Files:**
- Create: `src/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/types/next-auth.d.ts`

- [ ] **Step 1: Augment the session/JWT types**

Create `src/types/next-auth.d.ts`:

```ts
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      householdId: number;
      email?: string | null;
      name?: string | null;
    };
  }
  interface User {
    householdId: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    householdId: number;
  }
}
```

- [ ] **Step 2: Write the auth config**

Create `src/auth.ts`:

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db";
import { findUserByEmail } from "@/lib/users";
import { verifyPassword } from "@/lib/password";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = creds?.email as string | undefined;
        const password = creds?.password as string | undefined;
        if (!email || !password) return null;
        const user = await findUserByEmail(db, email);
        if (!user) return null;
        if (!(await verifyPassword(password, user.passwordHash))) return null;
        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          householdId: user.householdId,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.householdId = (user as { householdId: number }).householdId;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      session.user.householdId = token.householdId;
      return session;
    },
  },
});
```

- [ ] **Step 3: Wire the route handlers**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: configure Auth.js credentials provider with household in session"
```

---

## Task 6: Registration endpoint

**Files:**
- Create: `src/app/api/register/route.ts`

- [ ] **Step 1: Write the registration route**

Create `src/app/api/register/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { registerHousehold, findUserByEmail } from "@/lib/users";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = body?.email?.trim();
  const password = body?.password;
  const name = body?.name?.trim() || null;
  const householdName = body?.householdName?.trim() || "My Household";

  if (!email || !password || String(password).length < 6) {
    return NextResponse.json(
      { error: "Email and a password of at least 6 characters are required." },
      { status: 400 },
    );
  }

  if (await findUserByEmail(db, email)) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }

  await registerHousehold(db, { email, password, name, householdName });
  return NextResponse.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add registration API endpoint"
```

---

## Task 7: Route protection + login page + protected home

**Files:**
- Create: `src/middleware.ts`
- Create: `src/app/login/page.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write the middleware**

Create `src/middleware.ts`:

```ts
import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname.startsWith("/login");
  if (!isLoggedIn && !isLoginPage) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  // protect everything except auth/register APIs, static assets, and Next internals
  matcher: ["/((?!api/auth|api/register|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Write the login + register page**

Create `src/app/login/page.tsx`:

```tsx
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
    <main style={{ maxWidth: 360, margin: "4rem auto", fontFamily: "system-ui" }}>
      <h1>{mode === "login" ? "Log in" : "Create account"}</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 8 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {mode === "register" && (
          <input
            placeholder="Household name"
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
          />
        )}
        <button type="submit">{mode === "login" ? "Log in" : "Register"}</button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button
        style={{ marginTop: 12 }}
        onClick={() => setMode(mode === "login" ? "register" : "login")}
      >
        {mode === "login" ? "Need an account? Register" : "Have an account? Log in"}
      </button>
    </main>
  );
}
```

- [ ] **Step 3: Replace the home page with a protected one**

Overwrite `src/app/page.tsx`:

```tsx
import { auth } from "@/auth";
import { signOut } from "@/auth";

export default async function Home() {
  const session = await auth();
  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "system-ui" }}>
      <h1>MealPal</h1>
      <p>Signed in as {session?.user?.email}</p>
      <p>Household ID: {session?.user?.householdId}</p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add auth middleware, login/register page, protected home"
```

---

## Task 8: End-to-end manual verification

**Files:** none (manual check).

- [ ] **Step 1: Start the app**

```bash
npm run dev
```

- [ ] **Step 2: Verify the protection + full auth loop**

1. Open http://localhost:3000 → you are redirected to `/login`.
2. Click "Need an account? Register", enter email + password (6+ chars) + a household name, submit → you land on `/` showing your email and a numeric Household ID.
3. Click "Sign out" → redirected to `/login`.
4. Log back in with the same credentials → back on `/` with the **same** Household ID.
5. Try logging in with a wrong password → "Invalid email or password", no redirect.

Expected: all five behave as described. The stable Household ID across logins confirms scoping is wired through the JWT.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests from Tasks 3 and 4 PASS.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: foundation complete"
```

---

## Self-Review Notes

- **Spec coverage (foundation slice):** Next.js + SQLite + Drizzle (Tasks 1–2), Auth.js login (Task 5), `household_id` scoping created at registration and carried in the session (Tasks 4–5, verified Task 8). No roles/invites — out of scope by design. ✓
- **Deferred to later plans (not this one):** ingredients/catalog, recipes, planning/inventory engine, shopping, Costco importer. Each gets its own plan and will add `household_id`-scoped tables against this foundation.
- **Type consistency:** `householdId` (number) used identically in `schema.ts`, `users.ts`, `auth.ts`, and `next-auth.d.ts`. `registerHousehold` / `findUserByEmail` signatures match between `users.ts` and both test and route callers.
- **Note for executor:** `next-auth@beta` is Auth.js v5; its API differs from v4 tutorials. The `migrate()` call in `src/test/db.ts` depends on the `drizzle/` migration folder existing — Task 2 Step 7 generates it before any test runs.
