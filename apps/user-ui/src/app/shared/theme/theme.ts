'use client';

import { useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY } from './theme-script';

const listeners = new Set<() => void>();

export function setDarkMode(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  listeners.forEach((listener) => listener());
  try {
    localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light');
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this page only.
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => {
    listeners.delete(onChange);
    observer.disconnect();
  };
}

export function useDarkMode() {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
}
