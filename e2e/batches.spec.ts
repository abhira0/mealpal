import { test, expect } from "@playwright/test";

test("pack a batch, eat down to empty, see the cook signal", async ({ page }) => {
  // Log in with the demo household.
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@demo.com");
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Log in" }).click();

  // Lands on the Today agenda.
  await expect(page.getByText("Today", { exact: true })).toBeVisible();

  // Open the pack sheet (button is disabled until batches/slots/recipes/
  // products have all loaded).
  const openPackButton = page.getByRole("button", { name: "＋ Pack a batch" });
  await expect(openPackButton).toBeEnabled();
  await openPackButton.click();
  await expect(page.getByText("Pack a batch", { exact: true })).toBeVisible();

  // Slot defaults to the first slot and the first item defaults to the first
  // recipe, so only the label + meals count need to change.
  // Unique per run so leftover batches from prior runs don't collide.
  const label = `E2E Lunch ${Date.now()}`;
  await page.getByPlaceholder("e.g. Chicken & rice").fill(label);

  // Meals defaults to 4 — step down to 2.
  const decrease = page.getByRole("button", { name: "Decrease" });
  await decrease.click();
  await decrease.click();
  await expect(page.getByText("2", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Pack", exact: true }).click();
  await expect(page.getByText("Pack a batch", { exact: true })).toBeHidden();

  // The new batch card appears with 2 meals left.
  const card = page.locator(".card", { hasText: label });
  await expect(card).toBeVisible();
  await expect(card.getByText("2 left")).toBeVisible();

  // Eat one — drops to the low/cook-soon state.
  await card.getByRole("button", { name: "Ate one" }).click();
  await expect(card.getByText("1 left · cook soon")).toBeVisible();

  // Eat the last one — empty, cook signal, button disabled.
  await card.getByRole("button", { name: "Ate one" }).click();
  await expect(card.getByText("empty · cook")).toBeVisible();
  await expect(card.getByRole("button", { name: "Ate one" })).toBeDisabled();
});
