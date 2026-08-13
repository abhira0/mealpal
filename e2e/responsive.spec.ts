import { test, expect, type Page } from "@playwright/test";

// Verifies the viewport-based device split: each route mounts a mobile-only
// tree below 1024px and a desktop-only tree at/above it. No rows are written,
// so there is nothing to clean up.

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@demo.com");
  await page.getByLabel("Password").fill("demo1234");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
}

// route path -> mobile/desktop root testids
const ROUTES: { path: string; mobile: string; desktop: string }[] = [
  { path: "/", mobile: "mobile-today", desktop: "desktop-today" },
  { path: "/nutrition", mobile: "mobile-nutrition", desktop: "desktop-nutrition" },
  { path: "/pantry", mobile: "mobile-pantry", desktop: "desktop-pantry" },
  { path: "/shop", mobile: "mobile-shop", desktop: "desktop-shop" },
  { path: "/recipes", mobile: "mobile-recipes", desktop: "desktop-recipes" },
  { path: "/manage/ingredients", mobile: "mobile-manage", desktop: "desktop-manage" },
];

test.describe("device split — mobile viewport", () => {
  test.use({ viewport: MOBILE });

  test("each route mounts the mobile tree, not the desktop tree", async ({ page }) => {
    await login(page);
    for (const r of ROUTES) {
      await page.goto(r.path);
      await expect(page.getByTestId(r.mobile), `${r.path} mobile`).toBeVisible();
      await expect(page.getByTestId(r.desktop), `${r.path} desktop absent`).toHaveCount(0);
    }
  });
});

test.describe("device split — desktop viewport", () => {
  test.use({ viewport: DESKTOP });

  test("each route mounts the desktop tree, not the mobile tree", async ({ page }) => {
    await login(page);
    for (const r of ROUTES) {
      await page.goto(r.path);
      await expect(page.getByTestId(r.desktop), `${r.path} desktop`).toBeVisible();
      await expect(page.getByTestId(r.mobile), `${r.path} mobile absent`).toHaveCount(0);
    }
  });

  test("recipes master-detail: clicking a row fills the pane", async ({ page }) => {
    await login(page);
    await page.goto("/recipes");
    const pane = page.getByTestId("md-pane");
    await expect(pane).toContainText(/select a recipe/i);
    // First selectable recipe row (rows render as buttons in master-detail).
    await page.locator(".md-list button.row-link").first().click();
    await expect(pane.getByText(/select a recipe/i)).toHaveCount(0);
  });

  test("command palette: open, search + Enter navigates; Escape closes", async ({ page }) => {
    await login(page);
    const cmdk = page.locator(".cmdk");
    // Open via the desktop sidebar trigger (deterministic; ⌘K also works).
    await page.locator(".nav-search").click();
    await expect(cmdk).toBeVisible();
    await page.locator(".cmdk-input").fill("milk");
    await expect(page.locator(".cmdk-item").first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/manage\/ingredients\/\d+/);
    // Reopen and close with Escape.
    await page.locator(".nav-search").click();
    await expect(cmdk).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(cmdk).toHaveCount(0);
  });
});
