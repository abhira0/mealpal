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
    <>
      <header className="chrome">
        <div className="chrome-row">
          <div>
            <p className="eb">Today · {eyebrowDate}</p>
            <h1>{greeting()}</h1>
          </div>
          <Link href="/manage" aria-label="Manage account" className="avatar">
            {avatar}
          </Link>
        </div>
      </header>

      <div className="content">
        {slots.length === 0 ? (
          <div className="empty">
            <p className="title">No meal slots yet</p>
            <p>Add breakfast, lunch and dinner in Manage to start planning.</p>
          </div>
        ) : (
          <div className="timeline">
            {slots.map((slot) => {
              const slotEvents = events.filter((e) => e.slotId === slot.id);
              const empty = slotEvents.length === 0;
              return (
                <div key={slot.id} className="seg">
                  <span className={empty ? "node empty" : "node"} aria-hidden="true" />
                  <p className="slot" style={{ marginBottom: 8 }}>
                    {slot.name}
                  </p>
                  {empty ? (
                    <Link href="/plan" className="btn-add">
                      + Add a meal
                    </Link>
                  ) : (
                    <div className="stack-sm">
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
    </>
  );
}
