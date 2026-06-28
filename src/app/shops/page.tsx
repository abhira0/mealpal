import { auth } from "@/auth";
import { db } from "@/db";
import { listShops, listBranches } from "@/lib/shops";

export default async function ShopsPage() {
  const session = await auth();
  if (!session) return null;
  const hid = session.user.householdId;
  const shops = listShops(db, hid);
  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>Shops</h1>
      <ul>
        {shops.map((s) => (
          <li key={s.id}>
            <strong>{s.name}</strong>
            <ul>
              {listBranches(db, hid, s.id).map((b) => (
                <li key={b.id}>{b.name}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {shops.length === 0 && <p>No shops yet. POST to /api/shops to add one.</p>}
    </main>
  );
}
