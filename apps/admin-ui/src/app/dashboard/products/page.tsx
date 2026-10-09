'use client';

import { ProductsList } from '../../shared/dashboard/products-list';

export default function ProductsPage() {
  return (
    <ProductsList
      kind="all"
      title="All Products"
      description="Every listing on MlimaLink, newest first. Use the eye icon to open a product in the store."
      emptyText="Products will appear here once sellers list them."
    />
  );
}
