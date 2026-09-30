import type {
  PaymentOption,
  Product,
  ProductOption,
  ProductOptionValue,
  ProductSpec,
  ProductVariant,
} from './product.model.js';

export const PAYMENT_OPTIONS: {
  id: PaymentOption;
  label: string;
  description: string;
}[] = [
  {
    id: 'full_upfront',
    label: 'Full payment upfront',
    description: 'Pay the whole amount when you order.',
  },
  {
    id: 'deposit',
    label: '50% deposit',
    description: 'Pay half when you order and the rest on delivery.',
  },
  {
    id: 'cash_on_delivery',
    label: 'Cash on delivery',
    description: 'Pay the whole amount when it arrives.',
  },
];

/** Share of the price paid with a deposit when ordering; the rest is paid on delivery. */
export const DEPOSIT_SHARE = 0.5;

/** Products listed before payment options existed are paid upfront. */
export const DEFAULT_PAYMENT_OPTIONS: PaymentOption[] = ['full_upfront'];

export function paymentOptionsOf(
  product: Pick<Product, 'paymentOptions'>,
): PaymentOption[] {
  return product.paymentOptions?.length
    ? product.paymentOptions
    : DEFAULT_PAYMENT_OPTIONS;
}

export function paymentLabel(option: PaymentOption): string {
  return PAYMENT_OPTIONS.find((entry) => entry.id === option)?.label ?? option;
}

/** How much of the price is paid when ordering with this option (1 = all of it). */
export function dueNowShare(option: PaymentOption): number {
  if (option === 'full_upfront') return 1;
  return option === 'deposit' ? DEPOSIT_SHARE : 0;
}

/** Colour swatches offered for every colour option. Sellers can add their own. */
export const COLOURS: ProductOptionValue[] = [
  { label: 'Black', swatch: '#111111' },
  { label: 'White', swatch: '#ffffff' },
  { label: 'Grey', swatch: '#9ca3af' },
  { label: 'Navy', swatch: '#1e3a8a' },
  { label: 'Blue', swatch: '#2563eb' },
  { label: 'Red', swatch: '#dc2626' },
  { label: 'Green', swatch: '#16a34a' },
  { label: 'Yellow', swatch: '#facc15' },
  { label: 'Orange', swatch: '#f97316' },
  { label: 'Pink', swatch: '#ec4899' },
  { label: 'Purple', swatch: '#9333ea' },
  { label: 'Brown', swatch: '#92400e' },
  { label: 'Beige', swatch: '#e7d3b1' },
  { label: 'Gold', swatch: '#d4a017' },
  { label: 'Silver', swatch: '#c0c0c0' },
];

/** How the picker shows an option: swatches, size chips, or plain chips. */
export type OptionKind = 'colour' | 'size' | 'choice';

/** An option a category suggests, with ready-made values the seller can tick. */
export interface OptionTemplate {
  name: string;
  kind: OptionKind;
  values: ProductOptionValue[];
}

/** A detail a category asks the seller for, e.g. Brand. */
export interface SpecTemplate {
  name: string;
  placeholder?: string;
  /** Offered as quick picks; the seller can still type anything. */
  suggestions?: string[];
}

export interface SubCategoryTemplate {
  name: string;
  options: OptionTemplate[];
  specs: SpecTemplate[];
  /** Shown after the price, e.g. "month" for "$500.00 / month". */
  pricePeriod?: string;
  /** Shoppers call, WhatsApp or email the seller instead of using the cart, e.g. houses and cars. */
  contactSeller?: boolean;
  /**
   * A service someone offers, e.g. web development or car detailing. Shoppers send a
   * request or contact the provider; the price is a starting price, and stock above 0
   * means the provider is taking new requests.
   */
  service?: boolean;
}

export interface CategoryTemplate {
  name: string;
  subCategories: SubCategoryTemplate[];
}

const labels = (...list: string[]) => list.map((label) => ({ label }));
const colour = (name = 'Colour'): OptionTemplate => ({
  name,
  kind: 'colour',
  values: COLOURS,
});
const size = (name: string, ...list: string[]): OptionTemplate => ({
  name,
  kind: 'size',
  values: labels(...list),
});
const choice = (name: string, ...list: string[]): OptionTemplate => ({
  name,
  kind: 'choice',
  values: labels(...list),
});
const spec = (
  name: string,
  placeholder?: string,
  suggestions?: string[],
): SpecTemplate => ({ name, placeholder, suggestions });

const BRAND = spec('Brand', 'e.g. Bata');
const ORIGIN = spec('Origin', 'e.g. Murang’a');
const ORGANIC = spec('Organic', undefined, ['Yes', 'No']);
const MODEL = spec('Model', 'e.g. Galaxy A15');
const WARRANTY = spec('Warranty', 'e.g. 12 months');
const MATERIAL = spec('Material', 'e.g. Leather');
const MADE_IN = spec('Made in', 'e.g. Kajiado');
const GENDER = spec('Gender', undefined, ['Women', 'Men', 'Unisex']);
const condition = (...list: string[]) =>
  spec('Condition', undefined, list.length ? list : ['New', 'Used']);

const weight = size('Weight', '500 g', '1 kg', '2 kg', '5 kg');
const smallPack = size('Pack size', '50 g', '100 g', '250 g', '500 g', '1 kg');
const grainPack = size(
  'Pack size',
  '1 kg',
  '2 kg',
  '5 kg',
  '10 kg',
  '25 kg',
  '50 kg',
  '90 kg',
);
const bottle = size('Size', '30 ml', '50 ml', '100 ml', '200 ml', '500 ml');
const smallMediumLarge = size('Size', 'Small', 'Medium', 'Large');

