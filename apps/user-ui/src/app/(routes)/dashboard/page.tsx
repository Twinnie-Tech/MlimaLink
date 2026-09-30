'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Bike,
  Heart,
  MapPin,
  Package,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  choiceImage,
  imageSrcSet,
  sizedImage,
  variantLabel,
} from '@org/models/catalog';
import { firstName } from '../../shared/hooks/use-user';
import {
  cartItemPrice,
  cartLineId,
  formatPrice,
  formatProductPrice,
  useShopStore,
} from '../../shared/store/shop-store';
import { useDashboardUser } from '../../shared/dashboard/user-context';
import { MyOrders, useMyOrders } from '../../shared/widgets/my-orders';
import { MyServiceRequests } from '../../shared/widgets/my-service-requests';
import {
  DetailList,
  Panel,
  StatCard,
  accountType,
  formatMonthYear,
  primaryButtonClassName,
  textLinkClassName,
} from '../../shared/dashboard/ui';

const shortcuts: {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
}[] = [
  {
    label: 'Addresses',
    description: 'Where we deliver',
    href: '/dashboard/addresses',
    icon: MapPin,
  },
  {
    label: 'Security',
    description: 'Password & sign-in',
    href: '/dashboard/security',
    icon: ShieldCheck,
  },
  {
    label: 'Become a seller',
    description: 'Open your own shop',
    href: '/become-seller',
    icon: Store,
  },
  {
    label: 'Deliver with MlimaLink',
    description: 'Earn as a delivery rider',
    href: '/rider',
    icon: Bike,
  },
];

export default function DashboardPage() {
  const user = useDashboardUser();
  const { wishlist, cart, cartCount, cartSubtotal } = useShopStore();
  const orders = useMyOrders().data ?? [];
  const onTheWay = orders.filter(
    (order) => order.status === 'out_for_delivery',
  ).length;

  return (
    <>
      <div className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-brand-start to-brand-end p-6 text-white shadow-md sm:p-8">
        <div className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute right-40 -bottom-24 h-44 w-44 rounded-full bg-white/10" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <h1 className="font-poppins text-2xl font-semibold sm:text-3xl">
              Welcome back, {firstName(user.name)}
            </h1>
            <p className="mt-1 text-white/80">
              Track your orders, pick up where you left off and manage your
              account.
            </p>
          </div>
          <Link
            href="/products"
            className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-brand-start shadow-sm transition hover:bg-white/90"
          >
            <ShoppingBag size={16} /> Continue shopping
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Package}
          label="Orders"
          value={String(orders.length)}
          hint={
            onTheWay > 0
              ? `${onTheWay} on the way`
              : orders.length > 0
                ? 'Track your deliveries'
                : 'No orders yet'
          }
          href="/dashboard/orders"
          tone="amber"
        />
        <StatCard
          icon={Heart}
          label="Wishlist"
          value={String(wishlist.length)}
          hint="Saved for later"
          href="/dashboard/wishlist"
          tone="rose"
        />
        <StatCard
          icon={ShoppingCart}
          label="Cart items"
          value={String(cartCount)}
          hint="Ready to check out"
          href="/dashboard/cart"
        />
        <StatCard
          icon={Wallet}
          label="Cart total"
          value={formatPrice(cartSubtotal)}
          hint="Before delivery"
          tone="emerald"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel
            title="Recent orders"
            action={
              <Link href="/dashboard/orders" className={textLinkClassName}>
                View all
              </Link>
            }
          >
            <MyOrders limit={3} compact />
          </Panel>

          <Panel
            title="Service requests"
            description="Services you've asked for and what each provider said."
          >
            <MyServiceRequests />
          </Panel>

          <Panel
            title="From your wishlist"
            action={
              wishlist.length > 0 && (
                <Link href="/dashboard/wishlist" className={textLinkClassName}>
                  View all <ArrowRight size={14} />
                </Link>
              )
            }
          >
            {wishlist.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Nothing saved yet. Tap the heart on any product to keep it here.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {wishlist.slice(0, 4).map((product) => (
                  <li key={product.id}>
                    <Link
                      href={`/products/${product.id}`}
                      className="group block"
                    >
                      <div className="aspect-[4/3] overflow-hidden rounded-lg bg-neutral-100">
                        <img
                          src={sizedImage(product.imageUrl, 400)}
                          srcSet={imageSrcSet(product.imageUrl, [400, 800])}
                          sizes="(min-width: 1024px) 200px, 50vw"
                          alt={product.name}
                          loading="lazy"
                          className="h-full w-full object-cover transition group-hover:scale-105"
                        />
                      </div>
                      <p className="mt-2 truncate text-sm font-medium text-neutral-900 group-hover:text-brand-start">
                        {product.name}
                      </p>
                      <p className="text-sm text-neutral-500">
                        {formatProductPrice(product)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Your cart">
            {cart.length === 0 ? (
              <p className="text-sm text-neutral-500">Your cart is empty.</p>
            ) : (
              <>
                <ul className="space-y-3">
                  {cart.slice(0, 3).map((item) => (
                    <li
                      key={cartLineId(item)}
                      className="flex items-center gap-3 text-sm"
                    >
                      <img
                        src={sizedImage(
                          choiceImage(
                            item.product,
                            item.variant?.choices ?? {},
                          ),
                          80,
                        )}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-md object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate text-neutral-700">
                        {item.product.name}
                        {item.variant && (
                          <span className="text-neutral-500">
                            {' '}
                            ·{' '}
                            {variantLabel(
                              item.variant.choices,
                              item.product.options ?? [],
                            )}
                          </span>
                        )}
                        <span className="text-neutral-400">
                          {' '}
                          × {item.quantity}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium text-neutral-900">
                        {formatPrice(cartItemPrice(item) * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
                {cart.length > 3 && (
                  <p className="mt-3 text-xs text-neutral-400">
                    and {cart.length - 3} more{' '}
                    {cart.length - 3 === 1 ? 'product' : 'products'}
                  </p>
                )}
                <div className="mt-5 flex items-center justify-between border-t border-neutral-200 pt-4">
                  <span className="text-sm text-neutral-500">Subtotal</span>
                  <span className="font-poppins text-lg font-semibold text-neutral-900">
                    {formatPrice(cartSubtotal)}
                  </span>
                </div>
                <Link
                  href="/dashboard/cart"
                  className={`mt-4 w-full ${primaryButtonClassName}`}
                >
                  View cart <ArrowRight size={16} />
                </Link>
              </>
            )}
          </Panel>

          <Panel title="Shortcuts">
            <ul className="space-y-2">
              {shortcuts.map(({ label, description, href, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="flex items-center gap-3 rounded-lg border border-neutral-200 p-3 transition hover:border-brand-start/40 hover:bg-brand-start/5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-start/10 text-brand-start">
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-neutral-900">
                        {label}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {description}
                      </span>
                    </span>
                    <ArrowRight size={16} className="text-neutral-300" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="Account"
            action={
              <Link href="/dashboard/profile" className={textLinkClassName}>
                Profile
              </Link>
            }
          >
            <DetailList
              columns={1}
              items={[
                { label: 'Email', value: user.email },
                { label: 'Account type', value: accountType(user.role) },
                {
                  label: 'Member since',
                  value: formatMonthYear(user.createdAt),
                },
              ]}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
