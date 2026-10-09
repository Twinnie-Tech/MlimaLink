'use client';

import { useCallback, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Eye, Package, Star, type LucideIcon } from 'lucide-react';
import type { AdminProduct } from '@org/models';
import {
  ADMIN_KEYS,
  listProducts,
  productUrl,
  shopUrl,
  type ListParams,
} from '../utils/admin-api';
import { downloadCsv } from '../utils/csv';
import { ProductThumb } from './avatar';
import { Pagination, SearchBox, Toolbar } from './list-controls';
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeader,
  Panel,
  cellClassName,
  formatDate,
  formatMoney,
  secondaryButtonClassName,
} from './ui';

type Kind = 'all' | 'offers';

const linkClassName =
  'font-medium text-blue-600 hover:underline dark:text-blue-400';

function Price({ product }: { product: AdminProduct }) {
  if (product.salePrice == null) return <>{formatMoney(product.price)}</>;
  return (
    <span className="flex flex-col">
      <span className="font-medium text-neutral-900">
        {formatMoney(product.salePrice)}
      </span>
      <span className="text-xs text-neutral-500 line-through">
        {formatMoney(product.price)}
      </span>
    </span>
  );
}

function Stock({ stock }: { stock: number }) {
  return stock > 0 ? (
    <>{stock} left</>
  ) : (
    <Badge tone="bg-rose-500/10 text-rose-700">Out of stock</Badge>
  );
}

function Rating({ product }: { product: AdminProduct }) {
  if (product.reviewCount === 0) {
    return <span className="text-neutral-500">No reviews</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Star
        size={14}
        className="fill-amber-400 text-amber-400"
        aria-hidden="true"
      />
      <span>{product.rating.toFixed(1)}</span>
      <span className="text-xs text-neutral-500">({product.reviewCount})</span>
    </span>
  );
}

function exportRows(products: AdminProduct[]) {
  const header = [
    'Title',
    'Price',
    'Sale price',
    'Discount %',
    'Stock',
    'Category',
    'Sub-category',
    'Rating',
    'Reviews',
    'Shop',
    'Listed',
    'Link',
  ];
  return [
    header,
    ...products.map((p) => [
      p.title,
      p.price,
      p.salePrice,
      p.discountPercent,
      p.stock,
      p.category,
      p.subCategory,
      p.rating,
      p.reviewCount,
      p.shopName,
      p.createdAt.slice(0, 10),
      productUrl(p.id),
    ]),
  ];
}

/** A searchable, paged table of listings with links to them in the store. */
export function ProductsList({
  kind,
  title,
  description,
  emptyIcon = Package,
  emptyText,
}: {
  kind: Kind;
  title: string;
  description: string;
  emptyIcon?: LucideIcon;
  emptyText: string;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const params: ListParams = {
    search,
    page,
    ...(kind === 'offers' && { onSale: true }),
  };
  const { data, isPending, error } = useQuery({
    queryKey: ADMIN_KEYS.products(params),
    queryFn: () => listProducts(params),
    placeholderData: keepPreviousData,
  });

  const onSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const noun = kind === 'offers' ? 'offer' : 'product';
  const columns =
    kind === 'offers'
      ? ['Photo', 'Title', 'Price', 'Discount', 'Stock', 'Shop', 'Listed', '']
      : [
          'Photo',
          'Title',
          'Price',
          'Stock',
          'Category',
          'Rating',
          'Shop',
          'Listed',
          '',
        ];

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <button
            type="button"
            disabled={!data?.items.length}
            onClick={() =>
              data &&
              downloadCsv(
                `${kind === 'offers' ? 'events' : 'products'}-${new Date().toISOString().slice(0, 10)}.csv`,
                exportRows(data.items),
              )
            }
            className={secondaryButtonClassName}
          >
            <Download size={16} aria-hidden="true" />
            Export CSV
          </button>
        }
      />
      <Panel>
        <Toolbar>
          <SearchBox
            label={`Search ${noun}s`}
            placeholder="Search by title, category or shop"
            onSearch={onSearch}
          />
        </Toolbar>

        {isPending ? (
          <Loading label={`Loading ${noun}s`} />
        ) : error ? (
          <ErrorNotice message={error.message} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={emptyIcon}
            title={`No ${noun}s found`}
            description={search ? `No ${noun} matches that search.` : emptyText}
          />
        ) : (
          <>
            <DataTable
              label={title}
              columns={columns}
              minWidth={kind === 'offers' ? 820 : 960}
            >
              {data.items.map((product) => (
                <tr key={product.id}>
                  <td className={cellClassName}>
                    <ProductThumb src={product.imageUrl} />
                  </td>
                  <td className={`${cellClassName} max-w-[16rem]`}>
                    <a
                      href={productUrl(product.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${linkClassName} line-clamp-2`}
                    >
                      {product.title}
                    </a>
                    {kind === 'offers' && (
                      <span className="text-xs text-neutral-500">
                        {product.category}
                      </span>
                    )}
                  </td>
                  <td className={cellClassName}>
                    <Price product={product} />
                  </td>
                  {kind === 'offers' && (
                    <td className={cellClassName}>
                      {product.discountPercent > 0 ? (
                        <Badge tone="bg-emerald-500/10 text-emerald-700">
                          {product.discountPercent}% off
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                  <td className={cellClassName}>
                    <Stock stock={product.stock} />
                  </td>
                  {kind === 'all' && (
                    <>
                      <td className={cellClassName}>
                        <span className="block">{product.category}</span>
                        <span className="text-xs text-neutral-500">
                          {product.subCategory}
                        </span>
                      </td>
                      <td className={cellClassName}>
                        <Rating product={product} />
                      </td>
                    </>
                  )}
                  <td className={cellClassName}>
                    <a
                      href={shopUrl(product.shopId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-600 hover:underline dark:text-violet-400"
                    >
                      {product.shopName}
                    </a>
                  </td>
                  <td className={cellClassName}>
                    {formatDate(product.createdAt)}
                  </td>
                  <td className={`${cellClassName} text-right`}>
                    <a
                      href={productUrl(product.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View ${product.title} in the store`}
                      title="View in the store"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-blue-600 transition hover:bg-blue-500/10 dark:text-blue-400"
                    >
                      <Eye size={18} aria-hidden="true" />
                    </a>
                  </td>
                </tr>
              ))}
            </DataTable>
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              noun={noun}
              onPage={setPage}
            />
          </>
        )}
      </Panel>
    </>
  );
}
