import { schema } from "@/db";
import type { TestDb } from "@/test/db";

/** Inserts a household and returns its id. Required before inserting scoped rows. */
export function seedHousehold(db: TestDb, name = "Test Home"): number {
  const [h] = db.insert(schema.households).values({ name }).returning().all();
  return h.id;
}
