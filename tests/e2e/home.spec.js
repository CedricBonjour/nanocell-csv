import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/NanoCell/);
});

test('can navigate to app', async ({ page }) => {
  await page.goto('/');

  // Click the link to open the app
  const appLink = page.locator('a.anchorButton');
  await expect(appLink).toBeVisible();
});
