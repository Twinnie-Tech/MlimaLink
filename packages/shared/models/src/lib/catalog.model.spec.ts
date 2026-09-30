import {
  CATEGORY_TEMPLATES,
  MAX_VARIANTS,
  choiceImage,
  countWords,
  descriptionText,
  dueNowShare,
  isRichText,
  findVariant,
  paymentLabel,
  paymentOptionsOf,
  formatPrice,
  getSubCategoryTemplate,
  isChoiceAvailable,
  listingTerms,
  parseProductInput,
  priceRange,
  unitPrice,
  variantCombinations,
} from './catalog.model.js';
import type { ProductOption } from './product.model.js';

const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

const colourAndSize: ProductOption[] = [
  {
    name: 'Colour',
    values: [
      { label: 'Black', swatch: '#111111' },
      { label: 'Brown', swatch: '#92400E' },
    ],
  },
  { name: 'Size', values: [{ label: '41' }, { label: '42' }] },
];

function shoe(overrides: Record<string, unknown> = {}) {
  return {
    title: '  Leather loafers ',
    shortDescription: 'Hand-stitched loafers',
    description: 'Soft full-grain leather loafers made in Nairobi.',
    category: 'Fashion',
    subCategory: 'Shoes',
    tags: ['leather', 'Leather', ' formal '],
    price: 45.5,
    images: [photo, 'https://cdn.example.com/brown.jpg'],
    specs: [{ name: 'Brand', value: ' Mlima ' }],
    options: colourAndSize,
    variants: [
      { choices: { Colour: 'Black', Size: '41' }, stock: 3 },
      { choices: { Colour: 'Black', Size: '42' }, stock: 0, sku: 'BLK-42' },
      { choices: { Colour: 'Brown', Size: '41' }, stock: 2, price: 50 },
      { choices: { Colour: 'Brown', Size: '42' }, stock: 5 },
    ],
    ...overrides,
  };
}

const errorOf = (input: unknown) => {
  const result = parseProductInput(input);
  return 'error' in result ? result.error : null;
};

