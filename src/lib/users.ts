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

// Emails are stored lower-cased so lookups/uniqueness are case-insensitive
// ("User@x.com" and "user@x.com" are the same account). SQLite's default
// TEXT collation is case-sensitive, so this must happen at every write/read.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function registerHousehold(db: Db, input: RegisterInput) {
  const passwordHash = await hashPassword(input.password);
  const email = normalizeEmail(input.email);
  return db.transaction((tx) => {
    const [household] = tx
      .insert(schema.households)
      .values({ name: input.householdName })
      .returning()
      .all();
    // Generic "buy anywhere" shop for staples (onions, tomatoes) you don't
    // source from a specific store. ponytail: name is the marker the UI keys on.
    tx.insert(schema.shops)
      .values({ householdId: household.id, name: "Generic" })
      .run();
    // Without default slots, every planning path (POST /api/events, meal
    // rules, the plan grid) has nothing to attach to until the user
    // manually visits Manage > Slots. Seed the usual three.
    tx.insert(schema.mealSlots)
      .values([
        { householdId: household.id, name: "Breakfast", timeOfDay: "08:00" },
        { householdId: household.id, name: "Lunch", timeOfDay: "12:00" },
        { householdId: household.id, name: "Dinner", timeOfDay: "18:00" },
      ])
      .run();
    const [user] = tx
      .insert(schema.users)
      .values({
        householdId: household.id,
        email,
        passwordHash,
        name: input.name,
      })
      .returning()
      .all();
    return user;
  });
}

export async function findUserByEmail(db: Db, email: string) {
  return db.query.users.findFirst({ where: eq(schema.users.email, normalizeEmail(email)) });
}
