import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { registerHousehold } from "@/lib/users";
import { getCalendarToken, regenerateCalendarToken } from "@/lib/households";
import { calendarTokenMatches } from "@/lib/calendar";

let db: TestDb;
beforeEach(() => {
  db = makeTestDb();
});

describe("household calendar token", () => {
  it("is minted at registration and validates itself", async () => {
    const user = await registerHousehold(db, {
      email: "a@b.com",
      password: "hunter2",
      name: null,
      householdName: "Home",
    });
    const token = getCalendarToken(db, user.householdId);
    expect(token).toBeTruthy();
    expect(calendarTokenMatches(token, token!)).toBe(true);
  });

  it("regenerating issues a new token and the old one no longer validates (feed 404s)", async () => {
    const user = await registerHousehold(db, {
      email: "c@d.com",
      password: "hunter2",
      name: null,
      householdName: "Home",
    });
    const oldToken = getCalendarToken(db, user.householdId)!;

    const newToken = regenerateCalendarToken(db, user.householdId);

    expect(newToken).not.toBe(oldToken);
    expect(getCalendarToken(db, user.householdId)).toBe(newToken);
    // Simulates the feed route's check: old URL now fails, new one succeeds.
    expect(calendarTokenMatches(newToken, oldToken)).toBe(false);
    expect(calendarTokenMatches(newToken, newToken)).toBe(true);
  });
});
