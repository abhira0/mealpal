import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { ManageForms } from "@/components/ManageForms";

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

export default async function ManagePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const base = await origin();
  const cookie = (await headers()).get("cookie") ?? "";
  const [ingredients, shops, products] = await Promise.all([
    count(base, "/api/ingredients", cookie),
    count(base, "/api/shops", cookie),
    count(base, "/api/products", cookie),
  ]);

  const email = session.user?.email ?? "—";
  const householdName = session.user?.name ?? "Your kitchen";

  return (
    <main>
      <div className="chrome">
        <p className="eb">Manage</p>
        <h1>Your kitchen data</h1>
      </div>

      <ManageForms initialCounts={{ ingredients, shops, products }} />

      <div style={{ padding: "0 16px 8px" }}>
        <p className="slot" style={{ marginBottom: 8 }}>
          Account
        </p>
        <div className="card" style={{ marginBottom: 16 }}>
          <span className="title" style={{ fontSize: 15, display: "block" }}>
            {email}
          </span>
          <span className="slot" style={{ marginTop: 4, display: "block" }}>
            {householdName}
          </span>
        </div>
        <SignOutButton />
      </div>
    </main>
  );
}
