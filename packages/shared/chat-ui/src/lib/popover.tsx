import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A panel shown over the page next to whatever opened it. Put both in a `relative`
 * parent: clicks anywhere in it, including the button that opened it, don't count as
 * outside. Closes on Escape or a click outside.
 */
export function Popover({
  onClose,
  label,
  className = '',
  children,
}: {
  onClose: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const area = ref.current?.parentElement ?? ref.current;
      if (!area?.contains(event.target as Node)) onCloseRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={`absolute z-30 rounded-xl border border-neutral-200 bg-white shadow-xl ${className}`}
    >
      {children}
    </div>
  );
}
