export const ORDER_ID = '1'.repeat(24);
export const DELIVERY_ID = '2'.repeat(24);
export const SHOP_ID = '3'.repeat(24);
export const RIDER_ID = '4'.repeat(24);
export const USER_ID = '5'.repeat(24);
export const PRODUCT_ID = '6'.repeat(24);

export const shop = { id: SHOP_ID, name: 'Kicks KE' };
export const shopper = {
  id: USER_ID,
  name: 'Amina',
  email: 'amina@example.com',
};

export const orderRecord = (overrides: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  number: 'ML-7Q2K9D',
  shopId: SHOP_ID,
  shopName: 'Kicks KE',
  userId: USER_ID,
  buyerName: 'Amina',
  buyerEmail: 'amina@example.com',
  address: {
    recipientName: 'Amina',
    phone: '+254712345678',
    zone: 'Nairobi',
    area: 'Kilimani',
    street: 'Argwings Kodhek Rd, Apt 4B',
    notes: null,
  },
  items: [
    {
      productId: PRODUCT_ID,
      name: 'Leather sneakers',
      imageUrl: 'https://ik.imagekit.io/demo/shoes.jpg',
      choices: { Size: '42' },
      quantity: 2,
      unitPrice: 50,
      total: 100,
      discount: 0,
      paymentOption: 'deposit',
    },
  ],
  subtotal: 100,
  discount: 0,
  discountCode: null,
  deliveryFee: 5,
  total: 105,
  payNow: 55,
  onDelivery: 50,
  status: 'confirmed',
  deliveryCode: '4821',
  createdAt: new Date('2026-09-30T08:00:00Z'),
  updatedAt: new Date('2026-09-30T08:00:00Z'),
  ...overrides,
});

export const deliveryRecord = (overrides: Record<string, unknown> = {}) => ({
  id: DELIVERY_ID,
  orderId: ORDER_ID,
  shopId: SHOP_ID,
  pickupZone: 'Nairobi',
  dropoffZone: 'Nairobi',
  fee: 5,
  status: 'open',
  offeredRiderId: null,
  riderId: null,
  codeAttempts: 0,
  codeLockedUntil: null,
  lastLocation: null,
  events: [
    {
      status: 'open',
      at: new Date('2026-09-30T09:00:00Z'),
      note: 'Posted to riders in Nairobi',
      lat: null,
      lng: null,
    },
  ],
  createdAt: new Date('2026-09-30T09:00:00Z'),
  updatedAt: new Date('2026-09-30T09:00:00Z'),
  ...overrides,
});

export const rider = (overrides: Record<string, unknown> = {}) => ({
  id: RIDER_ID,
  name: 'Brian',
  email: 'brian@example.com',
  phone_number: '+254722000111',
  vehicle: 'motorbike' as string | null,
  zones: ['Nairobi'],
  available: true,
  ...overrides,
});