const LOCATION = spec('Location', 'e.g. Kilimani, Nairobi');
const TURNAROUND = spec('Typical turnaround', 'e.g. 2–4 weeks');

/** The category that holds service listings. */
export const SERVICES_CATEGORY = 'Services';

const service = (
  name: string,
  offered: string,
  extraSpecs: SpecTemplate[] = [],
): SubCategoryTemplate => ({
  name,
  options: [],
  specs: [
    spec('Services offered', offered),
    spec('Price basis', undefined, [
      'Per project',
      'Per hour',
      'Per session',
      'Per day',
      'Fixed fee',
    ]),
    spec('Where', undefined, [
      'Online / remote',
      'At my premises',
      'I come to you',
    ]),
    ...extraSpecs,
  ],
  contactSeller: true,
  service: true,
});
const CAR_MAKE = spec('Make', 'e.g. Toyota', [
  'Toyota',
  'Nissan',
  'Mazda',
  'Subaru',
  'Honda',
  'Mitsubishi',
  'Volkswagen',
  'Mercedes-Benz',
  'BMW',
  'Isuzu',
]);
const CAR_MODEL = spec('Model', 'e.g. Fielder');
const YEAR = spec('Year', 'e.g. 2016');
const MILEAGE = spec('Mileage', 'e.g. 85,000 km');
const TRANSMISSION = spec('Transmission', undefined, ['Automatic', 'Manual']);
const FUEL = spec('Fuel', undefined, [
  'Petrol',
  'Diesel',
  'Hybrid',
  'Electric',
]);
const BODY_TYPE = spec('Body type', undefined, [
  'Saloon',
  'Hatchback',
  'Station wagon',
  'SUV',
  'Pickup',
  'Van',
  'Minibus',
]);
const VEHICLE_CONDITION = condition(
  'Brand new',
  'Foreign used',
  'Locally used',
);

const unitType = size(
  'Unit type',
  'Bedsitter',
  'Studio',
  '1 bedroom',
  '2 bedrooms',
  '3 bedrooms',
  '4 bedrooms',
  '5+ bedrooms',
);
const plotSize = size(
  'Plot size',
  '40×80 (⅛ acre)',
  '50×100 (¼ acre)',
  '½ acre',
  '1 acre',
  '2 acres',
  '5 acres',
  '10+ acres',
);
const HOUSE_TYPE = spec('House type', undefined, [
  'Apartment',
  'Bungalow',
  'Maisonette',
  'Villa',
  'Townhouse',
  'Mansion',
]);
const BATHROOMS = spec('Bathrooms', 'e.g. 2');
const FURNISHING = spec('Furnishing', undefined, [
  'Unfurnished',
  'Semi-furnished',
  'Furnished',
]);
const TITLE_DEED = spec('Title deed', undefined, [
  'Ready',
  'Mother title',
  'In process',
]);
const LAND_USE = spec('Land use', undefined, [
  'Residential',
  'Agricultural',
  'Commercial',
  'Mixed use',
]);
const LAND_UTILITIES = spec('Water & electricity', undefined, [
  'Both on site',
  'Water only',
  'Electricity only',
  'Nearby',
  'None',
]);

/**
 * What each category asks for. Options become the shopper's choices (and the seller's
 * variant table); specs are details shown on the product page.
 */
