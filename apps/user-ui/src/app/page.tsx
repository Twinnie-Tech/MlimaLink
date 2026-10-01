import type { Metadata } from 'next';
import { Faq } from './shared/landing/faq';
import { LandingFooter } from './shared/landing/footer';
import {
  Audiences,
  Features,
  Hero,
  HowItWorks,
  JoinBanner,
  Stats,
  TownMarquee,
} from './shared/landing/sections';

export const metadata: Metadata = {
  title: 'MlimaLink | Shop local, delivered across Mt Kenya',
  description:
    'Order from local shops, farmers and service providers in Mt Kenya. Local riders deliver to your door, and you confirm with a private code.',
};

export default function Index() {
  return (
    <>
      <Hero />
      <TownMarquee />
      <Features />
      <Stats />
      <HowItWorks />
      <Audiences />
      <JoinBanner />
      <Faq />
      <LandingFooter />
    </>
  );
}
