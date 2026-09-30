import {
  canRequestDelivery,
  canSellerMoveOrder,
  deliveryStatusLabel,
  isActiveDelivery,
  mapsLink,
  orderStatusLabel,
  parseCheckoutInput,
  parseDeliveryAddress,
  parseDeliverySettings,
  parseLocation,
  parseOrderUpdate,
  parseRiderProfileInput,
  vehicleLabel,
} from './delivery.model.js';

const address = (overrides: Record<string, unknown> = {}) => ({
  recipientName: ' Achieng Otieno ',
  phone: '+254 712 345 678',
  zone: 'Nairobi',
  area: ' Kilimani ',
  street: '',
  notes: ' Blue gate next to the chemist ',
  ...overrides,
});

const checkout = (overrides: Record<string, unknown> = {}) => ({
  items: [
    {
      productId: 'p1',
      quantity: 2,
      choices: { Size: '42' },
      paymentOption: 'deposit',
    },
  ],
  address: address(),
  ...overrides,
});

describe('parseDeliveryAddress', () => {
  it('tidies a good address and drops empty optional fields', () => {
    expect(parseDeliveryAddress(address())).toEqual({
      address: {
        recipientName: 'Achieng Otieno',
        phone: '+254712345678',
        zone: 'Nairobi',
        area: 'Kilimani',
        notes: 'Blue gate next to the chemist',
      },
    });
  });

  it.each([
    [{ recipientName: 'A' }, 'name of the person'],
    [{ phone: 'call me' }, 'phone number'],
    [{ zone: 'Atlantis' }, 'town to deliver to'],
    [{ area: '' }, 'estate or area'],
    [{ street: 'x'.repeat(121) }, 'street and building'],
    [{ notes: 'x'.repeat(301) }, 'directions for the rider'],
  ])('rejects %j', (overrides, message) => {
    const result = parseDeliveryAddress(address(overrides));
    expect('error' in result && result.error).toContain(message);
  });
});

describe('parseCheckoutInput', () => {
  it('accepts cart lines, an address and an upper-cased code', () => {
    const result = parseCheckoutInput(checkout({ discountCode: ' save10 ' }));
    expect(result).toEqual({
      checkout: {
        items: [
          {
            productId: 'p1',
            quantity: 2,
            choices: { Size: '42' },
            paymentOption: 'deposit',
          },
        ],
        address: expect.objectContaining({ zone: 'Nairobi' }),
        discountCode: 'SAVE10',
      },
    });
  });

  it('rejects an empty cart', () => {
    expect(parseCheckoutInput(checkout({ items: [] }))).toEqual({
      error: 'Your cart is empty.',
    });
  });

  it.each([
    { productId: 'p1', quantity: 0, paymentOption: 'deposit' },
    { productId: 'p1', quantity: 1, paymentOption: 'barter' },
    { productId: 'p1', quantity: 1, paymentOption: 'deposit', choices: [1] },
    { quantity: 1, paymentOption: 'deposit' },
  ])('rejects a malformed line %j', (item) => {
    expect(parseCheckoutInput(checkout({ items: [item] }))).toEqual({
      error: 'Some cart items couldn’t be read.',
    });
  });

  it('passes on address problems and odd codes', () => {
    expect(
      parseCheckoutInput(checkout({ address: address({ zone: '' }) })),
    ).toEqual({ error: 'Choose the town to deliver to.' });
    expect(parseCheckoutInput(checkout({ discountCode: 'no way' }))).toEqual({
      error: 'That discount code doesn’t look right.',
    });
  });
});

describe('parseOrderUpdate', () => {
  it('accepts confirm and cancel with an optional note', () => {
    expect(parseOrderUpdate({ status: 'confirmed', note: '  ' })).toEqual({
      status: 'confirmed',
    });
    expect(
      parseOrderUpdate({ status: 'cancelled', note: ' Out of stock ' }),
    ).toEqual({ status: 'cancelled', note: 'Out of stock' });
  });

  it('rejects other statuses and long notes', () => {
    expect(parseOrderUpdate({ status: 'delivered' })).toEqual({
      error: 'Choose confirm or cancel.',
    });
    expect(
      parseOrderUpdate({ status: 'cancelled', note: 'x'.repeat(501) }),
    ).toHaveProperty('error');
  });
});