export const CATEGORY_TEMPLATES: CategoryTemplate[] = [
  {
    name: 'Fruits & Vegetables',
    subCategories: [
      {
        name: 'Fruits',
        options: [size('Pack size', '250 g', '500 g', '1 kg', '2 kg', '5 kg')],
        specs: [spec('Variety', 'e.g. Hass'), ORGANIC, ORIGIN],
      },
      {
        name: 'Vegetables',
        options: [size('Pack size', '250 g', '500 g', '1 kg', '2 kg', '5 kg')],
        specs: [spec('Variety', 'e.g. Sukuma wiki'), ORGANIC, ORIGIN],
      },
      {
        name: 'Herbs & Greens',
        options: [size('Pack size', 'Bunch', '100 g', '250 g', '500 g')],
        specs: [ORGANIC, ORIGIN],
      },
    ],
  },
  {
    name: 'Grains & Cereals',
    subCategories: ['Maize', 'Rice', 'Beans & Pulses', 'Flour'].map((name) => ({
      name,
      options: [grainPack],
      specs: [BRAND, spec('Grade', 'e.g. Grade 1'), ORIGIN],
    })),
  },
  {
    name: 'Dairy & Eggs',
    subCategories: [
      {
        name: 'Milk',
        options: [size('Volume', '250 ml', '500 ml', '1 L', '5 L')],
        specs: [BRAND, spec('Type', 'e.g. Fresh, Long life')],
      },
      {
        name: 'Yoghurt',
        options: [size('Volume', '150 ml', '250 ml', '500 ml', '1 L')],
        specs: [BRAND, spec('Flavour', 'e.g. Strawberry')],
      },
      {
        name: 'Cheese & Butter',
        options: [size('Weight', '100 g', '250 g', '500 g', '1 kg')],
        specs: [BRAND],
      },
      {
        name: 'Eggs',
        options: [size('Pack', '6 eggs', '12 eggs', 'Tray of 30')],
        specs: [spec('Type', undefined, ['Kienyeji', 'Layers'])],
      },
    ],
  },
  {
    name: 'Meat & Poultry',
    subCategories: [
      {
        name: 'Beef',
        options: [weight],
        specs: [spec('Cut', 'e.g. Steak, Mince'), ORIGIN],
      },
      {
        name: 'Goat & Mutton',
        options: [weight],
        specs: [spec('Cut', 'e.g. Ribs, Leg'), ORIGIN],
      },
      {
        name: 'Chicken',
        options: [weight],
        specs: [spec('Type', undefined, ['Kienyeji', 'Broiler']), ORIGIN],
      },
      {
        name: 'Pork',
        options: [weight],
        specs: [spec('Cut', 'e.g. Chops, Sausages'), ORIGIN],
      },
    ],
  },
  {
    name: 'Fish & Seafood',
    subCategories: ['Fresh fish', 'Dried fish', 'Seafood'].map((name) => ({
      name,
      options: [weight],
      specs: [
        spec('Type', 'e.g. Tilapia'),
        spec('Source', undefined, ['Lake', 'Ocean', 'Farmed']),
      ],
    })),
  },
  {
    name: 'Spices & Herbs',
    subCategories: ['Whole spices', 'Ground spices', 'Blends'].map((name) => ({
      name,
      options: [smallPack],
      specs: [BRAND, ORIGIN],
    })),
  },
  {
    name: 'Beverages',
    subCategories: [
      {
        name: 'Tea',
        options: [size('Pack size', '100 g', '250 g', '500 g', '1 kg')],
        specs: [BRAND, spec('Type', 'e.g. Black, Green')],
      },
      {
        name: 'Coffee',
        options: [
          size('Pack size', '100 g', '250 g', '500 g', '1 kg'),
          choice('Grind', 'Whole bean', 'Ground'),
        ],
        specs: [BRAND, spec('Roast', undefined, ['Light', 'Medium', 'Dark'])],
      },
      {
        name: 'Juice',
        options: [size('Volume', '330 ml', '500 ml', '1 L', '2 L')],
        specs: [BRAND, spec('Flavour', 'e.g. Mango')],
      },
      {
        name: 'Water & soft drinks',
        options: [
          size('Volume', '300 ml', '500 ml', '1 L', '1.5 L', '5 L', '18.9 L'),
        ],
        specs: [BRAND, spec('Pack count', 'e.g. 12')],
      },
    ],
  },
  {
    name: 'Farm Inputs',
    subCategories: [
      {
        name: 'Seeds',
        options: [size('Pack size', '250 g', '500 g', '1 kg', '2 kg', '10 kg')],
        specs: [
          BRAND,
          spec('Variety', 'e.g. H614'),
          spec('Maturity', 'e.g. 120 days'),
        ],
      },
      {
        name: 'Fertiliser',
        options: [size('Bag size', '1 kg', '10 kg', '25 kg', '50 kg')],
        specs: [BRAND, spec('Type', 'e.g. DAP, CAN')],
      },
      {
        name: 'Animal feed',
        options: [size('Bag size', '10 kg', '35 kg', '50 kg', '70 kg')],
        specs: [BRAND, spec('For', 'e.g. Layers, Dairy cows')],
      },
      {
        name: 'Crop protection',
        options: [size('Volume', '100 ml', '250 ml', '500 ml', '1 L', '5 L')],
        specs: [
          BRAND,
          spec('Active ingredient'),
          spec('Use against', 'e.g. Aphids'),
        ],
      },
    ],
  },
  {
    name: 'Farm Equipment',
    subCategories: ['Hand tools', 'Irrigation', 'Machinery', 'Storage'].map(
      (name) => ({
        name,
        options: [],
        specs: [BRAND, MODEL, condition(), WARRANTY],
      }),
    ),
  },
  {
    name: 'Crafts & Handmade',
    subCategories: [
      {
        name: 'Jewellery',
        options: [colour(), smallMediumLarge],
        specs: [spec('Material', 'e.g. Beads, Brass'), MADE_IN],
      },
      {
        name: 'Baskets & weaving',
        options: [colour(), smallMediumLarge],
        specs: [spec('Material', 'e.g. Sisal'), MADE_IN],
      },
      {
        name: 'Art & decor',
        options: [size('Size', 'A4', 'A3', 'A2', 'A1')],
        specs: [spec('Medium', 'e.g. Acrylic on canvas'), spec('Artist')],
      },
      {
        name: 'Carvings',
        options: [smallMediumLarge],
        specs: [spec('Material', 'e.g. Soapstone'), MADE_IN],
      },
    ],
  },
  {
    name: 'Fashion',
    subCategories: [
      {
        name: 'Shoes',
        options: [
          colour(),
          size(
            'Size',
            ...Array.from({ length: 13 }, (_, i) => String(35 + i)), // EU 35–47
          ),
        ],
        specs: [BRAND, MATERIAL, GENDER],
      },
      {
        name: 'Clothing',
        options: [
          colour(),
          size('Size', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'),
        ],
        specs: [
          BRAND,
          spec('Fabric', 'e.g. Cotton'),
          spec('Fit', undefined, ['Slim', 'Regular', 'Loose']),
          GENDER,
        ],
      },
      {
        name: 'Kids',
        options: [
          colour(),
          size(
            'Age',
            '0–6 months',
            '6–12 months',
            '1–2 years',
            '3–4 years',
            '5–6 years',
            '7–8 years',
            '9–10 years',
            '11–12 years',
          ),
        ],
        specs: [
          BRAND,
          spec('Fabric', 'e.g. Cotton'),
          spec('Gender', undefined, ['Girls', 'Boys', 'Unisex']),
        ],
      },
      {
        name: 'Bags',
        options: [colour()],
        specs: [BRAND, MATERIAL],
      },
      {
        name: 'Accessories',
        options: [colour()],
        specs: [BRAND, MATERIAL, GENDER],
      },
    ],
  },
  {
    name: 'Electronics',
    subCategories: [
      {
        name: 'Phones & tablets',
        options: [
          colour(),
          size('Storage', '32 GB', '64 GB', '128 GB', '256 GB', '512 GB'),
        ],
        specs: [
          BRAND,
          MODEL,
          condition('New', 'Refurbished', 'Used'),
          WARRANTY,
        ],
      },
      {
        name: 'Computers',
        options: [
          size('Memory', '4 GB', '8 GB', '16 GB', '32 GB'),
          size('Storage', '256 GB', '512 GB', '1 TB', '2 TB'),
        ],
        specs: [
          BRAND,
          spec('Model', 'e.g. ThinkPad T14'),
          spec('Processor', 'e.g. Intel Core i5'),
          condition('New', 'Refurbished', 'Used'),
          WARRANTY,
        ],
      },
      {
        name: 'TVs',
        options: [size('Screen size', '32"', '43"', '50"', '55"', '65"')],
        specs: [
          BRAND,
          MODEL,
          condition('New', 'Refurbished', 'Used'),
          WARRANTY,
        ],
      },
      {
        name: 'Audio',
        options: [colour()],
        specs: [BRAND, MODEL, WARRANTY],
      },
      {
        name: 'Accessories',
        options: [colour()],
        specs: [BRAND, spec('Compatible with', 'e.g. iPhone 15')],
      },
    ],
  },
  {
    name: 'Home & Living',
    subCategories: [
      {
        name: 'Furniture',
        options: [colour('Finish')],
        specs: [
          spec('Material', 'e.g. Mahogany'),
          spec('Dimensions', 'e.g. 120 × 60 × 75 cm'),
        ],
      },
      {
        name: 'Kitchen & dining',
        options: [colour()],
        specs: [BRAND, spec('Material', 'e.g. Stainless steel')],
      },
      {
        name: 'Bedding',
        options: [colour(), size('Bed size', '3×6', '4×6', '5×6', '6×6')],
        specs: [spec('Fabric', 'e.g. Cotton'), spec('Thread count')],
      },
      {
        name: 'Decor',
        options: [colour()],
        specs: [MATERIAL, spec('Dimensions', 'e.g. 40 × 40 cm')],
      },
    ],
  },
  {
    name: 'Health & Beauty',
    subCategories: [
      {
        name: 'Skincare',
        options: [bottle],
        specs: [
          BRAND,
          spec('Skin type', undefined, [
            'All',
            'Dry',
            'Oily',
            'Combination',
            'Sensitive',
          ]),
        ],
      },
      {
        name: 'Hair care',
        options: [bottle],
        specs: [BRAND, spec('Hair type', 'e.g. Natural, Relaxed')],
      },
      {
        name: 'Makeup',
        // Shades differ by brand, so sellers add their own with the colour picker.
        options: [{ name: 'Shade', kind: 'colour', values: [] }],
        specs: [BRAND],
      },
      {
        name: 'Fragrance',
        options: [size('Size', '30 ml', '50 ml', '100 ml')],
        specs: [BRAND, GENDER],
      },
      {
        name: 'Supplements',
        options: [size('Pack', '30 tablets', '60 tablets', '90 tablets')],
        specs: [BRAND],
      },
    ],
  },
  {
    name: 'Vehicles',
    subCategories: [
      {
        name: 'Cars for sale',
        options: [],
        specs: [
          CAR_MAKE,
          CAR_MODEL,
          YEAR,
          MILEAGE,
          TRANSMISSION,
          FUEL,
          spec('Engine size', 'e.g. 1500 cc'),
          BODY_TYPE,
          VEHICLE_CONDITION,
          spec('Colour', 'e.g. Silver'),
          LOCATION,
        ],
        contactSeller: true,
      },
      {
        name: 'Cars for hire',
        options: [choice('Driver', 'Self drive', 'With driver')],
        specs: [
          CAR_MAKE,
          CAR_MODEL,
          YEAR,
          TRANSMISSION,
          FUEL,
          spec('Seats', 'e.g. 5'),
          BODY_TYPE,
          spec('Pick-up location', 'e.g. JKIA, Nairobi'),
        ],
        pricePeriod: 'day',
        contactSeller: true,
      },
      {
        name: 'Motorbikes',
        options: [],
        specs: [
          spec('Make', 'e.g. Bajaj', ['Bajaj', 'TVS', 'Honda', 'Yamaha']),
          spec('Model', 'e.g. Boxer 150'),
          YEAR,
          MILEAGE,
          spec('Engine size', 'e.g. 150 cc'),
          VEHICLE_CONDITION,
          LOCATION,
        ],
        contactSeller: true,
      },
      {
        name: 'Spare parts & accessories',
        options: [],
        specs: [
          BRAND,
          spec('Part number'),
          spec('Fits', 'e.g. Toyota Vitz 2010–2016'),
          condition('New', 'Used', 'Refurbished'),
        ],
      },
    ],
  },
  {
    name: 'Property',
    subCategories: [
      {
        name: 'Houses for rent',
        // One listing can offer several vacant units, each with its own rent.
        options: [unitType],
        specs: [
          HOUSE_TYPE,
          LOCATION,
          BATHROOMS,
          FURNISHING,
          spec('Parking', undefined, ['Yes', 'No']),
          spec('Deposit', 'e.g. 1 month’s rent'),
          spec('Water & electricity', 'e.g. Prepaid tokens'),
        ],
        pricePeriod: 'month',
        contactSeller: true,
      },
      {
        name: 'Houses for sale',
        options: [unitType],
        specs: [
          HOUSE_TYPE,
          LOCATION,
          BATHROOMS,
          spec('Plot size', 'e.g. ⅛ acre'),
          TITLE_DEED,
          FURNISHING,
        ],
        contactSeller: true,
      },
      {
        name: 'Land for sale',
        options: [plotSize],
        specs: [
          LOCATION,
          TITLE_DEED,
          LAND_USE,
          spec('Road access', 'e.g. 500 m off the tarmac'),
          LAND_UTILITIES,
        ],
        contactSeller: true,
      },
      {
        name: 'Land for lease',
        options: [plotSize],
        specs: [
          LOCATION,
          LAND_USE,
          spec('Minimum lease', 'e.g. 1 year'),
          LAND_UTILITIES,
        ],
        pricePeriod: 'year',
        contactSeller: true,
      },
    ],
  },
  {
    name: SERVICES_CATEGORY,
    subCategories: [
      service('Software & IT', 'e.g. Web apps, mobile apps, APIs', [
        spec('Tech stack', 'e.g. React, Node.js, Flutter'),
        TURNAROUND,
      ]),
      service('Design & Creative', 'e.g. Logos, branding, social media posts', [
        spec('Tools', 'e.g. Figma, Photoshop'),
        TURNAROUND,
      ]),
      service('Beauty & Wellness', 'e.g. Braids, manicure, bridal makeup', [
        spec('Session length', 'e.g. 2 hours'),
      ]),
      service(
        'Car Care & Detailing',
        'e.g. Interior detailing, ceramic coating',
        [spec('Vehicles', 'e.g. Saloons, SUVs, trucks')],
      ),
      service('Legal Services', 'e.g. Conveyancing, family law, contracts', [
        spec('Admitted as', 'e.g. Advocate of the High Court of Kenya'),
      ]),
      service('Accounting & Tax', 'e.g. Bookkeeping, KRA returns, audits'),
      service('Home Repairs & Trades', 'e.g. Plumbing, electrical, painting'),
      service('Cleaning', 'e.g. Homes, offices, carpets, fumigation'),
      service('Events & Photography', 'e.g. Weddings, catering, photo & video'),
      service('Tutoring & Training', 'e.g. KCSE maths, coding, driving', [
        spec('Level', 'e.g. Primary, high school, adults'),
      ]),
      service('Health & Fitness', 'e.g. Personal training, nutrition'),
      service('Business & Consulting', 'e.g. Business plans, marketing, HR'),
      service('Other Services', 'Describe what you offer'),
    ],
  },
  {
    name: 'Other',
    subCategories: [{ name: 'General', options: [], specs: [BRAND] }],
  },
];

export const PRODUCT_CATEGORIES = CATEGORY_TEMPLATES.map(
  (category) => category.name,
);

export const MAX_PRODUCT_IMAGES = 6;
export const MAX_OPTIONS = 3;
export const MAX_OPTION_VALUES = 30;
export const MAX_VARIANTS = 100;
export const MAX_SPECS = 20;
export const MAX_TAGS = 10;
export const SHORT_DESCRIPTION_MAX = 150;
/** Limits on the description's words; its formatting doesn't count. */
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 5000;
/** The description with its formatting, so heavy styling can't bloat a product. */
export const DESCRIPTION_HTML_MAX = 50_000;
/** Older listings kept photos inline as data URLs; this keeps each under ~500 KB. */
export const MAX_IMAGE_DATA_URL_LENGTH = 700_000;
/** A photo sent to the upload API as a data URL: about 3 MB. ImageKit resizes it for display. */
export const MAX_UPLOAD_DATA_URL_LENGTH = 4_000_000;

const IMAGEKIT_URL = /^https:\/\/ik\.imagekit\.io\/[^?#]+/;

/**
 * An ImageKit photo scaled down to `width` px (never enlarged) in the best format the
 * browser accepts, e.g. WebP or AVIF. Other URLs are returned as they are.
 */
export function sizedImage(src: string, width: number): string {
  const base = IMAGEKIT_URL.exec(src)?.[0];
  return base ? `${base}?tr=w-${width},c-at_max,f-auto,q-80` : src;
}

/** A `srcSet` offering an ImageKit photo at each width, or undefined for other URLs. */
export function imageSrcSet(src: string, widths: number[]): string | undefined {
  if (!IMAGEKIT_URL.test(src)) return undefined;
  return widths
    .map((width) => `${sizedImage(src, width)} ${width}w`)
    .join(', ');
}

export function getSubCategories(category: string): SubCategoryTemplate[] {
  return (
    CATEGORY_TEMPLATES.find((template) => template.name === category)
      ?.subCategories ?? []
  );
}

export function getSubCategoryTemplate(
  category: string,
  subCategory: string,
): SubCategoryTemplate | undefined {
  return getSubCategories(category).find(
    (template) => template.name === subCategory,
  );
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/** "$1,250,000.00". */
export function formatPrice(amount: number): string {
  return usd.format(amount);
}

/** Whether a description was written in the rich text editor rather than as plain text. */
export const isRichText = (value: string) => /<\/?[a-z][^>]*>/i.test(value);

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  nbsp: ' ',
};

/** A description's words without its formatting, on one line. */
export function descriptionText(value: string): string {
  if (!isRichText(value)) return value.replace(/\s+/g, ' ').trim();
  return value
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/blockquote|\/pre)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(amp|lt|gt|quot|#39|nbsp);/g,
      (_, name: string) => ENTITIES[name],
    )
    .replace(/\s+/g, ' ')
    .trim();
}

export function countWords(value: string): number {
  const words = descriptionText(value);
  return words ? words.split(' ').length : 0;
}

/**
 * How a product is sold, from its sub-category: the price period, whether shoppers
 * contact the seller, and whether it's a service they can send a request for.
 */
export function listingTerms(
  product: Pick<Product, 'category' | 'subCategory'>,
): { pricePeriod?: string; contactSeller: boolean; service: boolean } {
  const template = product.subCategory
    ? getSubCategoryTemplate(product.category, product.subCategory)
    : undefined;
  return {
    ...(template?.pricePeriod && { pricePeriod: template.pricePeriod }),
    contactSeller: template?.contactSeller ?? false,
    service: template?.service ?? false,
  };
}

/** Every combination of the options' values, in option order. Empty when there are no options. */
export function variantCombinations(
  options: ProductOption[],
): Record<string, string>[] {
  if (options.length === 0) return [];
  return options.reduce<Record<string, string>[]>(
    (combos, option) =>
      combos.flatMap((combo) =>
        option.values.map((value) => ({
          ...combo,
          [option.name]: value.label,
        })),
      ),
    [{}],
  );
}

/** "Black / 42": the choices in option order. */
export function variantLabel(
  choices: Record<string, string>,
  options: ProductOption[],
): string {
  return options.map((option) => choices[option.name]).join(' / ');
}

/** "Colour: Black · Size: 42". */
export function describeChoices(choices: Record<string, string>): string {
  return Object.entries(choices)
    .map(([name, value]) => `${name}: ${value}`)
    .join(' · ');
}

const matches = (
  variant: ProductVariant,
  choices: Record<string, string | undefined>,
) =>
  Object.entries(choices).every(
    ([name, value]) => value === undefined || variant.choices[name] === value,
  );

/** The variant matching a full set of choices, if any. */
export function findVariant(
  product: Pick<Product, 'options' | 'variants'>,
  choices: Record<string, string | undefined>,
): ProductVariant | undefined {
  const options = product.options ?? [];
  if (options.some((option) => !choices[option.name])) return undefined;
  return product.variants?.find((variant) => matches(variant, choices));
}

/** Whether picking `value` alongside the choices already made still leaves something in stock. */
export function isChoiceAvailable(
  product: Pick<Product, 'variants'>,
  choices: Record<string, string | undefined>,
  optionName: string,
  value: string,
): boolean {
  const wanted = { ...choices, [optionName]: value };
  return (product.variants ?? []).some(
    (variant) => variant.stock > 0 && matches(variant, wanted),
  );
}

/** The photo showing the chosen values (e.g. the red pair once Red is picked), else the cover. */
export function choiceImage(
  product: Pick<Product, 'imageUrl' | 'images' | 'options'>,
  choices: Record<string, string | undefined>,
): string {
  for (const option of product.options ?? []) {
    const index = option.values.find(
      (value) => value.label === choices[option.name],
    )?.imageIndex;
    const image = index === undefined ? undefined : product.images?.[index];
    if (image) return image;
  }
  return product.imageUrl;
}

/** What one unit costs: the variant's own price, else the sale price, else the price. */
export function unitPrice(
  product: Pick<Product, 'price' | 'salePrice'>,
  variant?: Pick<ProductVariant, 'price'>,
): number {
  return variant?.price ?? product.salePrice ?? product.price;
}

/** Cheapest and dearest unit price across the variants (or the product price when it has none). */
export function priceRange(
  product: Pick<Product, 'price' | 'salePrice' | 'variants'>,
): { min: number; max: number } {
  const prices = product.variants?.length
    ? product.variants.map((variant) => unitPrice(product, variant))
    : [unitPrice(product)];
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** A product as a seller submits it, after checking. */
export interface ProductInput {
  title: string;
  shortDescription: string;
  description: string;
  category: string;
  subCategory: string;
  tags: string[];
  price: number;
  salePrice?: number;
  images: string[];
  /** ImageKit file id of each photo, in the same order. Missing when photos are data URLs. */
  imageFileIds?: string[];
  specs: ProductSpec[];
  options: ProductOption[];
  variants: ProductVariant[];
  /** Total units: the sum of the variants' stock, or the stock entered when there are none. */
  stock: number;
  /** At least one, in `PAYMENT_OPTIONS` order. */
  paymentOptions: PaymentOption[];
}

type ParseResult = { product: ProductInput } | { error: string };

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;
const IMAGE_FILE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const IMAGE_SOURCE =
  /^(https:\/\/\S+|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+)$/;
const MAX_PRICE = 10_000_000;
const MAX_STOCK = 1_000_000;

const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';
const isStock = (value: unknown): value is number =>
  Number.isInteger(value) &&
  (value as number) >= 0 &&
  (value as number) <= MAX_STOCK;
const isPrice = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value > 0 &&
  value <= MAX_PRICE;
const roundMoney = (value: number) => Math.round(value * 100) / 100;
const hasDuplicates = (list: string[]) =>
  new Set(list.map((item) => item.toLowerCase())).size !== list.length;

/**
 * Checks an untrusted product submission. Returns it trimmed and normalised, or a
 * message for the seller saying what to fix. Options need one variant per combination.
 */
export function parseProductInput(value: unknown): ParseResult {
  const input = (value ?? {}) as Record<string, unknown>;

  const title = text(input.title);
  if (title.length < 3 || title.length > 120) {
    return { error: 'Product title must be 3 to 120 characters.' };
  }
  const shortDescription = text(input.shortDescription);
  if (!shortDescription || shortDescription.length > SHORT_DESCRIPTION_MAX) {
    return {
      error: `Short description must be 1 to ${SHORT_DESCRIPTION_MAX} characters.`,
    };
  }
  const description = text(input.description);
  const words = descriptionText(description);
  if (words.length < DESCRIPTION_MIN || words.length > DESCRIPTION_MAX) {
    return {
      error: `Description must be ${DESCRIPTION_MIN} to ${DESCRIPTION_MAX} characters.`,
    };
  }
  if (description.length > DESCRIPTION_HTML_MAX) {
    return {
      error:
        'The description has too much formatting. Remove some styling and try again.',
    };
  }

  const category = text(input.category);
  if (!PRODUCT_CATEGORIES.includes(category)) {
    return { error: 'Choose a category from the list.' };
  }
  const subCategory = text(input.subCategory);
  if (!getSubCategoryTemplate(category, subCategory)) {
    return { error: `Choose a ${category} sub-category from the list.` };
  }

  const rawTags = input.tags ?? [];
  if (!Array.isArray(rawTags)) return { error: 'Tags must be a list.' };
  const tags = rawTags
    .map(text)
    .filter(Boolean)
    .filter(
      (tag, index, list) =>
        list.findIndex((other) => other.toLowerCase() === tag.toLowerCase()) ===
        index,
    );
  if (tags.length > MAX_TAGS || tags.some((tag) => tag.length > 30)) {
    return { error: `Use up to ${MAX_TAGS} tags of 30 characters or fewer.` };
  }

  if (!isPrice(input.price)) {
    return { error: 'Price must be more than 0.' };
  }
  const price = roundMoney(input.price);
  let salePrice: number | undefined;
  if (input.salePrice !== undefined && input.salePrice !== null) {
    if (!isPrice(input.salePrice) || input.salePrice >= price) {
      return {
        error: 'Sale price must be more than 0 and lower than the price.',
      };
    }
    salePrice = roundMoney(input.salePrice);
  }

  const rawPayment = input.paymentOptions ?? DEFAULT_PAYMENT_OPTIONS;
  if (
    !Array.isArray(rawPayment) ||
    rawPayment.length === 0 ||
    rawPayment.some(
      (option) => !PAYMENT_OPTIONS.some((entry) => entry.id === option),
    )
  ) {
    return { error: 'Choose at least one way shoppers can pay.' };
  }
  const paymentOptions = PAYMENT_OPTIONS.map((entry) => entry.id).filter((id) =>
    rawPayment.includes(id),
  );

  const images = input.images;
  if (
    !Array.isArray(images) ||
    images.length === 0 ||
    images.length > MAX_PRODUCT_IMAGES
  ) {
    return { error: `Add 1 to ${MAX_PRODUCT_IMAGES} product photos.` };
  }
  if (
    images.some(
      (image) =>
        typeof image !== 'string' ||
        image.length > MAX_IMAGE_DATA_URL_LENGTH ||
        !IMAGE_SOURCE.test(image),
    )
  ) {
    return {
      error: 'Photos must be JPEG, PNG or WebP images under 500 KB each.',
    };
  }
  const rawFileIds = input.imageFileIds;
  let imageFileIds: string[] | undefined;
  if (rawFileIds !== undefined && rawFileIds !== null) {
    if (
      !Array.isArray(rawFileIds) ||
      rawFileIds.length !== images.length ||
      rawFileIds.some((id) => typeof id !== 'string' || !IMAGE_FILE_ID.test(id))
    ) {
      return {
        error:
          'Some photos didn’t upload properly. Remove them and add them again.',
      };
    }
    imageFileIds = rawFileIds as string[];
  }

  const rawSpecs = input.specs ?? [];
  if (!Array.isArray(rawSpecs) || rawSpecs.length > MAX_SPECS) {
    return { error: `Add up to ${MAX_SPECS} product details.` };
  }
  const specs: ProductSpec[] = [];
  for (const entry of rawSpecs) {
    const { name, value: specValue } = (entry ?? {}) as Record<string, unknown>;
    const spec = { name: text(name), value: text(specValue) };
    if (!spec.name || spec.name.length > 40) {
      return {
        error: 'Each product detail needs a name of up to 40 characters.',
      };
    }
    if (!spec.value || spec.value.length > 100) {
      return { error: `${spec.name}: enter a value of up to 100 characters.` };
    }
    specs.push(spec);
  }
  if (hasDuplicates(specs.map((spec) => spec.name))) {
    return { error: 'Each product detail can only be listed once.' };
  }

  const rawOptions = input.options ?? [];
  if (!Array.isArray(rawOptions) || rawOptions.length > MAX_OPTIONS) {
    return { error: `A product can have up to ${MAX_OPTIONS} options.` };
  }
  if (
    getSubCategoryTemplate(category, subCategory)?.service &&
    (rawOptions.length > 0 ||
      (Array.isArray(input.variants) && input.variants.length > 0))
  ) {
    return {
      error:
        'Services don’t have options. Describe your packages in the description instead.',
    };
  }
  const options: ProductOption[] = [];
  for (const entry of rawOptions) {
    const { name, values } = (entry ?? {}) as Record<string, unknown>;
    const optionName = text(name);
    if (!optionName || optionName.length > 30) {
      return { error: 'Each option needs a name of up to 30 characters.' };
    }
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      values.length > MAX_OPTION_VALUES
    ) {
      return {
        error: `${optionName}: choose 1 to ${MAX_OPTION_VALUES} values.`,
      };
    }
    const optionValues: ProductOptionValue[] = [];
    for (const raw of values) {
      const { label, swatch, imageIndex } = (raw ?? {}) as Record<
        string,
        unknown
      >;
      const optionValue: ProductOptionValue = { label: text(label) };
      if (!optionValue.label || optionValue.label.length > 30) {
        return {
          error: `${optionName}: each value needs a name of up to 30 characters.`,
        };
      }
      if (swatch !== undefined && swatch !== null) {
        if (typeof swatch !== 'string' || !HEX_COLOUR.test(swatch)) {
          return { error: `${optionName}: colours must look like #1a2b3c.` };
        }
        optionValue.swatch = swatch.toLowerCase();
      }
      if (imageIndex !== undefined && imageIndex !== null) {
        if (
          !Number.isInteger(imageIndex) ||
          (imageIndex as number) < 0 ||
          (imageIndex as number) >= images.length
        ) {
          return {
            error: `${optionName} ${optionValue.label}: pick one of the product photos.`,
          };
        }
        optionValue.imageIndex = imageIndex as number;
      }
      optionValues.push(optionValue);
    }
    if (hasDuplicates(optionValues.map((optionValue) => optionValue.label))) {
      return { error: `${optionName}: each value can only be listed once.` };
    }
    options.push({ name: optionName, values: optionValues });
  }
  if (hasDuplicates(options.map((option) => option.name))) {
    return { error: 'Each option can only be listed once.' };
  }

  const rawVariants = input.variants ?? [];
  if (!Array.isArray(rawVariants)) {
    return { error: 'Variants must be a list.' };
  }

  if (options.length === 0) {
    if (rawVariants.length > 0) {
      return {
        error: 'Variants need at least one option, like Colour or Size.',
      };
    }
    if (!isStock(input.stock)) {
      return { error: 'Stock must be a whole number, 0 or more.' };
    }
    return {
      product: {
        title,
        shortDescription,
        description,
        category,
        subCategory,
        tags,
        price,
        salePrice,
        images: images as string[],
        ...(imageFileIds && { imageFileIds }),
        specs,
        options,
        variants: [],
        stock: input.stock,
        paymentOptions,
      },
    };
  }

  const combinations = variantCombinations(options);
  if (combinations.length > MAX_VARIANTS) {
    return {
      error: `That makes ${combinations.length} combinations; the limit is ${MAX_VARIANTS}. Remove some values.`,
    };
  }
  if (rawVariants.length !== combinations.length) {
    return {
      error: 'Set stock for every combination of your options.',
    };
  }

  const byLabel = new Map<string, ProductVariant>();
  for (const entry of rawVariants) {
    const {
      choices,
      price: variantPrice,
      stock,
      sku,
    } = (entry ?? {}) as Record<string, unknown>;
    const picked = (choices ?? {}) as Record<string, unknown>;
    const variantChoices: Record<string, string> = {};
    for (const option of options) {
      const chosen = picked[option.name];
      if (
        typeof chosen !== 'string' ||
        !option.values.some((optionValue) => optionValue.label === chosen)
      ) {
        return { error: `A combination is missing a valid ${option.name}.` };
      }
      variantChoices[option.name] = chosen;
    }
    if (Object.keys(picked).length !== options.length) {
      return {
        error: 'A combination names an option the product doesn’t have.',
      };
    }
    const label = variantLabel(variantChoices, options);
    if (byLabel.has(label)) {
      return { error: `${label} is listed more than once.` };
    }
    if (!isStock(stock)) {
      return { error: `${label}: stock must be a whole number, 0 or more.` };
    }
    const variant: ProductVariant = { choices: variantChoices, stock };
    if (variantPrice !== undefined && variantPrice !== null) {
      if (!isPrice(variantPrice)) {
        return { error: `${label}: price must be more than 0.` };
      }
      variant.price = roundMoney(variantPrice);
    }
    const variantSku = text(sku);
    if (variantSku) {
      if (variantSku.length > 40) {
        return { error: `${label}: SKU must be 40 characters or fewer.` };
      }
      variant.sku = variantSku;
    }
    byLabel.set(label, variant);
  }

  const variants = [...byLabel.values()];
  const skus = variants.flatMap((variant) =>
    variant.sku ? [variant.sku] : [],
  );
  if (hasDuplicates(skus)) {
    return { error: 'Each SKU can only be used once.' };
  }

  return {
    product: {
      title,
      shortDescription,
      description,
      category,
      subCategory,
      tags,
      price,
      salePrice,
      images: images as string[],
      ...(imageFileIds && { imageFileIds }),
      specs,
      options,
      variants,
      stock: variants.reduce((sum, variant) => sum + variant.stock, 0),
      paymentOptions,
    },
  };
}
