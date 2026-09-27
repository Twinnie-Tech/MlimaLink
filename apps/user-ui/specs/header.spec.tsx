import { fireEvent, render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Header } from '../src/app/shared/widgets/header';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('Header', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('renders the MlimaLink home link and search box', () => {
    render(<Header />);

    expect(
      screen.getByRole('link', { name: 'MlimaLink' }).getAttribute('href'),
    ).toBe('/');
    expect(screen.getByPlaceholderText('Search for products...')).toBeTruthy();
  });

  it('navigates to the products page with the search term', () => {
    render(<Header />);

    fireEvent.change(screen.getByPlaceholderText('Search for products...'), {
      target: { value: '  running shoes ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(push).toHaveBeenCalledWith('/products?search=running%20shoes');
  });

  it('navigates to all products when the search is empty', () => {
    render(<Header />);

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(push).toHaveBeenCalledWith('/products');
  });
});
