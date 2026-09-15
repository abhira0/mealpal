import { test, expect, type Page } from "@playwright/test";

// Covers mealpal-m4q: GoalsEditor must not PUT on initial load, and must show
// Saving…/Saved feedback around a genuine edit. All /api/nutrition/goals
// traffic is intercepted here, so nothing is actually written to the demo DB.

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@demo.com");
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
}

const GOALS = { calorieGoal: 2000, proteinG: 150, carbsG: 200, fatG: 70 };

test("no PUT fires on initial load with unchanged values", async ({ page }) => {
  let puts = 0;
  await page.route("**/api/nutrition/goals", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: GOALS });
    puts++;
    return route.fulfill({ json: GOALS });
  });
  await login(page);
  await page.goto("/manage/goals");
  await expect(page.getByLabel("Calories")).toHaveValue("2000");
  await page.waitForTimeout(1200); // > the 500ms debounce, plenty of time for a spurious PUT
  expect(puts).toBe(0);
});

test("editing a field shows Saving… then Saved, and issues exactly one PUT", async ({ page }) => {
  let puts = 0;
  await page.route("**/api/nutrition/goals", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: GOALS });
    puts++;
    await new Promise((r) => setTimeout(r, 200)); // keep "Saving…" visible long enough to assert
    return route.fulfill({ json: GOALS });
  });
  await login(page);
  await page.goto("/manage/goals");

  await page.getByLabel("Calories").fill("2200");
  await expect(page.getByTestId("save-status")).toHaveText("Saving…");
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  expect(puts).toBe(1);
});

test("a failing save shows the error and never shows Saved", async ({ page }) => {
  await page.route("**/api/nutrition/goals", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: GOALS });
    return route.fulfill({ status: 400, json: { error: "invalid" } });
  });
  await login(page);
  await page.goto("/manage/goals");

  await page.getByLabel("Calories").fill("2200");
  await expect(page.locator("p.notice")).toHaveText("Couldn't save — check your goal values.");
  await expect(page.getByTestId("save-status")).toHaveCount(0);
});
