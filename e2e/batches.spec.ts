import path from "node:path";
import Database from "better-sqlite3";
import { test, expect } from "@playwright/test";

// Unique prefix per run so parallel/rerun invocations don't collide, and so
// cleanup below only ever touches rows this spec created.
const LABEL = `E2E-${Date.now()}`;

test.describe("batch tracker (merged Today agenda)", () => {
  // This exercises the mobile Today layout (FAB + bottom sheets). Pin a phone
  // viewport so it doesn't land on the desktop dashboard at the default width.
  test.use({ viewport: { width: 390, height: 844 } });

  test.afterAll(() => {
    // Self-clean: the pack flow below writes real rows into the dev DB
    // (./platr.db), so delete anything E2E-labelled in FK order once the
    // test is done — pass or fail — to stop polluting the demo household.
    const db = new Database(path.join(process.cwd(), "platr.db"));
    try {
      db.exec(`
        DELETE FROM batch_eaten WHERE batch_id IN (SELECT id FROM batches WHERE label LIKE 'E2E%');
        DELETE FROM batch_items WHERE batch_id IN (SELECT id FROM batches WHERE label LIKE 'E2E%');
        DELETE FROM stock_movements WHERE batch_id IN (SELECT id FROM batches WHERE label LIKE 'E2E%');
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
    await expect(page).toHaveURL("/");

    // Creating/scheduling now lives on the Plan page — Today is status-only.
    // Pack the batch on /plan, then hop to Today to eat it down.
    await page.goto("/plan");
    await expect(page.getByTestId("mobile-plan")).toBeVisible();
    // The Next.js dev indicator can overlap chrome and intercept clicks.
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });

    // Open the merged "Add" sheet via the Plan "+ Add" button. It opens the
    // add sheet for the currently selected day (today, selected by default).
    const planAdd = page.getByRole("button", { name: "+ Add", exact: true });
    await expect(planAdd).toBeEnabled();
    await planAdd.click();
    await expect(page.locator(".sh-title", { hasText: "Add" })).toBeVisible();

    // Switch the type row to Batch.
    await page.getByRole("button", { name: "Batch", exact: true }).click();

    // Pin the batch to the Dinner slot. This is what makes the test
    // deterministic and independent of ambient demo state: the demo's Dinner
    // slot has no *recipe*-backed rotation events, so this batch backs no real
    // meal there and instead projects one SYNTHETIC row per covered day
    // (cookedDate .. cookedDate + meals - 1). Those rows carry the batch's own
    // unique LABEL as their name — so we always get exactly `meals` eatable
    // rows to spend, regardless of which recipe meals happen to be planned or
    // already-served in the demo. (Pinning to Breakfast + the demo's "Morning
    // Smoothie" is fragile: in the drifted demo DB only one Smoothie day across
    // the whole visible range is still eatable, so a 2-meal batch could never
    // be eaten to zero through those rows.)
    const slotField = page.locator(".field").filter({ hasText: "Slot" });
    await slotField.getByRole("button").click();
    await page.getByRole("option", { name: "Dinner", exact: true }).click();
    await expect(slotField.getByRole("button")).toContainText("Dinner");

    // Unique label so this run's batch is unambiguous and cleanly deletable,
    // and so its synthetic rows are addressable by an exact name.
    await page.getByPlaceholder("e.g. Chicken & rice").fill(LABEL);

    // Meals defaults to 4 — step down to 2.
    const decrease = page.getByRole("button", { name: "Decrease" });
    await decrease.click();
    await decrease.click();
    await expect(page.locator(".stepper .val")).toHaveText("2");

    // Recipe/product picker defaults to the first item — leave it as-is. It
    // only determines which stock the pack depletes; it doesn't matter which
    // recipe it is, since no Dinner event uses it (so the batch stays purely
    // synthetic). Scoped to the sheet: the FAB behind it is also named "Add".
    await page.locator(".sheet").getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator(".sh-title", { hasText: "Add" })).toBeHidden();

    // Eating happens on Today, which is unchanged. Hop over to the status-only
    // Today agenda. Today falls inside the batch's coverage window, so today's
    // Dinner row is a synthetic batch row (named LABEL) carrying the "N left"
    // chip.
    await page.goto("/");
    await expect(page).toHaveURL("/");
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await expect(page.locator("p.eb", { hasText: "Today" })).toBeVisible();
    const todayHeading = page.locator("p.section-label", { hasText: /^Today$/ });
    const todayDay = todayHeading.locator("..");
    const batchRow = todayDay.locator(".row", { hasText: LABEL });
    const chip = batchRow.locator(".chip");
    await expect(chip).toHaveText("2 left");

    // The batch-backed checkboxes are this batch's own synthetic rows, one per
    // covered day (today + tomorrow), each named for the batch's LABEL.
    const eatCheckbox = page.getByRole("checkbox", { name: `Mark ${LABEL} eaten` });
    await expect(eatCheckbox).toHaveCount(2);

    // Eat one — drops to the low/cook-soon state. Click the earliest not-yet-
    // eaten row; wait for the shared chip to reflect the new remaining count
    // (which also confirms the agenda reloaded and the row's acting-lock
    // cleared) before eating again.
    await eatCheckbox.first().click();
    await expect(chip).toHaveText("cook soon");

    // Eat the last one — the batch is now fully spent. `listBatches` only
    // treats batches with mealsRemaining > 0 as active, so once the count
    // hits zero the batch stops backing the slot entirely and its synthetic
    // rows (and their chip) disappear from every day rather than showing
    // "empty · cook".
    await page.getByRole("checkbox", { name: `Mark ${LABEL} eaten` }).first().click();
    await expect(chip).toHaveCount(0);
  });

  test("edit a batch in place: prefills the sheet and persists the change", async ({ page }) => {
    const editLabel = `${LABEL}-edit`;
    await page.goto("/login");
    await page.getByLabel("Email").fill("demo@demo.com");
    await page.getByLabel("Password").fill("demo1234");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL("/");

    // Editing (like creating) now lives on the Plan page. Pack a fresh batch
    // there, then edit it in place on the same page.
    await page.goto("/plan");
    await expect(page.getByTestId("mobile-plan")).toBeVisible();
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });

    // Pack a fresh batch (meals=4) pinned to Dinner so a synthetic batch-backed
    // row appears on today's Plan (today is selected by default).
    const planAdd = page.getByRole("button", { name: "+ Add", exact: true });
    await expect(planAdd).toBeEnabled();
    await planAdd.click();
    await expect(page.locator(".sh-title", { hasText: "Add" })).toBeVisible();
    await page.getByRole("button", { name: "Batch", exact: true }).click();

    // Pin to Dinner — same rationale as the pack test: no recipe rotation there,
    // so the batch projects a purely synthetic row named by its LABEL.
    const slotField = page.locator(".field").filter({ hasText: "Slot" });
    await slotField.getByRole("button").click();
    await page.getByRole("option", { name: "Dinner", exact: true }).click();
    await expect(slotField.getByRole("button")).toContainText("Dinner");

    await page.getByPlaceholder("e.g. Chicken & rice").fill(editLabel);
    // Leave Meals at its default of 4.
    await expect(page.locator(".stepper .val")).toHaveText("4");
    await page.locator(".sheet").getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator(".sh-title", { hasText: "Add" })).toBeHidden();

    // Still on Plan, today selected: the Dinner section now holds this batch's
    // synthetic row (named editLabel). Wait for the batch chip first — submitAdd
    // closes the sheet before the agenda reload finishes, so the row only becomes
    // batch-backed a moment later. Editing before then would race the reload.
    const batchRow = page.locator(".row", { hasText: editLabel });
    await expect(batchRow.locator(".chip")).toHaveText("4 left");
    await batchRow.getByRole("button", { name: `Edit ${editLabel}` }).click();

    // Edit sheet opens pre-filled with this batch's label + meal count.
    await expect(page.locator(".sh-title", { hasText: "Edit batch" })).toBeVisible();
    await expect(page.getByPlaceholder("e.g. Chicken & rice")).toHaveValue(editLabel);
    await expect(page.locator(".stepper .val")).toHaveText("4");

    // Bump meals 4 → 6 and save (full re-pack under the hood). A clean close
    // means the PATCH re-pack succeeded; stock/persistence is covered in
    // batches.test.ts (unpack restores exact lots, then packs the new count).
    const increase = page.getByRole("button", { name: "Increase" });
    await increase.click();
    await increase.click();
    await page.locator(".sheet").getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".sh-title", { hasText: "Edit batch" })).toBeHidden();
  });
});
