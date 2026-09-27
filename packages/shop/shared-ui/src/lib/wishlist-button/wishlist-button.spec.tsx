import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WishlistButton } from './wishlist-button';

describe('WishlistButton', () => {
  it('should describe the add action when not wishlisted', () => {
    render(
      <WishlistButton productName="Shoes" active={false} onToggle={vi.fn()} />,
    );

    const button = screen.getByRole('button', {
      name: 'Add Shoes to wishlist',
    });
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('should describe the remove action when wishlisted', () => {
    render(<WishlistButton productName="Shoes" active onToggle={vi.fn()} />);

    const button = screen.getByRole('button', {
      name: 'Remove Shoes from wishlist',
    });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('should call onToggle without bubbling the click', () => {
    const onToggle = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div
        role="button"
        tabIndex={0}
        onClick={onParentClick}
        onKeyDown={onParentClick}
      >
        <WishlistButton
          productName="Shoes"
          active={false}
          onToggle={onToggle}
        />
      </div>,
    );

    const button = screen.getByRole('button', {
      name: 'Add Shoes to wishlist',
    });
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('should show a text label when requested', () => {
    render(
      <WishlistButton
        productName="Shoes"
        active={false}
        onToggle={vi.fn()}
        showLabel
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Add to Wishlist' }),
    ).toBeInTheDocument();
  });
});
