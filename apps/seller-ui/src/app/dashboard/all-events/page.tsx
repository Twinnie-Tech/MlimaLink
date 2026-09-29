'use client';

import Link from 'next/link';
import { CalendarPlus, CalendarRange } from 'lucide-react';
import { EmptyState, PageHeader, Panel, primaryButtonClassName } from '../../shared/dashboard/ui';

export default function AllEventsPage() {
  return (
    <>
      <PageHeader
        title="All Events"
        description="Your upcoming, running and finished sales events."
        actions={
          <Link href="/dashboard/create-event" className={primaryButtonClassName}>
            <CalendarPlus size={16} /> Create event
          </Link>
        }
      />

      <Panel>
        <EmptyState
          icon={CalendarRange}
          title="No events yet"
          description="Events let you run a limited-time discount on a product. They'll be listed here with their dates and results."
          action={{ label: 'Create an event', href: '/dashboard/create-event' }}
        />
      </Panel>
    </>
  );
}
