import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-neutral-200 bg-white px-6 py-16 text-center">
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-brand-start/10 text-brand-start">
        <Icon size={30} />
      </span>
      <h2 className="font-poppins text-xl font-semibold text-neutral-900">
        {title}
      </h2>
      <p className="mt-2 max-w-sm text-neutral-500">{description}</p>
      <Link
        href="/products"
        className="mt-6 rounded-md bg-brand-start px-6 py-3 font-poppins font-medium text-white transition hover:bg-brand-end"
      >
        Browse products
      </Link>
    </div>
  );
}

export default EmptyState;
