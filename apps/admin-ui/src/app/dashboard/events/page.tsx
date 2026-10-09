'use client';

import { CalendarRange } from 'lucide-react';
import { ProductsList } from '../../shared/dashboard/products-list';

export default function EventsPage() {
  return (
    <ProductsList
      kind="offers"
      title="All Events"
      description="Products on sale right now, as shoppers see them in Offers. Dated sales events will join this list once sellers can schedule them."
      emptyIcon={CalendarRange}
      emptyText="Offers will appear here when sellers put a product on sale."
    />
  );
}
