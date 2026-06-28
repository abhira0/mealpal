import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { listEvents } from "@/lib/plan";
import { listSlots } from "@/lib/slots";
import { listRecipes } from "@/lib/recipes";
import { MealCard } from "@/components/MealCard";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function initials(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  if (!s) return "ME";
  const parts = s.split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b || a).toUpperCase();
}

export default async function TodayPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const hid = session.user.householdId;

  const date = todayISO();
  const slots = listSlots(db, hid);
  const events = listEvents(db, hid, date, date);
  const recipes = listRecipes(db, hid);
  const recipeName = new Map(recipes.map((r) => [r.id, r.name]));

  const eyebrowDate = new Date(date + "T00:00:00")
    .toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();

  const avatar = initials(session.user.name ?? session.user.email);

  return (
    <main className="app">
      <header className="chrome">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <p className="eb">Today · {eyebrowDate}</p>
            <h1>{greeting()}</h1>
          </div>
          <Link
            href="/manage"
            aria-label="Manage account"
            className="eb"
            style={{
              flex: "none",
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "var(--enamel-dark)",
              color: "var(--paper)",
              display: "grid",
              placeItems: "center",
              textDecoration: "none",
              fontSize: 12,
              letterSpacing: ".06em",
            }}
          >
            {avatar}
          </Link>
        </div>
      </header>

      <div style={{ padding: 16 }}>
        {slots.length === 0 ? (
          <div className="card">
            <p className="title">No meal slots yet</p>
            <p style={{ margin: "8px 0 14px", fontSize: 14 }}>
              Add breakfast, lunch and dinner to start planning.
            </p>
            <Link className="btn" href="/manage" style={{ display: "inline-block", textDecoration: "none" }}>
              Set up slots
            </Link>
          </div>
        ) : (
          <div className="timeline">
            {slots.map((slot) => {
              const slotEvents = events.filter((e) => e.slotId === slot.id);
              return (
                <div key={slot.id} style={{ position: "relative", marginBottom: 22 }}>
                  <span className="node" aria-hidden="true" />
                  <p className="slot" style={{ marginBottom: 8 }}>
                    {slot.name}
                  </p>
                  {slotEvents.length === 0 ? (
                    <Link
                      href="/plan"
                      className="slot"
                      style={{
                        color: "var(--sage)",
                        textTransform: "none",
                        letterSpacing: "normal",
                        fontFamily: "var(--body)",
                        fontSize: 14,
                        textDecoration: "none",
                        display: "inline-block",
                      }}
                    >
                      + Add a meal
                    </Link>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {slotEvents.map((ev) => (
                        <MealCard
                          key={ev.id}
                          eventId={ev.id}
                          title={recipeName.get(ev.recipeId) ?? "Recipe"}
                          servings={ev.servings}
                          recipeId={ev.recipeId}
                          status={ev.status}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
