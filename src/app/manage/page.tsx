import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { PageHeader } from "@/components/PageHeader";
import { ENTITIES, type EntitySlug } from "@/app/manage/entities";
import { BookOpen, CalendarClock, Camera, ChevronRight, Egg, Store, Tag, Target, Utensils, type LucideIcon } from "lucide-react";
import { calendarToken } from "@/lib/calendar";
import { CopyField } from "@/components/CopyField";

// Resolve the app's own origin so server-side fetches to /api hit this app.
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

async function count(base: string, listPath: string, cookie: string): Promise<number | null> {
  try {
    const res = await fetch(`${base}${listPath}`, { headers: { cookie }, cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data.length : null;
  } catch {
    return null;
  }
}

const CATALOG: { slug: EntitySlug; Icon: LucideIcon }[] = [
  { slug: "ingredients", Icon: Egg },
  { slug: "shops", Icon: Store },
  { slug: "products", Icon: Tag },
  { slug: "slots", Icon: Utensils },
];

export default async function ManagePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const base = await origin();
  const cookie = (await headers()).get("cookie") ?? "";
  // Recipes has a bespoke page (/recipes), not a generic ENTITIES entry.
  const recipesCount = await count(base, "/api/recipes", cookie);
  const counts = Object.fromEntries(
    await Promise.all(
      CATALOG.map(async ({ slug }) => [
        slug,
        await count(base, ENTITIES[slug].listPath, cookie),
      ] as const),
    ),
  ) as Record<EntitySlug, number | null>;

  const email = session.user?.email ?? "—";
  const householdName = session.user?.name ?? "Your kitchen";
  const hid = session.user.householdId;
  const calendarUrl = `${base}/api/calendar/${hid}/${calendarToken(hid)}`;

  return (
    <>
      <PageHeader eyebrow="Manage" title="Your kitchen data" />

      <div className="content stack">
        <section className="stack-sm">
          <p className="section-label">Catalog</p>
          <Link href="/recipes" className="account-row">
            <span className="row-link">
              <span className="icon-badge" aria-hidden="true"><BookOpen size={18} /></span>
              <span className="title">Recipes</span>
            </span>
            <span className="meta" style={{ marginTop: 0 }}>
              {recipesCount ?? "—"}
            </span>
            <ChevronRight className="arrow" size={16} aria-hidden="true" />
          </Link>
          {CATALOG.map(({ slug, Icon }) => (
            <Link key={slug} href={`/manage/${slug}`} className="account-row">
              <span className="row-link">
                <span className="icon-badge" aria-hidden="true"><Icon size={18} /></span>
                <span className="title">{ENTITIES[slug].label}</span>
              </span>
              <span className="meta" style={{ marginTop: 0 }}>
                {counts[slug] ?? "—"}
              </span>
              <ChevronRight className="arrow" size={16} aria-hidden="true" />
            </Link>
          ))}
          <Link href="/manage/goals" className="account-row">
            <span className="row-link">
              <span className="icon-badge" aria-hidden="true"><Target size={18} /></span>
              <span className="title">Daily goals</span>
            </span>
            <ChevronRight className="arrow" size={16} aria-hidden="true" />
          </Link>
        </section>

        <section className="stack-sm">
          <p className="section-label">Dev tools</p>
          <Link href="/manage/dev/nutrition-photos" className="account-row">
            <span className="row-link">
              <span className="icon-badge" aria-hidden="true"><Camera size={18} /></span>
              <span className="title">Nutrition photos</span>
            </span>
            <ChevronRight className="arrow" size={16} aria-hidden="true" />
          </Link>
        </section>

        <section className="stack-sm">
          <p className="section-label">Calendar sync</p>
          <p className="body" style={{ color: "var(--sage)", fontSize: 13, margin: 0 }}>
            <CalendarClock size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} aria-hidden="true" />
            Subscribe by URL in TickTick, Google, or Apple Calendar to sync your meal plan.
          </p>
          <CopyField value={calendarUrl} />
        </section>

        <section className="stack-sm">
          <p className="section-label">Account</p>
          <div className="account-row" style={{ cursor: "default" }}>
            <span className="row-main">
              <span className="title" style={{ display: "block" }}>{email}</span>
              <span className="ar-sub">{householdName}</span>
            </span>
          </div>
          <SignOutButton />
        </section>
      </div>
    </>
  );
}
