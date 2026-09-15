import { test, expect } from "@playwright/test";
import path from "node:path";
import Database from "better-sqlite3";

// The core loop, walked end to end: plan a meal -> cook it -> stock drops by
// the right amount, from the right (earliest-expiring) lot -> the shopping
// list picks up the resulting shortfall -> marking the meal eaten moves the
// day's nutrition total. Each hop asserts a concrete number, not just "it
// changed".
//
// Fixture: drizzle/demo_seed.sql seeds a dedicated ingredient/product/recipe
// (ids 9001) isolated from the organic demo data, which has been cooked down
// over many dev sessions and no longer has a clean multi-lot ingredient to
// test FEFO against. Two lots of the fixture product exist at seed time, same
// pack size, different expiry:
//   lot 9001 (purchaseId 9001): 100g, expires 2030-06-01 (soonest)
//   lot 9002 (purchaseId 9002): 100g, expires 2031-06-01
// The fixture recipe (id 9001, base servings 1) consumes 80g of the fixture
// ingredient per serving — less than either lot alone, so cooking one serving
// must draw entirely from the soonest-expiring lot (9001) and leave the later
// lot (9002) untouched. That's the FEFO assertion.
//
// Most steps go through the API directly (page.request, sharing the logged-in
// session's cookies) rather than the UI: the acceptance bar is "assert a
// concrete number at each hop", and the UI doesn't expose exact gram/kcal
// figures anywhere. The shopping-list hop also checks the rendered page, since
// that's the surface the "plan/stock/cook/shop reflect one truth" principle
// is actually about.

const RECIPE_ID = 9001;
const INGREDIENT_ID = 9001;
const PRODUCT_ID = 9001;
const LOT_SOON_ID = 9001; // expires 2030-06-01
const LOT_LATER_ID = 9002; // expires 2031-06-01
const SLOT_ID = 14; // "Lunch" (seeded, stable across the demo household)

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isoAddDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

const TODAY = toISODate(new Date());
const TOMORROW = isoAddDays(TODAY, 1);

test.describe("core loop: plan -> cook -> stock -> shop -> eaten -> nutrition", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  // This test's own events/movements are the only mutable state it leaves
  // behind (the fixture ingredient/product/recipe/lots are seed data, shared
  // with nothing else). Clean those up so the spec is repeatable without a
  // reseed between runs.
  test.afterAll(() => {
    const db = new Database(path.join(process.cwd(), "platr.db"));
    try {
      db.exec(`
        DELETE FROM stock_movements WHERE meal_event_id IN (SELECT id FROM meal_events WHERE recipe_id = ${RECIPE_ID});
        DELETE FROM meal_events WHERE recipe_id = ${RECIPE_ID};
      `);
    } finally {
      db.close();
    }
  });

  test("plan, cook (FEFO), stock, shop, eat, nutrition all agree on one truth", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("demo@demo.com");
    await page.getByLabel("Password").fill("demo1234");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL("/");

    // --- PLAN ---------------------------------------------------------
    // Two occurrences: today's (which we'll cook) and tomorrow's (left
    // planned). The second is what turns the ingredient into a shopping-list
    // shortfall after today's is cooked — a single serving alone wouldn't
    // exhaust two 100g lots, but a planned *second* serving the stock can't
    // cover does.
    const plannedStock = await (await page.request.get("/api/stock")).json();
    expect(plannedStock.qty[String(INGREDIENT_ID)]).toBe(200); // 2 lots x 100g, untouched

    const ev1 = await (
      await page.request.post("/api/events", {
        data: { date: TODAY, slotId: SLOT_ID, recipeId: RECIPE_ID, servings: 1 },
      })
    ).json();
    expect(ev1.status).toBe("planned");

    const ev2 = await (
      await page.request.post("/api/events", {
        data: { date: TOMORROW, slotId: SLOT_ID, recipeId: RECIPE_ID, servings: 2 },
      })
    ).json();
    expect(ev2.status).toBe("planned");

    // --- COOK -----------------------------------------------------------
    const cookRes = await page.request.post(`/api/events/${ev1.id}/cook`, { data: {} });
    expect(cookRes.ok()).toBeTruthy();

    // --- STOCK: exact drop + FEFO lot order -----------------------------
    const afterCook = await (await page.request.get("/api/stock")).json();
    expect(afterCook.qty[String(INGREDIENT_ID)]).toBe(120); // 200 - 80g cooked

    const lots = afterCook.lotsByProduct[String(PRODUCT_ID)] as { purchaseId: number; remaining: number }[];
    expect(lots).toHaveLength(2);
    // FEFO-ordered: soonest-expiring lot first.
    expect(lots[0].purchaseId).toBe(LOT_SOON_ID);
    expect(lots[0].remaining).toBe(20); // 100 - 80: fully drawn from the earliest lot
    expect(lots[1].purchaseId).toBe(LOT_LATER_ID);
    expect(lots[1].remaining).toBe(100); // untouched by the cook

    // --- SHOP: the shortfall from tomorrow's planned (uncooked) meal ----
    // Shape (mealpal-ibb): grouped by shop id, each group carries its lines.
    const shopping = await (await page.request.get("/api/shopping?horizon=14")).json() as Record<
      string,
      { shopId: number | null; shopName: string; lines: { ingredientId: number; ingredientName: string; needed: number; product: { id: number } | null }[] }
    >;
    const shopLine = Object.values(shopping).flatMap((g) => g.lines).find((l) => l.ingredientId === INGREDIENT_ID);
    expect(shopLine).toBeTruthy();
    // stock(120) can't cover tomorrow's planned 2 servings (160g) -> short 40g.
    expect(shopLine!.needed).toBe(40);
    expect(shopLine!.product?.id).toBe(PRODUCT_ID);

    // The same list, on the actual Shop page — plan/stock and shop show one truth.
    await page.goto("/shop");
    await expect(page.getByTestId("desktop-shop")).toBeVisible();
    await expect(page.getByText("FEFO Fixture Oats", { exact: true })).toBeVisible();

    // --- EATEN: serving is the one action that counts toward nutrition -
    const dayBefore = await (await page.request.get(`/api/nutrition?date=${TODAY}`)).json();
    const caloriesBefore = dayBefore.total.calories;

    const serveRes = await page.request.post(`/api/events/${ev1.id}/serve`, { data: {} });
    expect(serveRes.ok()).toBeTruthy();

    // --- NUTRITION: the day total moved by exactly this meal's kcal -----
    const dayAfter = await (await page.request.get(`/api/nutrition?date=${TODAY}`)).json();
    // 80g cooked x 4 kcal/g (the fixture product's frozen per-unit label) = 320 kcal.
    expect(dayAfter.total.calories - caloriesBefore).toBe(320);

    const ourMeal = dayAfter.meals.find((m: { eventId: number }) => m.eventId === ev1.id);
    expect(ourMeal).toBeTruthy();
    expect(ourMeal.estimate).toBe(false); // served, not just planned/cooked
    expect(ourMeal.nutrients.calories).toBe(320);
  });
});
