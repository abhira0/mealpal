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
