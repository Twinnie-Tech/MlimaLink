import { preprocessData, type UserAction } from './preprocess-data';

const userId = 'a'.repeat(24);
const shopId = 'b'.repeat(24);
const phone = { id: 'c'.repeat(24), title: 'Phone' };
const shoes = { id: 'd'.repeat(24), title: 'Shoes' };
const at = new Date('2026-10-13T17:00:00.000Z');

const action = (productId: string, name: string): UserAction => ({
  userId,
  productId,
  shopId,
  action: name,
  at,
});

describe('preprocessData', () => {
  it('turns each action into an interaction and returns the products', () => {
    const products = [phone, shoes];

    const result = preprocessData(
      [action(phone.id, 'product_view'), action(shoes.id, 'add_to_cart')],
      products,
    );

    expect(result).toEqual({
      interactions: [
        { userId, productId: phone.id, actionType: 'product_view' },
        { userId, productId: shoes.id, actionType: 'add_to_cart' },
      ],
      products,
    });
  });

  it('drops actions on products that are no longer listed', () => {
    const { interactions } = preprocessData(
      [
        action('e'.repeat(24), 'product_view'),
        action(phone.id, 'add_to_wishlist'),
      ],
      [phone],
    );

    expect(interactions).toEqual([
      { userId, productId: phone.id, actionType: 'add_to_wishlist' },
    ]);
  });
});
