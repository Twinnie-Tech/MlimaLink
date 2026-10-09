'use client';

import { Moon, Sun } from 'lucide-react';
import { setDarkMode, useDarkMode } from '../theme/theme';

/** Light/dark switch. The knob position comes from the `dark` class, so it never flickers on load. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const dark = useDarkMode();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() =>
        setDarkMode(!document.documentElement.classList.contains('dark'))
      }
      className={`relative inline-flex h-8 w-[60px] shrink-0 items-center justify-between rounded-full border border-neutral-200 bg-neutral-100 px-1.5 transition-colors hover:border-neutral-300 dark:border-white/10 dark:bg-white/5 ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute top-[3px] left-[3px] h-6 w-6 rounded-full bg-[#fff] shadow-sm ring-1 ring-black/5 transition-transform duration-200 dark:translate-x-7 dark:bg-[#2a2a31] dark:ring-white/10"
      />
      <Sun
        size={14}
        aria-hidden="true"
        className="relative text-amber-500 transition-opacity dark:opacity-40"
      />
      <Moon
        size={14}
        aria-hidden="true"
        className="relative text-neutral-400 transition-colors dark:text-indigo-300"
      />
    </button>
  );
}
