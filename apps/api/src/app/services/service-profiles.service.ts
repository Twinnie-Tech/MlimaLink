import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { notFound } from '@org/errors';
import type {
  OwnServiceProfile,
  Provider,
  ServiceProfile,
  ServiceProfileInput,
} from '@org/models';
import { SERVICES_CATEGORY } from '@org/models/catalog';
import { PrismaService } from '../prisma.service';
import { ProductImagesService } from '../product-images/product-images.service';
import {
  isObjectId,
  productWithShop,
  toProduct,
} from '../products/product-mapper';
import type { SellerShop } from '../seller.guard';

type ProfileRecord = Prisma.service_profilesGetPayload<object>;

const MAX_PROVIDER_SERVICES = 50;

export function toServiceProfile(
  record: ProfileRecord,
  shopName: string,
): ServiceProfile {
  return {
    headline: record.headline,
    about: record.about,
    skills: record.skills,
    yearsExperience: record.yearsExperience,
    qualifications: record.qualifications.map((qualification) => ({
      title: qualification.title,
      ...(qualification.issuer != null && { issuer: qualification.issuer }),
      ...(qualification.year != null && { year: qualification.year }),
    })),
    serviceArea: record.serviceArea,
    remote: record.remote,
    portfolio: record.portfolio,
    shopId: record.shopId,
    shopName,
    updatedAt: record.updatedAt.toISOString(),
  };
}

@Injectable()
export class ServiceProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ProductImagesService,
  ) {}

  async getOwn(shop: SellerShop): Promise<OwnServiceProfile | null> {
    const record = await this.prisma.service_profiles.findUnique({
      where: { shopId: shop.id },
    });
    return record
      ? {
          ...toServiceProfile(record, shop.name),
          portfolioFileIds: record.portfolioFileIds,
        }
      : null;
  }

  async save(
    shop: SellerShop,
    input: ServiceProfileInput,
  ): Promise<OwnServiceProfile> {
    const existing = await this.prisma.service_profiles.findUnique({
      where: { shopId: shop.id },
      select: { portfolio: true, portfolioFileIds: true },
    });
    const saved = new Set(
      existing?.portfolioFileIds.map(
        (fileId, index) => `${fileId} ${existing.portfolio[index]}`,
      ),
    );
    const added = input.portfolioFileIds
      .map((fileId, index) => ({ fileId, url: input.portfolio[index] }))
      .filter(({ fileId, url }) => !saved.has(`${fileId} ${url}`));
    if (added.length > 0) {
      await this.images.verifyShopPhotos(
        shop.id,
        added.map(({ url }) => url),
        added.map(({ fileId }) => fileId),
      );
    }

    const record = await this.prisma.service_profiles.upsert({
      where: { shopId: shop.id },
      create: { ...input, shopId: shop.id },
      update: input,
    });

    const removed = (existing?.portfolioFileIds ?? []).filter(
      (fileId) => !input.portfolioFileIds.includes(fileId),
    );
    if (removed.length > 0) {
      // Never delete a file that one of the shop's listings also shows.
      const listings = await this.prisma.products.findMany({
        where: { shopId: shop.id, imageFileIds: { hasSome: removed } },
        select: { imageFileIds: true },
      });
      const inUse = new Set(listings.flatMap((item) => item.imageFileIds));
      const unused = removed.filter((fileId) => !inUse.has(fileId));
      if (unused.length > 0) {
        await this.images.removeProductPhotos(shop.id, [], unused);
      }
    }

    return {
      ...toServiceProfile(record, shop.name),
      portfolioFileIds: record.portfolioFileIds,
    };
  }

  /** A provider's public profile and service listings, or a 404 when they haven't set up a profile. */
  async getProvider(shopId: string): Promise<Provider> {
    const record = isObjectId(shopId)
      ? await this.prisma.service_profiles.findUnique({
          where: { shopId },
          include: { shop: { select: { name: true } } },
        })
      : null;
    if (!record) throw notFound('Provider', { shopId });

    const services = await this.prisma.products.findMany({
      where: { shopId, category: SERVICES_CATEGORY },
      include: productWithShop,
      orderBy: { createdAt: 'desc' },
      take: MAX_PROVIDER_SERVICES,
    });

    return {
      profile: toServiceProfile(record, record.shop.name),
      services: services.map(toProduct),
    };
  }
}