describe('category templates', () => {
  it('gives every category at least one sub-category with unique names', () => {
    for (const category of CATEGORY_TEMPLATES) {
      const names = category.subCategories.map((sub) => sub.name);
      expect(names.length).toBeGreaterThan(0);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('keeps each template within the option and variant limits', () => {
    for (const category of CATEGORY_TEMPLATES) {
      for (const sub of category.subCategories) {
        expect(sub.options.length).toBeLessThanOrEqual(3);
        for (const option of sub.options) {
          const values = option.values.map((value) => value.label);
          expect(new Set(values).size).toBe(values.length);
        }
      }
    }
  });

  it('offers colour swatches and EU sizes for shoes', () => {
    const shoes = getSubCategoryTemplate('Fashion', 'Shoes');
    expect(shoes?.options.map((option) => [option.name, option.kind])).toEqual([
      ['Colour', 'colour'],
      ['Size', 'size'],
    ]);
    expect(shoes?.options[1].values.at(0)?.label).toBe('35');
    expect(shoes?.options[1].values.at(-1)?.label).toBe('47');
    expect(shoes?.specs.map((spec) => spec.name)).toContain('Brand');
  });

  it('offers unit types for houses and plot sizes for land', () => {
    const rent = getSubCategoryTemplate('Property', 'Houses for rent');
    expect(rent?.options[0].values.map((value) => value.label)).toEqual([
      'Bedsitter',
      'Studio',
      '1 bedroom',
      '2 bedrooms',
      '3 bedrooms',
      '4 bedrooms',
      '5+ bedrooms',
    ]);
    expect(
      rent?.specs.find((spec) => spec.name === 'House type')?.suggestions,
    ).toEqual(
      expect.arrayContaining(['Apartment', 'Bungalow', 'Maisonette', 'Villa']),
    );
    expect(
      getSubCategoryTemplate('Property', 'Land for sale')?.options[0].name,
    ).toBe('Plot size');
  });
});

describe('rich text descriptions', () => {
  const html =
    '<h2>Why you&#39;ll love it</h2><p><span style="font-family: Georgia">Soft&nbsp;leather</span>, made in <strong>Nairobi</strong>.</p><ul><li><p>Hand-stitched</p></li></ul>';

  it('reads the words without the formatting', () => {
    expect(descriptionText(html)).toBe(
      "Why you'll love it Soft leather, made in Nairobi. Hand-stitched",
    );
    expect(countWords(html)).toBe(10);
    expect(countWords('  plain   text  ')).toBe(2);
    expect(countWords('<p></p>')).toBe(0);
    expect(isRichText(html)).toBe(true);
    expect(isRichText('Fits sizes <3 years')).toBe(false);
  });

  it('measures the description by its words, not its markup', () => {
    expect(
      errorOf(shoe({ description: '<p><strong>Too short</strong></p>' })),
    ).toBe('Description must be 20 to 5000 characters.');
    const styled = parseProductInput(shoe({ description: html }));
    expect('product' in styled && styled.product.description).toBe(html);
    expect(
      errorOf(
        shoe({
          description: `<p>${'<span style="color: #111111; background-color: #fef08a; font-family: Georgia, serif; font-size: 18px">Hi</span>'.repeat(500)}</p>`,
        }),
      ),
    ).toMatch(/too much formatting/);
  });
});

describe('payment options', () => {
  it('defaults to full payment upfront and keeps a standard order', () => {
    const plain = parseProductInput(shoe());
    expect('product' in plain && plain.product.paymentOptions).toEqual([
      'full_upfront',
    ]);

    const chosen = parseProductInput(
      shoe({ paymentOptions: ['cash_on_delivery', 'deposit'] }),
    );
    expect('product' in chosen && chosen.product.paymentOptions).toEqual([
      'deposit',
      'cash_on_delivery',
    ]);

    expect(errorOf(shoe({ paymentOptions: [] }))).toBe(
      'Choose at least one way shoppers can pay.',
    );
    expect(errorOf(shoe({ paymentOptions: ['barter'] }))).toBe(
      'Choose at least one way shoppers can pay.',
    );
  });

  it('knows how much is paid when ordering', () => {
    expect(dueNowShare('full_upfront')).toBe(1);
    expect(dueNowShare('deposit')).toBe(0.5);
    expect(dueNowShare('cash_on_delivery')).toBe(0);
    expect(paymentOptionsOf({})).toEqual(['full_upfront']);
    expect(paymentLabel('deposit')).toBe('50% deposit');
  });
});

describe('listingTerms', () => {
  it('has shoppers contact the seller for houses, land and cars, with a price period', () => {
    expect(
      listingTerms({ category: 'Property', subCategory: 'Houses for rent' }),
    ).toEqual({ pricePeriod: 'month', contactSeller: true });
    expect(
      listingTerms({ category: 'Vehicles', subCategory: 'Cars for hire' }),
    ).toEqual({ pricePeriod: 'day', contactSeller: true });
    expect(
      listingTerms({ category: 'Vehicles', subCategory: 'Cars for sale' }),
    ).toEqual({ contactSeller: true });
    expect(
      listingTerms({ category: 'Property', subCategory: 'Land for lease' }),
    ).toEqual({ pricePeriod: 'year', contactSeller: true });
  });

  it('keeps the cart for everything else', () => {
    expect(
      listingTerms({
        category: 'Vehicles',
        subCategory: 'Spare parts & accessories',
      }),
    ).toEqual({ contactSeller: false });
    expect(listingTerms({ category: 'Fashion', subCategory: 'Shoes' })).toEqual(
      { contactSeller: false },
    );
    expect(listingTerms({ category: 'Electronics' })).toEqual({
      contactSeller: false,
    });
  });

  it('formats prices with thousands separators', () => {
    expect(formatPrice(99.99)).toBe('$99.99');
    expect(formatPrice(12500000)).toBe('$12,500,000.00');
  });
});

describe('variantCombinations', () => {
  it('lists every combination in option order', () => {
    expect(variantCombinations(colourAndSize)).toEqual([
      { Colour: 'Black', Size: '41' },
      { Colour: 'Black', Size: '42' },
      { Colour: 'Brown', Size: '41' },
      { Colour: 'Brown', Size: '42' },
    ]);
  });

  it('is empty without options', () => {
    expect(variantCombinations([])).toEqual([]);
  });
});

describe('choosing a variant', () => {
  const result = parseProductInput(shoe());
  if (!('product' in result)) throw new Error(result.error);
  const product = result.product;

  it('finds the variant only once every option is chosen', () => {
    expect(findVariant(product, { Colour: 'Brown' })).toBeUndefined();
    expect(findVariant(product, { Colour: 'Brown', Size: '41' })).toMatchObject(
      { stock: 2, price: 50 },
    );
  });

  it('marks values that would lead to a sold-out combination', () => {
    expect(isChoiceAvailable(product, { Colour: 'Black' }, 'Size', '42')).toBe(
      false,
    );
    expect(isChoiceAvailable(product, { Colour: 'Brown' }, 'Size', '42')).toBe(
      true,
    );
    expect(isChoiceAvailable(product, {}, 'Colour', 'Black')).toBe(true);
  });

  it('prices variants from their own price, then the sale price, then the price', () => {
    expect(unitPrice({ price: 10 })).toBe(10);
    expect(unitPrice({ price: 10, salePrice: 8 })).toBe(8);
    expect(unitPrice({ price: 10, salePrice: 8 }, { price: 12 })).toBe(12);
    expect(priceRange(product)).toEqual({ min: 45.5, max: 50 });
  });

  it("shows the chosen colour's photo, else the cover", () => {
    const withPhotos = {
      imageUrl: 'cover.jpg',
      images: ['cover.jpg', 'brown.jpg'],
      options: [
        {
          name: 'Colour',
          values: [{ label: 'Black' }, { label: 'Brown', imageIndex: 1 }],
        },
      ],
    };
    expect(choiceImage(withPhotos, { Colour: 'Brown' })).toBe('brown.jpg');
    expect(choiceImage(withPhotos, { Colour: 'Black' })).toBe('cover.jpg');
    expect(choiceImage(withPhotos, {})).toBe('cover.jpg');
  });
});

describe('parseProductInput', () => {
  it('accepts a product with options and tidies it up', () => {
    const result = parseProductInput(shoe());
    if (!('product' in result)) throw new Error(result.error);

    expect(result.product).toMatchObject({
      title: 'Leather loafers',
      tags: ['leather', 'formal'],
      specs: [{ name: 'Brand', value: 'Mlima' }],
      stock: 10,
    });
    expect(result.product.options[0].values[1].swatch).toBe('#92400e');
    expect(result.product.variants[1].sku).toBe('BLK-42');
  });

  it('uses the entered stock for a product without options', () => {
    const result = parseProductInput(
      shoe({ options: [], variants: [], stock: 7 }),
    );
    expect('product' in result && result.product.stock).toBe(7);
    expect(errorOf(shoe({ options: [], variants: [] }))).toBe(
      'Stock must be a whole number, 0 or more.',
    );
  });

  it('needs a sub-category that belongs to the category', () => {
    expect(errorOf(shoe({ subCategory: 'Maize' }))).toBe(
      'Choose a Fashion sub-category from the list.',
    );
    expect(errorOf(shoe({ category: 'Toys' }))).toBe(
      'Choose a category from the list.',
    );
  });

  it('needs stock for every combination, once each', () => {
    const variants = shoe().variants;
    expect(errorOf(shoe({ variants: variants.slice(1) }))).toBe(
      'Set stock for every combination of your options.',
    );
    expect(
      errorOf(shoe({ variants: [...variants.slice(1), variants[1]] })),
    ).toBe('Black / 42 is listed more than once.');
    expect(
      errorOf(
        shoe({
          variants: [
            { choices: { Colour: 'Red', Size: '41' }, stock: 1 },
            ...variants.slice(1),
          ],
        }),
      ),
    ).toBe('A combination is missing a valid Colour.');
  });

  it('rejects bad stock, prices, swatches and duplicates', () => {
    const variants = shoe().variants;
    expect(
      errorOf(
        shoe({
          variants: [{ ...variants[0], stock: 1.5 }, ...variants.slice(1)],
        }),
      ),
    ).toBe('Black / 41: stock must be a whole number, 0 or more.');
    expect(errorOf(shoe({ salePrice: 60 }))).toBe(
      'Sale price must be more than 0 and lower than the price.',
    );
    expect(
      errorOf(
        shoe({
          options: [
            { name: 'Colour', values: [{ label: 'Black', swatch: 'black' }] },
          ],
        }),
      ),
    ).toBe('Colour: colours must look like #1a2b3c.');
    expect(
      errorOf(
        shoe({
          options: [
            { name: 'Size', values: [{ label: '41' }, { label: '41' }] },
          ],
        }),
      ),
    ).toBe('Size: each value can only be listed once.');
    expect(
      errorOf(
        shoe({
          specs: [
            { name: 'Brand', value: 'A' },
            { name: 'brand', value: 'B' },
          ],
        }),
      ),
    ).toBe('Each product detail can only be listed once.');
  });

  it('only accepts image photos of a sensible size', () => {
    expect(errorOf(shoe({ images: [] }))).toBe('Add 1 to 6 product photos.');
    expect(errorOf(shoe({ images: ['javascript:alert(1)'] }))).toBe(
      'Photos must be JPEG, PNG or WebP images under 500 KB each.',
    );
    expect(
      errorOf(
        shoe({
          images: [`data:image/jpeg;base64,${'A'.repeat(800_000)}`],
        }),
      ),
    ).toBe('Photos must be JPEG, PNG or WebP images under 500 KB each.');
  });

  it('points colour photos at an existing image', () => {
    expect(
      errorOf(
        shoe({
          options: [
            { name: 'Colour', values: [{ label: 'Black', imageIndex: 5 }] },
          ],
          variants: [{ choices: { Colour: 'Black' }, stock: 1 }],
        }),
      ),
    ).toBe('Colour Black: pick one of the product photos.');
  });

  it(`caps a product at ${MAX_VARIANTS} combinations`, () => {
    const many = (name: string, count: number) => ({
      name,
      values: Array.from({ length: count }, (_, i) => ({ label: `${i}` })),
    });
    expect(
      errorOf(shoe({ options: [many('A', 11), many('B', 10)], variants: [] })),
    ).toBe(
      'That makes 110 combinations; the limit is 100. Remove some values.',
    );
  });
});
