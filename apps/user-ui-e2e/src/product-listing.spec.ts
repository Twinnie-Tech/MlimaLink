import { test, expect } from '@playwright/test';

test.describe('Product Listing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/products');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display products grid with at least one product', async ({
    page,
  }) => {
    const productCards = page.locator('[class*="product-card"]');

    // Wait for products to load
    const firstProduct = productCards.first();
    await expect(firstProduct).toBeVisible({ timeout: 10000 });

    const count = await productCards.count();
    expect(count).toBeGreaterThan(0);

    const productImage = firstProduct.locator('img');
    await expect(productImage).toBeVisible();

    const productName = firstProduct.locator('h3');
    await expect(productName).toBeVisible();

    const productPrice = firstProduct.locator('text=/\\$\\d+\\.\\d{2}/');
    await expect(productPrice).toBeVisible();
  });

  test('should filter products by category', async ({ page }) => {
    const categoryDropdown = page.getByLabel('Filter by category');
    await expect(
      categoryDropdown.locator('option[value="Electronics"]'),
    ).toBeAttached();

    // The unfiltered list can already start with an Electronics product, so
    // wait for the filtered response instead of the first card's text.
    const filteredResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/products?') &&
        res.url().includes('category=Electronics'),
    );
    await categoryDropdown.selectOption('Electronics');
    await filteredResponse;

    const productCards = page.getByRole('button', {
      name: /^View details for/,
    });
    await expect(productCards.first()).toBeVisible();

    const productCategories = page.locator('[class*="product-category"]');
    await expect(
      productCategories.filter({ hasNotText: 'Electronics' }),
    ).toHaveCount(0);
    expect(await productCategories.count()).toBeGreaterThan(0);
    await expect(productCategories).toHaveCount(await productCards.count());
  });

  test('should filter products by search term', async ({ page }) => {
    // Typing in the header filters the list live, without pressing Enter.
    const searchInput = page
      .locator('header')
      .getByPlaceholder('Search for products...');
    // The unfiltered list can already start with a "Wireless" product, so
    // wait for the filtered response instead of the first card's text.
    const filteredResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/products?') &&
        res.url().includes('searchTerm=Wireless'),
    );
    await searchInput.fill('Wireless');
    await page.waitForURL(/\/products\?search=Wireless$/);
    await filteredResponse;

    const productNames = page.locator('[class*="product-card"] h3');
    await expect(productNames.first()).toBeVisible();
    await expect(productNames.filter({ hasNotText: /wireless/i })).toHaveCount(
      0,
    );
    expect(await productNames.count()).toBeGreaterThan(0);
  });

  test('should filter by in-stock only', async ({ page }) => {
    const inStockCheckbox = page.locator('input[type="checkbox"]').first();
    await inStockCheckbox.check();

    // Wait for the filtered list to drop all out-of-stock products
    const outOfStockOverlays = page.locator('text="Out of Stock"');
    await expect(outOfStockOverlays).toHaveCount(0);
  });

  test('should navigate to product detail when clicking a product', async ({
    page,
  }) => {
    const firstProduct = page.locator('[class*="product-card"]').first();
    await expect(firstProduct).toBeVisible({ timeout: 30_000 });
    await firstProduct.click();

    await page.waitForURL('**/products/*');
    expect(page.url()).toMatch(/\/products\/\d+/);

    const backButton = page.locator('button:has-text("Back to Products")');
    await expect(backButton).toBeVisible();
  });

  test('should render pagination controls together with the pagination section', async ({
    page,
  }) => {
    await expect(page.getByText(/Showing \d+ of \d+ products/)).toBeVisible({
      timeout: 30_000,
    });
    // The page navigation only renders when there are multiple pages. Rather
    // than branch on its presence, assert the controls travel together with it.
    const pagination = page.getByRole('navigation', { name: 'Product pages' });
    const sectionCount = await pagination.count();
    await expect(
      pagination.getByRole('button', { name: 'Previous' }),
    ).toHaveCount(sectionCount);
    await expect(pagination.getByRole('button', { name: 'Next' })).toHaveCount(
      sectionCount,
    );
    await expect(
      pagination.getByRole('button', { name: 'Page 1', exact: true }),
    ).toHaveCount(sectionCount);
  });

  test('should show results count', async ({ page }) => {
    await expect(page.getByText(/Showing \d+ of \d+ products/)).toBeVisible({
      timeout: 30_000,
    });
  });

  test('should filter products on sale from the offers banner', async ({
    page,
  }) => {
    const banner = page.getByRole('region', { name: 'Top deals' });
    await expect(banner).toBeVisible({ timeout: 30_000 });

    const onSaleResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/products?') &&
        res.url().includes('onSale=true'),
    );
    await banner.getByRole('link', { name: 'See all offers' }).click();
    await page.waitForURL(/\/products\?sale=1$/);
    await onSaleResponse;

    // Exact, because the "Remove filter On sale" chip's label also contains "On sale".
    await expect(page.getByLabel('On sale', { exact: true })).toBeChecked();
    await expect(
      page.getByRole('button', { name: 'Remove filter On sale' }),
    ).toBeVisible();
  });
});
