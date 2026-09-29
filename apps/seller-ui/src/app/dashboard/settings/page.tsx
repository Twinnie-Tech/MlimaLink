'use client';

import Link from 'next/link';
import { ExternalLink, KeyRound } from 'lucide-react';
import { formatOpeningHours } from '@org/models/opening-hours';
import { findCountry } from '../../../configs/countries';
import { useDashboardSeller } from '../../shared/dashboard/seller-context';
import {
  DetailList,
  PageHeader,
  Panel,
  formatDate,
  secondaryButtonClassName,
} from '../../shared/dashboard/ui';

export default function SettingsPage() {
  const seller = useDashboardSeller();
  const { shop } = seller;
  const country = findCountry(seller.country);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your shop profile, account details and sign-in security."
      />

      <div className="space-y-6">
        <Panel title="Shop profile" description="What shoppers see on your shop page.">
          <DetailList
            items={[
              { label: 'Shop name', value: shop.name },
              { label: 'Category', value: shop.category },
              { label: 'Address', value: shop.address },
              {
                label: 'Opening hours',
                value: formatOpeningHours(shop.opening_hours).join('\n') || 'Not set',
              },
              {
                label: 'Website',
                value: shop.website ? (
                  <a
                    href={shop.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700"
                  >
                    {shop.website.replace(/^https?:\/\//, '')} <ExternalLink size={12} />
                  </a>
                ) : (
                  'Not set'
                ),
              },
              { label: 'Open since', value: formatDate(shop.createdAt) },
              { label: 'About', value: shop.bio || 'Not set' },
            ]}
          />
        </Panel>

        <Panel title="Account details">
          <DetailList
            items={[
              { label: 'Name', value: seller.name },
              { label: 'Email', value: seller.email },
              { label: 'Phone', value: seller.phone_number },
              { label: 'Country', value: country?.name ?? seller.country },
              { label: 'Seller since', value: formatDate(seller.createdAt) },
            ]}
          />
        </Panel>

        <Panel title="Security">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-900">Password</p>
              <p className="mt-1 text-sm text-neutral-500">
                We&apos;ll email a secure link to {seller.email} to set a new password.
              </p>
            </div>
            <Link href="/forgot-password" className={secondaryButtonClassName}>
              <KeyRound size={16} /> Reset password
            </Link>
          </div>
        </Panel>
      </div>
    </>
  );
}
