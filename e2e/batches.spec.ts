import path from "node:path";
import Database from "better-sqlite3";
import { test, expect } from "@playwright/test";

// Unique prefix per run so parallel/rerun invocations don't collide, and so
// cleanup below only ever touches rows this spec created.
const LABEL = `E2E-${Date.now()}`;

test.describe("batch tracker (merged Today agenda)", () => {
  test.afterAll(() => {
    // Self-clean: the pack flow below writes real rows into the dev DB
    // (./mealpal.db), so delete anything E2E-labelled in FK order once the
    // test is done — pass or fail — to stop polluting the demo household.
    const db = new Database(path.join(process.cwd(), "mealpal.db"));
    try {
      db.exec(`
        DELETE FROM batch_eaten WHERE batch_id IN (SELECT id FROM batches WHERE label LIKE 'E2E%');
        DELETE FROM batch_items WHERE batch_id IN (SELECT id FROM batches WHERE label LIKE 'E2E%');
        DELETE FROM batches WHERE label LIKE 'E2E%';
      `);
    } finally {
      db.close();
    }
  });

  test("pack a batch, eat down, see the cook signal on the agenda", async ({ page }) => {
    // Log in with the demo household.
    await page.goto("/login");
    await page.getByLabel("Email").fill("demo@demo.com");
    await page.getByLabel("Password").fill("demo1234");
    await page.getByRole("button", { name: "Log in" }).click();

    // Lands on the Today agenda.
    await expect(page).toHaveURL("/");
    // The Next.js dev indicator can overlap the header and intercept clicks.
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await expect(page.locator("p.eb", { hasText: "Today" })).toBeVisible();
    await expect(page.locator("p.section-label", { hasText: /^Today$/ })).toBeVisible();

    // Open the pack-a-batch sheet via the floating "+" FAB menu.
    const fab = page.getByRole("button", { name: "Add" });
    await expect(fab).toBeEnabled();
    await fab.click();
    await page.getByRole("button", { name: "Pack a batch" }).click();
    await expect(page.getByText("Pack a batch", { exact: true })).toBeVisible();

    // Slot -> Breakfast (that's the slot the demo's "Morning Smoothie" lives in).
    const slotField = page.locator(".field").filter({ hasText: "Slot" });
    await slotField.getByRole("button").click();
    await page.getByRole("option", { name: "Breakfast" }).click();

    // Unique label so this run's batch is unambiguous and cleanly deletable.
    await page.getByPlaceholder("e.g. Chicken & rice").fill(LABEL);

    // Meals defaults to 4 — step down to 2.
    const decrease = page.getByRole("button", { name: "Decrease" });
    await decrease.click();
    await decrease.click();
    await expect(page.locator(".stepper .val")).toHaveText("2");

    // Recipe/product picker defaults to the first item — leave it as-is.
    await page.getByRole("button", { name: "Pack", exact: true }).click();
    await expect(page.getByText("Pack a batch", { exact: true })).toBeHidden();

    // Back on the agenda: today's row for the batch-backed slot's meal
    // (Morning Smoothie, in Breakfast) now carries a batch chip.
    const todayHeading = page.locator("p.section-label", { hasText: /^Today$/ });
    const todayDay = todayHeading.locator("..");
    const smoothieRow = todayDay.locator(".row", { hasText: "Morning Smoothie" });
    const chip = smoothieRow.locator(".chip");
    await expect(chip).toHaveText("2 left");

    // Eat one — drops to the low/cook-soon state. Today's own Morning
    // Smoothie is already cooked in this seed (its checkbox is disabled), so
    // eat from the earliest not-yet-eaten day for the same slot instead —
    // batches back the slot across every date, so today's chip still
    // reflects the shared batch's remaining count.
    const eatCheckbox = page.getByRole("checkbox", { name: "Mark Morning Smoothie eaten" }).first();
    await eatCheckbox.click();
    await expect(chip).toHaveText("cook soon");

    // Eat the last one — the batch is now fully spent. `listBatches` only
    // treats batches with mealsRemaining > 0 as active, so once the count
    // hits zero the batch stops backing the slot entirely and its chip
    // disappears from every day's row (rather than showing "empty · cook").
    await page.getByRole("checkbox", { name: "Mark Morning Smoothie eaten" }).first().click();
    await expect(chip).toHaveCount(0);
  });
});
