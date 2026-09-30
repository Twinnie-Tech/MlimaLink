import Link from 'next/link';
import { CheckoutForm } from '../shared/widgets/checkout-form';

export default function CheckoutPage() {
  return (
    <div className="mx-auto w-[90%] max-w-300 py-10">
      <h1 className="font-poppins text-3xl font-semibold text-neutral-900">
        Checkout
      </h1>
      <p className="mb-8 mt-1 text-neutral-500">
        Tell us where to deliver.{' '}
        <Link href="/cart" className="text-brand-start hover:underline">
          Back to cart
        </Link>
      </p>
      <CheckoutForm />
    </div>
  );
}
