import Link from 'next/link';

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Shop',
    links: [
      { label: 'All products', href: '/products' },
      { label: 'Shops', href: '/shops' },
      { label: 'Services', href: '/products?category=Services' },
      { label: 'Cart', href: '/cart' },
    ],
  },
  {
    title: 'Sell',
    links: [
      { label: 'Become a seller', href: '/become-seller' },
      { label: 'List a service', href: '/become-seller' },
    ],
  },
  {
    title: 'Deliver',
    links: [
      { label: 'Deliver with MlimaLink', href: '/rider' },
      { label: 'Rider sign up', href: '/rider/signup' },
      { label: 'Rider login', href: '/rider/login' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign up', href: '/signup' },
      { label: 'Log in', href: '/login' },
      { label: 'My orders', href: '/dashboard/orders' },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="mx-auto grid w-[90%] max-w-300 gap-10 py-14 md:grid-cols-[1.5fr_repeat(4,1fr)]">
        <div>
          <Link
            href="/"
            className="font-poppins text-2xl font-semibold text-neutral-900"
          >
            MlimaLink
          </Link>
          <p className="mt-3 max-w-xs text-sm text-neutral-500">
            The local marketplace for Mt Kenya: shops, farmers, service
            providers and riders, working together.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <p className="font-poppins text-sm font-semibold text-neutral-900">
              {column.title}
            </p>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-neutral-500 transition hover:text-brand-start"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-neutral-200">
        <p className="mx-auto w-[90%] max-w-300 py-6 text-center text-xs text-neutral-500">
          © {new Date().getFullYear()} MlimaLink. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
