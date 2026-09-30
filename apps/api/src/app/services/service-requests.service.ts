import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { appError, notFound, validationError } from '@org/errors';
import type {
  ServiceRequest,
  ServiceRequestInput,
  ServiceRequestStatus,
} from '@org/models';
import { formatPrice, listingTerms } from '@org/models/catalog';
import {
  canMoveServiceRequest,
  serviceRequestStatusLabel,
} from '@org/models/services';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';
import { isObjectId } from '../products/product-mapper';
import type { SellerShop } from '../seller.guard';
import type { SignedInUser } from '../user.guard';

type RequestRecord = Prisma.service_requestsGetPayload<object>;

const MAX_LISTED = 200;

const sellerInboxUrl = () =>
  `${(process.env.SELLER_UI_URL ?? 'http://localhost:4300').replace(/\/+$/, '')}/dashboard/service-requests`;
const shopperDashboardUrl = () =>
  `${(process.env.USER_UI_URL ?? 'http://localhost:4200').replace(/\/+$/, '')}/dashboard`;

export function toServiceRequest(
  record: RequestRecord,
  shopName: string,
): ServiceRequest {
  return {
    id: record.id,
    productId: record.productId,
    serviceTitle: record.serviceTitle,
    shopId: record.shopId,
    shopName,
    clientName: record.clientName,
    clientEmail: record.clientEmail,
    ...(record.clientPhone != null && { clientPhone: record.clientPhone }),
    details: record.details,
    ...(record.budget != null && { budget: record.budget }),
    ...(record.neededBy != null && { neededBy: record.neededBy }),
    status: record.status as ServiceRequestStatus,
    ...(record.sellerNote != null && { sellerNote: record.sellerNote }),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

@Injectable()
export class ServiceRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async create(
    user: SignedInUser,
    input: ServiceRequestInput,
  ): Promise<ServiceRequest> {
    const product = isObjectId(input.productId)
      ? await this.prisma.products.findUnique({
          where: { id: input.productId },
          include: {
            shop: {
              select: { name: true, seller: { select: { email: true } } },
            },
          },
        })
      : null;
    if (!product) throw notFound('Service', { productId: input.productId });
    if (!listingTerms(product).service) {
      throw validationError(
        'Only services can be requested. Add products to your cart instead.',
      );
    }
    const shopName = product.shop.name;
    if (product.stock <= 0) {
      throw validationError(
        `${shopName} isn’t taking new requests for this service right now.`,
      );
    }

    const waiting = await this.prisma.service_requests.findFirst({
      where: {
        userId: user.id,
        productId: product.id,
        status: { in: ['pending', 'accepted'] },
      },
      select: { id: true },
    });
    if (waiting) {
      throw appError(
        `You already have an open request for this service. ${shopName} will get back to you.`,
        409,
        { requestId: waiting.id },
        'SERVICE_REQUEST_OPEN',
      );
    }

    const record = await this.prisma.service_requests.create({
      data: {
        productId: product.id,
        serviceTitle: product.title,
        shopId: product.shopId,
        userId: user.id,
        clientName: user.name,
        clientEmail: user.email,
        clientPhone: input.phone,
        details: input.details,
        budget: input.budget,
        neededBy: input.neededBy,
      },
    });

    await this.mail.send({
      to: product.shop.seller.email,
      subject: `New request: ${product.title}`,
      paragraphs: [
        `${user.name} would like to hire you for “${product.title}”.`,
        input.details,
        [
          input.budget !== undefined && `Budget: ${formatPrice(input.budget)}`,
          input.neededBy && `Needed by: ${input.neededBy}`,
          `Email: ${user.email}`,
          input.phone && `Phone: ${input.phone}`,
        ]
          .filter(Boolean)
          .join('\n'),
      ],
      link: { label: 'Reply in your dashboard', url: sellerInboxUrl() },
    });

    return toServiceRequest(record, shopName);
  }

  async listForUser(userId: string): Promise<ServiceRequest[]> {
    const records = await this.prisma.service_requests.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_LISTED,
    });
    const shopIds = [...new Set(records.map((record) => record.shopId))];
    const shops = shopIds.length
      ? await this.prisma.shops.findMany({
          where: { id: { in: shopIds } },
          select: { id: true, name: true },
        })
      : [];
    const names = new Map(shops.map((shop) => [shop.id, shop.name]));
    return records.map((record) =>
      toServiceRequest(record, names.get(record.shopId) ?? 'A provider'),
    );
  }

  async listForShop(shop: SellerShop): Promise<ServiceRequest[]> {
    const records = await this.prisma.service_requests.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: 'desc' },
      take: MAX_LISTED,
    });
    return records.map((record) => toServiceRequest(record, shop.name));
  }

  /** Moves a request on (accept, decline or complete) and lets the shopper know. */
  async update(
    shop: SellerShop,
    id: string,
    status: ServiceRequestStatus,
    note?: string,
  ): Promise<ServiceRequest> {
    const current = isObjectId(id)
      ? await this.prisma.service_requests.findFirst({
          where: { id, shopId: shop.id },
        })
      : null;
    if (!current) throw notFound('Service request', { id });

    const from = current.status as ServiceRequestStatus;
    if (!canMoveServiceRequest(from, status)) {
      throw validationError(
        `This request is ${serviceRequestStatusLabel(from).toLowerCase()}, so it can’t be marked ${serviceRequestStatusLabel(status).toLowerCase()}.`,
      );
    }

    // Only move it if nobody else has in the meantime.
    const { count } = await this.prisma.service_requests.updateMany({
      where: { id, shopId: shop.id, status: from },
      data: { status, ...(note !== undefined && { sellerNote: note }) },
    });
    const record =
      count > 0
        ? await this.prisma.service_requests.findUnique({ where: { id } })
        : null;
    if (!record) {
      throw appError(
        'This request changed while you were looking at it. Refresh and try again.',
        409,
        { id },
        'SERVICE_REQUEST_CHANGED',
      );
    }

    const outcome = {
      accepted: `${shop.name} accepted your request`,
      declined: `${shop.name} can’t take on your request`,
      completed: `${shop.name} marked your request as completed`,
      pending: `${shop.name} updated your request`,
    }[status];
    await this.mail.send({
      to: record.clientEmail,
      subject: `${outcome}: ${record.serviceTitle}`,
      paragraphs: [
        `Hi ${record.clientName}, ${outcome} for “${record.serviceTitle}”.`,
        ...(note ? [`Their message: ${note}`] : []),
        ...(status === 'accepted'
          ? ['They’ll contact you to agree the details.']
          : []),
      ],
      link: { label: 'View your requests', url: shopperDashboardUrl() },
    });

    return toServiceRequest(record, shop.name);
  }
}
