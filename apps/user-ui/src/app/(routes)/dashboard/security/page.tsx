'use client';

import Link from 'next/link';
import { KeyRound, Monitor, ShieldCheck } from 'lucide-react';
import { useDashboardUser } from '../../../shared/dashboard/user-context';
import {
  PageHeader,
  Panel,
  secondaryButtonClassName,
} from '../../../shared/dashboard/ui';

export default function SecurityPage() {
  const user = useDashboardUser();

  return (
    <>
      <PageHeader
        title="Security"
        description="Your password and how you stay signed in."
      />

      <div className="space-y-6">
        <Panel>
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <ShieldCheck size={22} />
            </span>
            <div>
              <p className="font-medium text-neutral-900">
                Your account is protected
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                You sign in with a password, and your session is kept in secure
                cookies that scripts on the page can&apos;t read.
              </p>
            </div>
          </div>
        </Panel>

        <Panel title="Password">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-md text-sm text-neutral-500">
              We&apos;ll email a secure link to {user.email} so you can choose a
              new password. The link works once and expires after 15 minutes.
            </p>
            <Link href="/forgot-password" className={secondaryButtonClassName}>
              <KeyRound size={16} /> Reset password
            </Link>
          </div>
        </Panel>

        <Panel title="Staying signed in">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-start/10 text-brand-start">
              <Monitor size={22} />
            </span>
            <p className="text-sm text-neutral-500">
              If you ticked{' '}
              <span className="font-medium text-neutral-700">Remember me</span>{' '}
              when logging in, you stay signed in on this device for up to 7
              days. Otherwise you&apos;re signed out when you close the browser.
              Use <span className="font-medium text-neutral-700">Log out</span>{' '}
              in the menu to sign out now.
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}
