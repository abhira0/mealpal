import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import { schema } from "@/db";
import { createRecipe } from "@/lib/recipes";
import { createSlot } from "@/lib/slots";
import { addEvent } from "@/lib/plan";
import { recordMovement } from "@/lib/stock";
import { inspectEvent } from "@/lib/inspect";

let db: TestDb;
let hid: number;
let flourId: number;
let slotId: number;
let recipeId: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
  flourId = db.insert(schema.ingredients)
    .values({ householdId: hid, name: "Flour", canonicalUnit: "g" })
    .returning().all()[0].id;
  slotId = createSlot(db, hid, "Dinner", "18:00").id;
  recipeId = createRecipe(db, hid, {
    name: "Bread", baseServings: 2, notes: null,
    ingredients: [{ ingredientId: flourId, amount: 500 }], steps: [], media: [],
  }).id;
});

describe("inspectEvent", () => {
  it("returns null for an unknown event", () => {
    expect(inspectEvent(db, hid, 9999)).toBeNull();
  });

  it("reports names, slot, status and stock impact (short when nothing on hand)", () => {
    const ev = addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 2 });
    const res = inspectEvent(db, hid, ev.id)!;
    expect(res.event.name).toBe("Bread");
    expect(res.event.slotName).toBe("Dinner");
    expect(res.event.status).toBe("planned");
    expect(res.stock).toHaveLength(1);
    expect(res.stock[0]).toMatchObject({ ingredientName: "Flour", needed: 500, onHand: 0, short: true, unit: "g" });
  });

  it("marks stock not-short once enough is on hand and scales needed with servings", () => {
    const shopId = db.insert(schema.shops).values({ householdId: hid, name: "Mart" }).returning().all()[0].id;
    const productId = db.insert(schema.products)
      .values({ householdId: hid, ingredientId: flourId, shopId, name: "Flour 2kg", packSize: 2000 })
      .returning().all()[0].id;
    recordMovement(db, hid, { ingredientId: flourId, productId, delta: 2000, reason: "purchase" });
    const ev = addEvent(db, hid, { date: "2026-07-01", slotId, recipeId, servings: 4 }); // 2x base → 1000g
    const res = inspectEvent(db, hid, ev.id)!;
    expect(res.stock[0].needed).toBe(1000);
    expect(res.stock[0].onHand).toBe(2000);
    expect(res.stock[0].short).toBe(false);
  });
});
