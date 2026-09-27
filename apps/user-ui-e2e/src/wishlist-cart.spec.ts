import { test, expect } from '@playwright/test';

test.describe('Wishlist and cart', () => {
  test('should wishlist a product from the listing and see it on the wishlist page', async ({
    page,
  }) => {
    await page.goto('/products');
    const header = page.locator('header');

    const firstCard = page
      .getByRole('button', { name: /^View details for / })
      .first();
    await expect(firstCard).toBeVisible({ timeout: 30_000 });
    const productName = await firstCard.locator('h3').innerText();

    await firstCard
      .getByRole('button', { name: `Add ${productName} to wishlist` })
      .click();

    // Toggling the heart must not open the product.
    await expect(page).toHaveURL(/\/products$/);
    await expect(
      firstCard.getByRole('button', {
        name: `Remove ${productName} from wishlist`,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      header.getByRole('link', { name: 'Wishlist, 1 item' }),
    ).toBeVisible();

    await header.getByRole('link', { name: 'Wishlist, 1 item' }).click();
    await page.waitForURL('**/wishlist');
    await expect(
      page.getByRole('heading', { name: 'My Wishlist' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: productName })).toBeVisible();

    // The wishlist survives a reload.
    await page.reload();
    await expect(page.getByRole('link', { name: productName })).toBeVisible();

    await page
      .getByRole('button', { name: `Remove ${productName} from wishlist` })
      .click();
    await expect(page.getByText('Your wishlist is empty')).toBeVisible();
    await expect(
      header.getByRole('link', { name: 'Wishlist, 0 items' }),
    ).toBeVisible();
  });

  test('should add a product to the cart from the detail page and manage it', async ({
    page,
  }) => {
    await page.goto('/products');
    const header = page.locator('header');

    const inStockCheckbox = page.locator('input[type="checkbox"]').first();
    const inStockResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/products?') &&
        res.url().includes('inStock=true'),
    );
    await inStockCheckbox.check();
    await inStockResponse;
    const firstCard = page
      .getByRole('button', { name: /^View details for / })
      .first();
    await expect(firstCard).toBeVisible({ timeout: 30_000 });
    await firstCard.click();
    await page.waitForURL(/\/products\/\d+$/);

    const productName = await page.locator('h1').last().innerText();
    const priceText = await page
      .locator('[class*="product-price"]')
      .first()
      .innerText();
    const unitPrice = Number(priceText.replace(/[^0-9.]/g, ''));

    await page.getByRole('button', { name: 'Add to Wishlist' }).click();
    await expect(
      page.getByRole('button', { name: 'Remove from Wishlist' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Add to Cart' }).click();
    await expect(
      page.getByRole('button', { name: 'Added to Cart ✓' }),
    ).toBeVisible();
    await expect(
      header.getByRole('link', { name: 'Cart, 1 item' }),
    ).toBeVisible();

    await header.getByRole('link', { name: 'Cart, 1 item' }).click();
    await page.waitForURL('**/cart');
    await expect(
      page.getByRole('heading', { name: 'Shopping Cart' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: productName })).toBeVisible();
    await expect(page.getByTestId('cart-subtotal')).toHaveText(
      `$${unitPrice.toFixed(2)}`,
    );

    await page
      .getByRole('button', { name: `Increase quantity of ${productName}` })
      .click();
    await expect(
      page.getByRole('status', { name: `Quantity of ${productName}` }),
    ).toHaveText('2');
    await expect(page.getByTestId('cart-subtotal')).toHaveText(
      `$${(unitPrice * 2).toFixed(2)}`,
    );
    await expect(
      header.getByRole('link', { name: 'Cart, 2 items' }),
    ).toBeVisible();

    await page
      .getByRole('button', { name: `Remove ${productName} from cart` })
      .click();
    await expect(page.getByText('Your cart is empty')).toBeVisible();
    await expect(
      header.getByRole('link', { name: 'Cart, 0 items' }),
    ).toBeVisible();
  });

  test('should open the login page from the profile icon', async ({ page }) => {
    await page.goto('/products');

    await page.locator('header').getByRole('link', { name: 'Sign in' }).click();

    await page.waitForURL('**/login');
    await expect(
      page.getByRole('heading', { name: 'Login to MlimaLink' }),
    ).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  });
});
