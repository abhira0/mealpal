import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { ENTITIES, type EntitySlug } from "@/app/manage/entities";

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

const CATALOG: { slug: EntitySlug; emoji: string }[] = [
  { slug: "ingredients", emoji: "🥚" },
  { slug: "shops", emoji: "🏪" },
  { slug: "products", emoji: "🏷️" },
  { slug: "slots", emoji: "🍽️" },
];

export default async function ManagePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const base = await origin();
  const cookie = (await headers()).get("cookie") ?? "";
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

  return (
    <>
      <header className="chrome">
        <p className="eb">Manage</p>
        <h1>Your kitchen data</h1>
      </header>

      <div className="content stack">
        <section className="stack-sm">
          <p className="section-label">Catalog</p>
          {CATALOG.map(({ slug, emoji }) => (
            <Link key={slug} href={`/manage/${slug}`} className="account-row">
              <span className="row-link">
                <span className="icon-badge" aria-hidden="true">{emoji}</span>
                <span className="title">{ENTITIES[slug].label}</span>
              </span>
              <span className="meta" style={{ marginTop: 0 }}>
                {counts[slug] ?? "—"}
              </span>
              <span className="arrow" aria-hidden="true">›</span>
            </Link>
          ))}
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