describe('parseDeliverySettings', () => {
  it('rounds the fee', () => {
    expect(parseDeliverySettings({ zone: 'Mombasa', fee: 2.499 })).toEqual({
      settings: { zone: 'Mombasa', fee: 2.5 },
    });
  });

  it('allows free delivery but not negative or huge fees', () => {
    expect(parseDeliverySettings({ zone: 'Kisumu', fee: 0 })).toEqual({
      settings: { zone: 'Kisumu', fee: 0 },
    });
    expect(parseDeliverySettings({ zone: 'Kisumu', fee: -1 })).toHaveProperty(
      'error',
    );
    expect(parseDeliverySettings({ zone: 'Kisumu', fee: 501 })).toHaveProperty(
      'error',
    );
    expect(parseDeliverySettings({ zone: 'Paris', fee: 3 })).toEqual({
      error: 'Choose the town riders collect orders from.',
    });
  });
});

describe('parseRiderProfileInput', () => {
  it('removes repeated zones and treats missing availability as off', () => {
    expect(
      parseRiderProfileInput({
        vehicle: 'motorbike',
        zones: ['Nairobi', 'Kiambu', 'Nairobi'],
      }),
    ).toEqual({
      profile: {
        vehicle: 'motorbike',
        zones: ['Nairobi', 'Kiambu'],
        available: false,
      },
    });
  });

  it('needs a vehicle and at least one known zone', () => {
    expect(
      parseRiderProfileInput({ vehicle: 'boat', zones: ['Nairobi'] }),
    ).toEqual({ error: 'Choose how you get around.' });
    expect(parseRiderProfileInput({ vehicle: 'car', zones: [] })).toEqual({
      error: 'Choose at least one town you deliver in.',
    });
    expect(
      parseRiderProfileInput({ vehicle: 'car', zones: ['Nowhere'] }),
    ).toHaveProperty('error');
  });
});

describe('parseLocation', () => {
  it('accepts real coordinates only', () => {
    expect(parseLocation({ lat: -1.29, lng: 36.82 })).toEqual({
      lat: -1.29,
      lng: 36.82,
    });
    expect(parseLocation({ lat: 91, lng: 0 })).toHaveProperty('error');
    expect(parseLocation({ lat: '1', lng: 2 })).toHaveProperty('error');
  });
});

describe('order and delivery status rules', () => {
  it('lets sellers confirm or cancel new orders, and cancel confirmed ones', () => {
    expect(canSellerMoveOrder('placed', 'confirmed')).toBe(true);
    expect(canSellerMoveOrder('placed', 'cancelled')).toBe(true);
    expect(canSellerMoveOrder('confirmed', 'cancelled')).toBe(true);
    expect(canSellerMoveOrder('confirmed', 'delivered')).toBe(false);
    expect(canSellerMoveOrder('out_for_delivery', 'cancelled')).toBe(false);
  });

  it('allows one delivery at a time, for confirmed orders', () => {
    expect(canRequestDelivery('confirmed')).toBe(true);
    expect(canRequestDelivery('confirmed', 'declined')).toBe(true);
    expect(canRequestDelivery('confirmed', 'cancelled')).toBe(true);
    expect(canRequestDelivery('confirmed', 'open')).toBe(false);
    expect(canRequestDelivery('placed')).toBe(false);
    expect(isActiveDelivery('picked_up')).toBe(true);
    expect(isActiveDelivery('delivered')).toBe(false);
  });

  it('labels statuses and vehicles', () => {
    expect(orderStatusLabel('out_for_delivery')).toBe('Out for delivery');
    expect(deliveryStatusLabel('open')).toBe('Waiting for a rider');
    expect(vehicleLabel('on_foot')).toBe('On foot');
  });

  it('links to a map', () => {
    expect(mapsLink({ lat: -1.3, lng: 36.8 })).toBe(
      'https://www.google.com/maps?q=-1.3,36.8',
    );
  });
});
