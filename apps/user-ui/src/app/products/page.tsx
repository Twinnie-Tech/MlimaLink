'use client';

import { Suspense } from 'react';
import { ProductBrowser } from '../shared/widgets/product-browser';

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductBrowser />
    </Suspense>
  );
}
