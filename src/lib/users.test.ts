import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { registerHousehold, findUserByEmail } from "@/lib/users";

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
});
