import { test, expect, type Page } from "@playwright/test";

// Covers the Plan calendar's per-meal Inspector (redesign). Assumes the demo
// seed (same as responsive.spec.ts). Read-only: opens the inspector and asserts
// its scope + delete affordances but never confirms a delete, so no rows are
// removed from the dev database. Any stray confirm() is auto-dismissed.
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@demo.com");
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
}

test.use({ viewport: { width: 1280, height: 800 } });

test("clicking a plan bar opens the inspector with scope + delete for a repeating meal", async ({ page }) => {
  page.on("dialog", (d) => d.dismiss()); // never actually delete
  await login(page);
  await page.goto("/plan");
  await expect(page.getByTestId("desktop-plan")).toBeVisible();

  await page.getByRole("button", { name: "Morning Smoothie", exact: true }).first().click();

  const inspector = page.getByTestId("plan-inspector");
  await expect(inspector).toBeVisible();
  // repeating meal → scope selector present
  await expect(inspector.getByRole("button", { name: "This day" })).toBeVisible();
  await expect(inspector.getByRole("button", { name: "Whole series" })).toBeVisible();
  await expect(inspector.getByRole("button", { name: /^Delete/ }).first()).toBeVisible();
});

test("the inspector shows stock impact and macros for the selected meal", async ({ page }) => {
  await login(page);
  await page.goto("/plan");
  await page.getByRole("button", { name: "Morning Smoothie", exact: true }).first().click();

  const inspector = page.getByTestId("plan-inspector");
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText("Stock impact")).toBeVisible();
  await expect(inspector.getByText("Macros")).toBeVisible();
});

test("+ Schedule opens the unified create form in a modal", async ({ page }) => {
  await login(page);
  await page.goto("/plan");
  await expect(page.getByTestId("desktop-plan")).toBeVisible();
  await page.getByRole("button", { name: "+ Schedule" }).click();

  const sheet = page.locator(".sheet");
  await expect(sheet).toContainText("Add");
  await expect(sheet.getByText("Items")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Add", exact: true })).toBeVisible();
});

test("the meal inspector opens as a wide modal, closable with Escape", async ({ page }) => {
  await login(page);
  await page.goto("/plan");
  await page.getByRole("button", { name: "Morning Smoothie", exact: true }).first().click();
  const inspector = page.getByTestId("plan-inspector");
  await expect(inspector).toBeVisible();
  await expect(page.locator(".sheet.wide")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(inspector).toBeHidden();
});

test("planned bars are draggable for reschedule (ghost appears mid-drag)", async ({ page }) => {
  await login(page);
  await page.goto("/plan");
  const bar = page.locator(".plan-bar.draggable").first();
  await expect(bar).toBeVisible();
  const box = (await bar.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  // Move past the 6px activation threshold but stay within the same day cell,
  // so dropping is a no-op (no data mutated).
  await page.mouse.move(cx + 12, cy, { steps: 6 });
  await expect(page.locator(".plan-drag-ghost")).toBeVisible();
  await page.mouse.up();
});

test("cook then uncook a planned meal from the inspector round-trips", async ({ page }) => {
  page.on("dialog", (d) => d.accept()); // if stock is short, confirm "cook anyway"
  await login(page);
  await page.goto("/plan");
  // A draggable bar is, by construction, a planned event-backed meal.
  await page.locator(".plan-bar.draggable").first().click();
  const inspector = page.getByTestId("plan-inspector");
  await expect(inspector).toBeVisible();
  await expect(inspector.locator(".chip.phase-planned")).toBeVisible();

  await inspector.getByRole("button", { name: /^Cook/ }).click();
  await expect(inspector.locator(".chip.phase-cooked")).toBeVisible();

  // Revert so the demo DB is left as we found it.
  await inspector.getByRole("button", { name: "Uncook", exact: true }).click();
  await expect(inspector.locator(".chip.phase-planned")).toBeVisible();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("a meal's manage control opens the inspector in a bottom sheet", async ({ page }) => {
    await login(page);
    await page.goto("/plan");
    await expect(page.getByTestId("mobile-plan")).toBeVisible();
    // First meal's "Manage …" control (the SlidersHorizontal button).
    await page.getByRole("button", { name: /^Manage / }).first().click();
    const inspector = page.getByTestId("plan-inspector");
    await expect(inspector).toBeVisible();
    await expect(inspector.getByText("Macros")).toBeVisible();
  });
});
