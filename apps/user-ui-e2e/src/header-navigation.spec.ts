import { test, expect } from '@playwright/test';

test.describe('Header departments and navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/products');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should filter products by department from the dropdown', async ({
    page,
  }) => {
    const toggle = page.getByRole('button', { name: /All Departments/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const electronics = page.getByRole('link', {
      name: 'Electronics',
      exact: true,
    });
    await expect(electronics).toBeVisible({ timeout: 10000 });

    const filteredResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/products?') &&
        res.url().includes('category=Electronics'),
    );
    await electronics.click();
    await page.waitForURL(/\/products\?category=Electronics$/);
    await filteredResponse;

    // The dropdown closes and the in-page filter reflects the department.
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByLabel('Filter by category')).toHaveValue(
      'Electronics',
    );

    const productCategories = page.locator('[class*="product-category"]');
    await expect(productCategories.first()).toBeVisible();
    await expect(
      productCategories.filter({ hasNotText: 'Electronics' }),
    ).toHaveCount(0);
  });

  test('should keep the department when searching from the header', async ({
    page,
  }) => {
    await page.goto('/products?category=Electronics');

    await page
      .locator('header')
      .getByPlaceholder('Search for products...')
      .fill('Wireless');

    await page.waitForURL(/\/products\?category=Electronics&search=Wireless$/);
    await expect(page.getByLabel('Filter by category')).toHaveValue(
      'Electronics',
    );
  });

  test('should close the dropdown with Escape', async ({ page }) => {
    const toggle = page.getByRole('button', { name: /All Departments/ });
    await toggle.click();
    await expect(
      page.getByRole('link', { name: 'All Products' }),
    ).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('link', { name: 'All Products' })).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test('should navigate with the header links', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Main' });

    await expect(nav.getByRole('link', { name: 'Products' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await nav.getByRole('link', { name: 'Shops' }).click();
    await page.waitForURL('**/shops');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Shops' }),
    ).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Shops' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await nav.getByRole('link', { name: 'Become a seller' }).click();
    await page.waitForURL('**/become-seller');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Become a seller' }),
    ).toBeVisible();

    await nav.getByRole('link', { name: 'Home' }).click();
    await page.waitForURL((url) => url.pathname === '/');
    await expect(
      page.getByRole('heading', { level: 1, name: /Shop local/ }),
    ).toBeVisible();
  });
});
