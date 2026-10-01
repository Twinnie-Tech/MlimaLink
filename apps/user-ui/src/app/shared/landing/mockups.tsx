import type { ReactNode } from 'react';
import {
  BadgeCheck,
  Bike,
  CheckCircle2,
  MapPin,
  Package,
  ShoppingBag,
  Store,
  TrendingUp,
  Wrench,
} from 'lucide-react';

/** Illustrations of the product, so they're hidden from screen readers. */
function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl shadow-brand-start/10 ${className}`}
    >
      {children}
    </div>
  );
}

const BARS = [38, 52, 44, 70, 58, 84, 76];
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function SalesCard({ className = '' }: { className?: string }) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-neutral-500">Orders this week</p>
          <p className="mt-1 font-poppins text-3xl font-semibold text-neutral-900">
            128
          </p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
          <TrendingUp size={14} /> 18%
        </span>
      </div>
      <div className="mt-5 flex h-28 items-end gap-2">
        {BARS.map((height, index) => (
          <div
            key={index}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
          >
            <div
              className={`w-full rounded-md ${
                index === BARS.length - 2
                  ? 'bg-gradient-to-t from-brand-start to-brand-end'
                  : 'bg-brand-start/15'
              }`}
              style={{ height: `${height}%` }}
            />
            <span className="text-[10px] text-neutral-400">{DAYS[index]}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-neutral-200 pt-4 text-center">
        {[
          ['New', '6'],
          ['On the way', '4'],
          ['Delivered', '118'],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="font-poppins text-lg font-semibold text-neutral-900">
              {value}
            </p>
            <p className="text-[11px] text-neutral-500">{label}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function RiderCard({ className = '' }: { className?: string }) {
  return (
    <Card className={`w-64 ${className}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Bike size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900">On the way</p>
          <p className="truncate text-xs text-neutral-500">
            Otieno · Motorbike · 12 min
          </p>
        </div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-brand-start to-brand-end" />
      </div>
      <p className="mt-2 flex items-center gap-1 text-[11px] text-neutral-500">
        <MapPin size={12} /> Karatina → Kimathi Way, Nyeri
      </p>
    </Card>
  );
}

export function CodeCard({ className = '' }: { className?: string }) {
  return (
    <Card className={`w-56 ${className}`}>
      <p className="text-xs uppercase tracking-wide text-neutral-500">
        Your delivery code
      </p>
      <p className="mt-1 font-poppins text-3xl font-semibold tracking-[0.35em] text-brand-start">
        4821
      </p>
      <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700">
        <CheckCircle2 size={12} /> Only you can confirm delivery
      </p>
    </Card>
  );
}

export function CartCard({ className = '' }: { className?: string }) {
  const lines = [
    { shop: 'Mlima Farm', item: 'Raw honey, 1kg', icon: ShoppingBag },
    { shop: 'Kirinyaga Grains', item: 'Pishori rice, 5kg', icon: Package },
    { shop: 'Nyeri Hardware', item: 'Solar lamp', icon: Store },
  ];
  return (
    <Card className={className}>
      <p className="text-sm font-semibold text-neutral-900">
        One cart, three local shops
      </p>
      <ul className="mt-4 space-y-3">
        {lines.map(({ shop, item, icon: Icon }) => (
          <li key={shop} className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-start/10 text-brand-start">
              <Icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-neutral-800">
                {item}
              </span>
              <span className="block text-xs text-neutral-500">{shop}</span>
            </span>
            <span className="text-xs font-medium text-emerald-700">
              In stock
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-xl bg-gradient-to-r from-brand-start to-brand-end px-4 py-2.5 text-center text-sm font-medium text-white">
        Checkout
      </div>
    </Card>
  );
}

export function NewOrderCard({ className = '' }: { className?: string }) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-neutral-900">
          New order · ML-7Q2K9D
        </p>
        <span className="rounded-full bg-brand-start/10 px-2.5 py-1 text-[11px] font-medium text-brand-start">
          New
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-500">Jane D. · Kilimani, Nyeri</p>
      <ul className="mt-4 space-y-1.5 text-sm text-neutral-700">
        <li className="flex justify-between">
          <span>2 × Avocados (Hass)</span>
          <span className="text-neutral-500">ready</span>
        </li>
        <li className="flex justify-between">
          <span>1 × Raw honey, 1kg</span>
          <span className="text-neutral-500">ready</span>
        </li>
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-medium">
        <span className="rounded-lg bg-gradient-to-r from-brand-start to-brand-end py-2 text-center text-white">
          Confirm
        </span>
        <span className="rounded-lg border border-neutral-200 py-2 text-center text-neutral-700">
          Get a rider
        </span>
      </div>
    </Card>
  );
}

export function DeliveryTimelineCard({
  className = '',
}: {
  className?: string;
}) {
  const steps = [
    { label: 'Posted to nearby riders', time: '10:02', done: true },
    { label: 'Rider heading to the shop', time: '10:05', done: true },
    { label: 'On the way', time: '10:21', done: true },
    { label: 'Delivered with code', time: '—', done: false },
  ];
  return (
    <Card className={className}>
      <p className="text-sm font-semibold text-neutral-900">Delivery updates</p>
      <ol className="mt-4 space-y-3 border-l border-neutral-200 pl-4">
        {steps.map((step, index) => (
          <li key={step.label} className="relative text-sm">
            <span
              className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${
                index === 2
                  ? 'bg-brand-start ring-4 ring-brand-start/20'
                  : step.done
                    ? 'bg-brand-start/60'
                    : 'bg-neutral-300'
              }`}
            />
            <span
              className={step.done ? 'text-neutral-800' : 'text-neutral-400'}
            >
              {step.label}
            </span>
            <span className="ml-2 text-xs text-neutral-400">{step.time}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function ServicesCard({ className = '' }: { className?: string }) {
  const providers = [
    { name: 'Wanjiru Codes', skill: 'Web & mobile apps', icon: BadgeCheck },
    { name: 'Kamau Fundi', skill: 'Plumbing & electrical', icon: Wrench },
  ];
  return (
    <Card className={className}>
      <p className="text-sm font-semibold text-neutral-900">
        Hire trusted local pros
      </p>
      <ul className="mt-4 space-y-3">
        {providers.map(({ name, skill, icon: Icon }) => (
          <li
            key={name}
            className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-neutral-900">
                {name}
              </span>
              <span className="block text-xs text-neutral-500">{skill}</span>
            </span>
            <span className="text-xs font-medium text-brand-start">
              Request
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-center gap-1 text-xs text-emerald-700">
        <CheckCircle2 size={12} /> Request sent · reply by email
      </p>
    </Card>
  );
}
