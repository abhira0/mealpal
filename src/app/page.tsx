import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { listEvents } from "@/lib/plan";
import { listSlots } from "@/lib/slots";
import { listRecipes } from "@/lib/recipes";
import { MealCard } from "@/components/MealCard";
import { CookButton } from "@/components/CookButton";
import { SignOutButton } from "@/components/SignOutButton";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

  const pretty = new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="app-main">
      <div className="page-header">
        <div className="row-between">
          <p className="eyebrow">Today</p>
          <SignOutButton />
        </div>
        <h1>{pretty}</h1>
      </div>

      {slots.length === 0 ? (
        <div className="empty-state">
          <p>No meal slots yet.</p>
          <Link className="btn btn-primary" href="/manage">
            Set up slots
          </Link>
        </div>
      ) : (
        <div>
          {slots.map((slot) => {
            const slotEvents = events.filter((e) => e.slotId === slot.id);
            return (
              <div className="timeline-slot" key={slot.id}>
                <div className="slot-label">{slot.name}</div>
                {slotEvents.length === 0 ? (
                  <Link
                    href="/plan"
                    className="caption"
                    style={{ display: "inline-block", padding: "8px 0" }}
                  >
                    + Add a meal
                  </Link>
                ) : (
                  <div className="stack">
                    {slotEvents.map((ev) =>
                      ev.status === "planned" ? (
                        <CookButton
                          key={ev.id}
                          eventId={ev.id}
                          title={recipeName.get(ev.recipeId) ?? "Recipe"}
                          servings={ev.servings}
                          recipeId={ev.recipeId}
                          status={ev.status}
                        />
                      ) : (
                        <MealCard
                          key={ev.id}
                          title={recipeName.get(ev.recipeId) ?? "Recipe"}
                          servings={ev.servings}
                          recipeId={ev.recipeId}
                          status={ev.status}
                        />
                      ),
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
