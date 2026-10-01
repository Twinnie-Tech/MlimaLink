import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bike,
  CheckCircle2,
  KeyRound,
  ShoppingBag,
  Store,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { DELIVERY_ZONES } from '@org/models/delivery';
import {
  CartCard,
  CodeCard,
  DeliveryTimelineCard,
  NewOrderCard,
  RiderCard,
  SalesCard,
  ServicesCard,
} from './mockups';
import { Reveal } from './reveal';

export const primaryCta =
  'inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-start to-brand-end px-6 py-3 font-poppins text-sm font-medium text-white shadow-lg shadow-brand-start/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-start/40';

export const secondaryCta =
  'inline-flex items-center justify-center gap-2 rounded-full border border-neutral-300 bg-white px-6 py-3 font-poppins text-sm font-medium text-neutral-800 transition hover:-translate-y-0.5 hover:border-brand-start hover:text-brand-start';

const container = 'mx-auto w-[90%] max-w-300';

/** Small emoji label above a section heading. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-brand-start/20 bg-brand-start/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-start">
      {children}
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  text,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  text?: string;
}) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 font-poppins text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
        {title}
      </h2>
      {text && <p className="mt-4 text-lg text-neutral-600">{text}</p>}
    </Reveal>
  );
}

const gradientText =
  'bg-gradient-to-r from-brand-start to-brand-end bg-clip-text text-transparent';

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="bg-grid absolute inset-0" />
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-brand-start/25 blur-3xl motion-safe:animate-blob" />
        <div className="absolute top-20 -right-24 h-96 w-96 rounded-full bg-brand-end/20 blur-3xl motion-safe:animate-blob [animation-delay:-5s]" />
        <div className="absolute -bottom-40 left-1/3 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl motion-safe:animate-blob [animation-delay:-9s]" />
      </div>

      <div
        className={`${container} relative grid items-center gap-14 py-16 lg:grid-cols-2 lg:py-24`}
      >
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/80 px-4 py-1.5 text-sm text-neutral-700 shadow-sm backdrop-blur">
              <span aria-hidden="true">🎯</span>
              Shops, farmers and riders across Mt Kenya, in one place
            </span>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="mt-6 font-poppins text-4xl font-bold leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
              Shop local. <span className={gradientText}>Sell further.</span>{' '}
              Delivered to your door.
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-6 max-w-xl text-lg text-neutral-600">
              MlimaLink connects you with shops, farmers and service providers
              in your town, and local riders bring your order to you. Pay on
              delivery, and confirm it with a code only you know.
            </p>
          </Reveal>
          <Reveal delay={300}>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/products" className={primaryCta}>
                Start shopping <ArrowRight size={16} />
              </Link>
              <Link href="/become-seller" className={secondaryCta}>
                Open your shop
              </Link>
            </div>
          </Reveal>
          <Reveal delay={400}>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-600">
              {['Pay on delivery', 'Private delivery code', 'Local riders'].map(
                (point) => (
                  <li key={point} className="flex items-center gap-1.5">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    {point}
                  </li>
                ),
              )}
            </ul>
          </Reveal>
        </div>

        <Reveal
          delay={200}
          className="relative mx-auto w-full max-w-md lg:max-w-none"
        >
          <div className="relative px-4 py-10 sm:px-10">
            <SalesCard className="relative z-10" />
            <RiderCard className="absolute -top-2 -right-2 z-20 hidden sm:block motion-safe:animate-float" />
            <CodeCard className="absolute -bottom-4 -left-2 z-20 hidden sm:block motion-safe:animate-float-slow" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function TownMarquee() {
  const towns = [...DELIVERY_ZONES, ...DELIVERY_ZONES];
  return (
    <section
      aria-label="Towns we deliver in"
      className="border-y border-neutral-200 bg-white py-8"
    >
      <p className="text-center text-sm font-medium text-neutral-500">
        Connecting shops and shoppers in {DELIVERY_ZONES.length} towns and
        growing
      </p>
      <div className="relative mt-5 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <ul className="flex w-max gap-10 motion-safe:animate-marquee hover:[animation-play-state:paused]">
          {towns.map((town, index) => (
            <li
              key={`${town}-${index}`}
              aria-hidden={index >= DELIVERY_ZONES.length || undefined}
              className="flex items-center gap-2 whitespace-nowrap font-poppins text-lg font-semibold text-neutral-400 transition hover:text-brand-start"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-brand-start/40" />
              {town}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Feature({
  eyebrow,
  title,
  text,
  points,
  cta,
  visual,
  reverse = false,
}: {
  eyebrow: ReactNode;
  title: string;
  text: string;
  points: string[];
  cta: { label: string; href: string };
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
      <Reveal className={reverse ? 'lg:order-2' : ''}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="mt-4 font-poppins text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
          {title}
        </h3>
        <p className="mt-4 text-lg text-neutral-600">{text}</p>
        <ul className="mt-6 space-y-3">
          {points.map((point) => (
            <li key={point} className="flex items-start gap-3 text-neutral-700">
              <CheckCircle2
                size={20}
                className="mt-0.5 shrink-0 text-brand-start"
              />
              {point}
            </li>
          ))}
        </ul>
        <Link href={cta.href} className={`mt-8 ${secondaryCta}`}>
          {cta.label} <ArrowRight size={16} />
        </Link>
      </Reveal>
      <Reveal delay={150} className={reverse ? 'lg:order-1' : ''}>
        <div className="relative rounded-3xl bg-gradient-to-br from-brand-start/10 via-white to-brand-end/10 p-6 sm:p-10">
          {visual}
        </div>
      </Reveal>
    </div>
  );
}

export function Features() {
  return (
    <section className="bg-neutral-100 py-20 sm:py-28">
      <div className={`${container} space-y-24 sm:space-y-32`}>
        <Feature
          eyebrow={<>🛍️ For shoppers</>}
          title="Everything local, one cart."
          text="Groceries, farm produce, hardware and electronics from shops near you. Add from several shops and check out once."
          points={[
            'Each shop confirms your order before it leaves',
            'Pay in full, pay a deposit or pay cash on delivery',
            'Track every order from your dashboard',
          ]}
          cta={{ label: 'Browse products', href: '/products' }}
          visual={
            <CartCard className="mx-auto max-w-sm motion-safe:animate-float" />
          }
        />
        <Feature
          reverse
          eyebrow={<>🏪 For sellers</>}
          title="Your shop, open around the clock."
          text="List your products in minutes, take orders from shoppers across your county, and get a rider to deliver without owning a single bike."
          points={[
            'Products with sizes, colours and stock',
            'Discount codes to bring shoppers back',
            'Choose a rider, or post the job to every rider nearby',
          ]}
          cta={{ label: 'Open your shop', href: '/become-seller' }}
          visual={
            <NewOrderCard className="mx-auto max-w-sm motion-safe:animate-float-slow" />
          }
        />
        <Feature
          eyebrow={<>🛵 Delivery</>}
          title="Riders who know your town."
          text="Local boda boda, bicycle and car riders pick up from the shop and bring it to your door. You see every step."
          points={[
            'Rider name, phone and vehicle as soon as they accept',
            'Live location while your order is on the way',
            'Delivery confirmed only with your private code',
          ]}
          cta={{ label: 'Deliver with MlimaLink', href: '/rider' }}
          visual={
            <div className="relative mx-auto max-w-sm">
              <DeliveryTimelineCard className="motion-safe:animate-float" />
              <CodeCard className="absolute -right-4 -bottom-10 hidden sm:block motion-safe:animate-float-slow" />
            </div>
          }
        />
        <Feature
          reverse
          eyebrow={<>🧰 Services</>}
          title="Hire trusted local pros."
          text="Developers, beauticians, fundis, tutors and mechanics list their services alongside shops. Send a request and they reply by email."
          points={[
            'See experience, skills and past work',
            'Share your budget and when you need it',
            'Know where each request stands',
          ]}
          cta={{ label: 'Find a service', href: '/products?category=Services' }}
          visual={
            <ServicesCard className="mx-auto max-w-sm motion-safe:animate-float" />
          }
        />
      </div>
    </section>
  );
}

export function Stats() {
  const stats = [
    { value: String(DELIVERY_ZONES.length), label: 'towns with local riders' },
    { value: '1', label: 'cart for every shop' },
    { value: '3', label: 'ways to pay' },
    { value: '4', label: 'digit code on every delivery' },
  ];
  return (
    <section className="relative overflow-hidden bg-gradient-to-r from-brand-start to-brand-end py-16 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 right-10 h-64 w-64 rounded-full bg-white/10 blur-2xl motion-safe:animate-blob" />
        <div className="absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-white/10 blur-2xl motion-safe:animate-blob [animation-delay:-6s]" />
      </div>
      <div className={`${container} relative`}>
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-white/80">
            📈 Built to grow with Mt Kenya
          </p>
          <h2 className="mt-3 font-poppins text-3xl font-bold sm:text-4xl">
            Simple for shoppers. Powerful for sellers.
          </h2>
        </Reveal>
        <ul className="mt-12 grid grid-cols-2 gap-6 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <li key={stat.label}>
              <Reveal delay={index * 100}>
                <div className="rounded-2xl border border-white/20 bg-white/10 p-6 text-center backdrop-blur transition hover:-translate-y-1 hover:bg-white/15">
                  <span className="block font-poppins text-4xl font-bold sm:text-5xl">
                    {stat.value}
                  </span>
                  <span className="mt-2 block text-sm text-white/80">
                    {stat.label}
                  </span>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function HowItWorks() {
  const steps: { icon: LucideIcon; title: string; text: string }[] = [
    {
      icon: ShoppingBag,
      title: 'Order',
      text: 'Pick products from shops near you and check out once.',
    },
    {
      icon: Store,
      title: 'Shop confirms',
      text: 'The shop confirms and tells you how to pay anything due now.',
    },
    {
      icon: Bike,
      title: 'Rider delivers',
      text: 'A local rider collects it and you follow them to your door.',
    },
    {
      icon: KeyRound,
      title: 'Give your code',
      text: 'Share your 4-digit code once you have your order. Done.',
    },
  ];
  return (
    <section className="bg-white py-20 sm:py-28">
      <div className={container}>
        <SectionHeading
          eyebrow={<>⚡️ How it works</>}
          title="From their shelf to your door in four steps"
          text="No new habits to learn. If you can send money on your phone, you can shop on MlimaLink."
        />
        <div className="relative mt-16">
          <div
            aria-hidden="true"
            className="absolute top-8 right-[12%] left-[12%] hidden h-0.5 bg-gradient-to-r from-brand-start/20 via-brand-start/50 to-brand-end/20 lg:block"
          />
          <ol className="relative grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="relative">
                <Reveal delay={index * 120} className="text-center">
                  <span className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-start to-brand-end text-white shadow-lg shadow-brand-start/30">
                    <Icon size={26} />
                    <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-start shadow">
                      {index + 1}
                    </span>
                  </span>
                  <h3 className="mt-5 font-poppins text-lg font-semibold text-neutral-900">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm text-neutral-600">{text}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function Audiences() {
  const audiences: {
    icon: LucideIcon;
    title: string;
    text: string;
    cta: { label: string; href: string };
    tone: string;
  }[] = [
    {
      icon: ShoppingBag,
      title: 'Shoppers',
      text: 'Fresh produce, household goods and more from people you know, delivered.',
      cta: { label: 'Start shopping', href: '/products' },
      tone: 'bg-brand-start/10 text-brand-start',
    },
    {
      icon: Store,
      title: 'Shops & farmers',
      text: 'Reach buyers beyond your street and let riders handle delivery.',
      cta: { label: 'Open your shop', href: '/become-seller' },
      tone: 'bg-emerald-50 text-emerald-600',
    },
    {
      icon: Bike,
      title: 'Riders',
      text: 'Pick the towns you cover, go online when you’re free and keep the delivery fee.',
      cta: { label: 'Become a rider', href: '/rider' },
      tone: 'bg-amber-50 text-amber-600',
    },
    {
      icon: Wrench,
      title: 'Service providers',
      text: 'Show your skills and past work, and get requests from clients nearby.',
      cta: { label: 'List a service', href: '/become-seller' },
      tone: 'bg-rose-50 text-rose-500',
    },
  ];
  return (
    <section className="bg-neutral-100 py-20 sm:py-28">
      <div className={container}>
        <SectionHeading
          eyebrow={<>🌍 Built for everyone</>}
          title="One platform for the whole local economy"
          text="Whether you’re buying, selling, delivering or offering a skill, there’s a place for you on MlimaLink."
        />
        <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {audiences.map(({ icon: Icon, title, text, cta, tone }, index) => (
            <li key={title}>
              <Reveal delay={index * 100} className="h-full">
                <div className="group flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-6 transition duration-300 hover:-translate-y-1.5 hover:border-brand-start/40 hover:shadow-xl hover:shadow-brand-start/10">
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ${tone} transition group-hover:scale-110`}
                  >
                    <Icon size={22} />
                  </span>
                  <h3 className="mt-5 font-poppins text-lg font-semibold text-neutral-900">
                    {title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm text-neutral-600">{text}</p>
                  <Link
                    href={cta.href}
                    className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand-start transition group-hover:gap-2"
                  >
                    {cta.label} <ArrowRight size={14} />
                  </Link>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function JoinBanner() {
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className={container}>
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-start to-brand-end px-6 py-14 text-center text-white sm:px-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
            >
              <div className="bg-grid absolute inset-0 opacity-40" />
              <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-white/15 blur-3xl motion-safe:animate-blob" />
            </div>
            <div className="relative">
              <p className="text-sm font-semibold uppercase tracking-wider text-white/80">
                🚀 Join MlimaLink
              </p>
              <h2 className="mx-auto mt-3 max-w-2xl font-poppins text-3xl font-bold sm:text-4xl">
                Be part of Mt Kenya’s local marketplace
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-white/85">
                Shop from your neighbours, grow your business, or earn as a
                rider. It takes a few minutes to get started.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-poppins text-sm font-medium text-brand-start shadow-lg transition hover:-translate-y-0.5"
                >
                  Create a free account <ArrowRight size={16} />
                </Link>
                <Link
                  href="/rider/signup"
                  className="inline-flex items-center gap-2 rounded-full border border-white/50 px-6 py-3 font-poppins text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-white/10"
                >
                  Sign up as a rider
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
