'use client';

import Link from 'next/link';
import { KeyRound, Store } from 'lucide-react';
import { initials } from '../../../shared/hooks/use-user';
import { useDashboardUser } from '../../../shared/dashboard/user-context';
import {
  DetailList,
  PageHeader,
  Panel,
  accountType,
  formatMonthYear,
  secondaryButtonClassName,
} from '../../../shared/dashboard/ui';

export default function ProfilePage() {
  const user = useDashboardUser();

  return (
    <>
      <PageHeader title="Profile" description="The details on your MlimaLink account." />

      <div className="space-y-6">
        <Panel>
          <div className="flex flex-wrap items-center gap-5">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-start to-brand-end font-poppins text-2xl font-semibold text-white ring-4 ring-brand-start/10">
              {initials(user.name)}
            </span>
            <div className="min-w-0">
              <h2 className="font-poppins text-xl font-semibold text-neutral-900">{user.name}</h2>
              <p className="truncate text-sm text-neutral-500">{user.email}</p>
              <span className="mt-2 inline-block rounded-full bg-brand-start/10 px-2.5 py-0.5 text-xs font-medium text-brand-start">
                {`${accountType(user.role)} account`}
              </span>
            </div>
          </div>
        </Panel>

        <Panel title="Account details">
          <DetailList
            items={[
              { label: 'Full name', value: user.name },
              { label: 'Email', value: user.email },
              { label: 'Account type', value: accountType(user.role) },
              { label: 'Member since', value: formatMonthYear(user.createdAt) },
            ]}
          />
        </Panel>

        <div className="grid gap-6 md:grid-cols-2">
          <Panel title="Password">
            <p className="text-sm text-neutral-500">
              Forgot it or want a new one? We&apos;ll email you a secure reset link.
            </p>
            <Link href="/dashboard/security" className={`mt-4 ${secondaryButtonClassName}`}>
              <KeyRound size={16} /> Manage security
            </Link>
          </Panel>
          <Panel title="Selling on MlimaLink">
            <p className="text-sm text-neutral-500">
              Seller accounts are separate, so you can shop and sell with different logins.
            </p>
            <Link href="/become-seller" className={`mt-4 ${secondaryButtonClassName}`}>
              <Store size={16} /> Become a seller
            </Link>
          </Panel>
        </div>
      </div>
    </>
  );
}
