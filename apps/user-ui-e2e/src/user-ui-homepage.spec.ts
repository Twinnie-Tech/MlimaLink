import { test, expect } from '@playwright/test';

test.describe('User UI Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the main header', async ({ page }) => {
    const header = page.locator('header').first();
    await expect(header.getByRole('link', { name: 'MlimaLink' })).toBeVisible();
    await expect(
      header.getByPlaceholder('Search for products...'),
    ).toBeVisible();
    await expect(header.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(
      header.getByRole('link', { name: /^Wishlist, \d+ items?$/ }),
    ).toBeVisible();
    await expect(
      header.getByRole('link', { name: /^Cart, \d+ items?$/ }),
    ).toBeVisible();
  });

  test('should show the landing page and lead into the products', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Shop local. Sell further. Delivered to your door.',
      }),
    ).toBeVisible();

    await page
      .getByRole('link', { name: /Start shopping/ })
      .first()
      .click();
    await page.waitForURL('**/products');
    await expect(page.locator('h1:has-text("Our Products")')).toBeVisible();
  });

  test('should search products from the header', async ({ page }) => {
    const headerSearch = page
      .locator('header')
      .getByPlaceholder('Search for products...');
    await headerSearch.fill('Wireless');
    await headerSearch.press('Enter');

    await page.waitForURL(/\/products\?search=Wireless$/);
    await expect(page.locator('[class*="results-info"]')).toContainText(
      'for “Wireless”',
    );
    await expect(
      page.locator('[class*="product-card"] h3').first(),
    ).toContainText(/wireless/i);

    // The header search is the only search box on the page.
    await expect(page.locator('input[placeholder*="Search"]')).toHaveCount(1);
  });

  test('should have proper page title', async ({ page }) => {
    await expect(page).toHaveTitle(/shop/i);
  });

  test('should display the tagline on the products page', async ({ page }) => {
    await page.goto('/products');
    const tagline = page.locator('p:has-text("Explore our wide selection")');
    await expect(tagline).toBeVisible();
  });
});
