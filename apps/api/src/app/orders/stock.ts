import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma.service';

export type StockChange = {
  /** Which variant; left out for products without options. */
  choices?: Record<string, string>;
  /** Negative to take units, positive to put them back. */
  delta: number;
};

/** Another checkout may write the product between our read and write; retry this many times. */
const MAX_TRIES = 3;

const sameChoices = (
  stored: Prisma.JsonValue,
  wanted: Record<string, string> = {},
) => {
  const choices = (stored ?? {}) as Record<string, string>;
  const names = Object.keys(choices);
  return (
    names.length === Object.keys(wanted).length &&
    names.every((name) => choices[name] === wanted[name])
  );
};

/**
 * Moves a product's stock (and its variants') by the given amounts. The write only
 * lands if the product hasn't changed since it was read. Returns false when the
 * product or a variant is gone, or when `keepInStock` is set and a count would go
 * below zero.
 */
export async function adjustStock(
  prisma: PrismaService,
  productId: string,
  changes: StockChange[],
  keepInStock: boolean,
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const product = await prisma.products.findUnique({
      where: { id: productId },
      select: { stock: true, options: true, variants: true, updatedAt: true },
    });
    if (!product) return false;

    const hasOptions = product.options.length > 0;
    const variants = product.variants.map((variant) => ({ ...variant }));
    let stock = product.stock;
    for (const change of changes) {
      if (hasOptions) {
        const variant = variants.find((entry) =>
          sameChoices(entry.choices, change.choices),
        );
        if (!variant) return false;
        variant.stock += change.delta;
        if (keepInStock && variant.stock < 0) return false;
      }
      stock += change.delta;
    }
    if (keepInStock && stock < 0) return false;

    const { count } = await prisma.products.updateMany({
      where: { id: productId, updatedAt: product.updatedAt },
      data: {
        stock: Math.max(stock, 0),
        ...(hasOptions && {
          variants: {
            set: variants.map((variant) => ({
              sku: variant.sku,
              choices: variant.choices as Prisma.InputJsonValue,
              price: variant.price,
              stock: Math.max(variant.stock, 0),
            })),
          },
        }),
      },
    });
    if (count > 0) return true;
  }
  return false;
}
