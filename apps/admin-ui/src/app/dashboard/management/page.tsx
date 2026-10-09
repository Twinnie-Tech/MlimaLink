'use client';

import { useCallback, useState } from 'react';
import { PLATFORM_FEE_PERCENT } from '@org/models/checkout';
import { DELIVERY_ZONES } from '@org/models/delivery';
import { AdminsList } from '../../shared/dashboard/admins-list';
import { SearchBox, Toolbar } from '../../shared/dashboard/list-controls';
import { PageHeader, Panel } from '../../shared/dashboard/ui';

const SETTINGS: { label: string; value: string; detail: string }[] = [
  {
    label: 'MlimaLink fee',
    value: `${PLATFORM_FEE_PERCENT}%`,
    detail: 'Of the goods on every order, after discounts.',
  },
  {
    label: "Sellers' share",
    value: `${100 - PLATFORM_FEE_PERCENT}%`,
    detail: 'Paid out to the shop once an order is delivered.',
  },
  {
    label: 'Delivery fees',
    value: 'Riders',
    detail: 'Go to the rider in full; no fee is taken.',
  },
  {
    label: 'Delivery area',
    value: `Kenya · ${DELIVERY_ZONES.length} towns`,
    detail: DELIVERY_ZONES.join(', '),
  },
];

export default function ManagementPage() {
  const [search, setSearch] = useState('');
  const onSearch = useCallback((value: string) => setSearch(value), []);

  return (
    <>
      <PageHeader
        title="Management"
        description="Your admin team and how MlimaLink is set up."
      />

      <div className="space-y-6">
        <Panel
          title="Admin team"
          description="Everyone who can sign in to this dashboard."
        >
          <Toolbar>
            <SearchBox
              label="Search admins"
              placeholder="Search by name or email"
              onSearch={onSearch}
            />
          </Toolbar>
          <AdminsList key={search} search={search} />
          <p className="mt-5 rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-600">
            To add an admin or reset a password, run{' '}
            <code className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-800">
              npm run admin:create -- --email name@example.com --name &quot;Full
              Name&quot;
            </code>{' '}
            on the server.
          </p>
        </Panel>

        <Panel
          title="Platform settings"
          description="How money and deliveries work today. Changing these needs a release for now."
        >
          <dl className="grid gap-4 sm:grid-cols-2">
            {SETTINGS.map((setting) => (
              <div
                key={setting.label}
                className="rounded-lg border border-neutral-200 p-4"
              >
                <dt className="text-sm text-neutral-500">{setting.label}</dt>
                <dd className="mt-1 font-poppins text-xl font-semibold text-neutral-900">
                  {setting.value}
                </dd>
                <dd className="mt-1 text-xs text-neutral-500">
                  {setting.detail}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </>
  );
}
