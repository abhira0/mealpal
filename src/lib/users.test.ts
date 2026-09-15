import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, type TestDb } from "@/test/db";
import { registerHousehold, findUserByEmail } from "@/lib/users";
import { schema } from "@/db";

let db: TestDb;
beforeEach(() => {
  db = makeTestDb();
});

describe("registerHousehold", () => {
  it("creates a household and its first user, scoped together", async () => {
    const user = await registerHousehold(db, {
      email: "a@b.com",
      password: "hunter2",
      name: "Abhishek",
      householdName: "Home",
    });
    expect(user.email).toBe("a@b.com");
    expect(user.householdId).toBeTypeOf("number");

    const found = await findUserByEmail(db, "a@b.com");
    expect(found?.householdId).toBe(user.householdId);
    expect(found?.passwordHash).not.toBe("hunter2"); // stored hashed
  });

  it("seeds default meal slots so the new household can plan immediately", async () => {
    const user = await registerHousehold(db, {
      email: "slots@b.com",
      password: "hunter2",
      name: "Abhishek",
      householdName: "Home",
    });

    const slots = db.select().from(schema.mealSlots)
      .where(eq(schema.mealSlots.householdId, user.householdId))
      .all();
    expect(slots.map((s) => [s.name, s.timeOfDay])).toEqual([
      ["Breakfast", "08:00"],
      ["Lunch", "12:00"],
      ["Dinner", "18:00"],
    ]);
  });

  it("rejects a duplicate email", async () => {
    const args = {
      email: "a@b.com",
      password: "x",
      name: null,
      householdName: "Home",
    };
    await registerHousehold(db, args);
    await expect(registerHousehold(db, args)).rejects.toThrow();
  });

  it("treats email as case-insensitive for storage, lookup, and uniqueness", async () => {
    const user = await registerHousehold(db, {
      email: "Mixed.Case@Example.com",
      password: "hunter2",
      name: null,
      householdName: "Home",
    });
    expect(user.email).toBe("mixed.case@example.com");

    const found = await findUserByEmail(db, "MIXED.CASE@EXAMPLE.COM");
    expect(found?.id).toBe(user.id);

    await expect(
      registerHousehold(db, {
        email: "mixed.case@example.com",
        password: "y",
        name: null,
        householdName: "Home 2",
      }),
    ).rejects.toThrow();
  });
});
