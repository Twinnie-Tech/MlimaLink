import styles from './wishlist-button.module.css';

export interface WishlistButtonProps {
  productName: string;
  active: boolean;
  onToggle: () => void;
  showLabel?: boolean;
}

export function WishlistButton({
  productName,
  active,
  onToggle,
  showLabel = false,
}: WishlistButtonProps) {
  const classNames = [
    styles['wishlist-button'],
    showLabel ? styles['with-label'] : '',
    active ? styles['active'] : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classNames}
      aria-pressed={active}
      aria-label={
        showLabel
          ? undefined
          : `${active ? 'Remove' : 'Add'} ${productName} ${active ? 'from' : 'to'} wishlist`
      }
      onClick={(e) => {
        // The button sits inside clickable cards; don't trigger their navigation.
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        aria-hidden="true"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
      {showLabel && (
        <span>{active ? 'Remove from Wishlist' : 'Add to Wishlist'}</span>
      )}
    </button>
  );
}

export default WishlistButton;
