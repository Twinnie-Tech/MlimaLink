import Stripe from 'stripe';

let client: Stripe | undefined;

/** The Stripe client, or null when STRIPE_SECRET_KEY is not configured. */
export function getStripe(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  client ??= new Stripe(secretKey);
  return client;
}
