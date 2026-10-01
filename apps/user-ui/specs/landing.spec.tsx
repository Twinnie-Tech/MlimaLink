import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DELIVERY_ZONES } from '@org/models/delivery';
import Index from '../src/app/page';

const hrefOf = (name: string | RegExp) =>
  screen.getAllByRole('link', { name })[0].getAttribute('href');

describe('Landing page', () => {
  it('leads with the headline and the main actions', () => {
    render(<Index />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Shop local. Sell further. Delivered to your door.',
      }),
    ).toBeTruthy();
    expect(hrefOf(/Start shopping/)).toBe('/products');
    expect(hrefOf('Open your shop')).toBe('/become-seller');
    expect(hrefOf(/Deliver with MlimaLink/)).toBe('/rider');
    expect(hrefOf(/Create a free account/)).toBe('/signup');
    expect(hrefOf('Sign up as a rider')).toBe('/rider/signup');
  });

  it('lists every delivery town once for screen readers', () => {
    render(<Index />);

    const towns = within(
      screen.getByRole('region', { name: 'Towns we deliver in' }),
    );
    expect(towns.getAllByRole('listitem', { hidden: true })).toHaveLength(
      DELIVERY_ZONES.length * 2,
    );
    expect(towns.getAllByRole('listitem')).toHaveLength(DELIVERY_ZONES.length);
  });

  it('answers common questions', () => {
    render(<Index />);

    expect(
      screen.getByRole('heading', { name: 'Frequently asked questions' }),
    ).toBeTruthy();
    expect(screen.getByText('What is the delivery code?')).toBeTruthy();
    expect(
      screen.getByText(
        new RegExp(`Riders currently serve ${DELIVERY_ZONES[0]}`),
      ),
    ).toBeTruthy();
  });

  it('shows the four steps of an order', () => {
    render(<Index />);

    for (const step of [
      'Order',
      'Shop confirms',
      'Rider delivers',
      'Give your code',
    ]) {
      expect(
        screen.getByRole('heading', { level: 3, name: step }),
      ).toBeTruthy();
    }
  });
});
