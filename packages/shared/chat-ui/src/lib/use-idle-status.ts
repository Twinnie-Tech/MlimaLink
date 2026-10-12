'use client';

import { useEffect, useRef } from 'react';
import {
  CHAT_IDLE_AFTER_MS,
  type ActivePresenceStatus,
} from '@org/models/chat';

const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'scroll',
  'touchstart',
];
const CHECK_EVERY_MS = 15_000;

/**
 * Tracks whether the person is using this tab, like Teams: away after `idleAfter` without
 * activity (a hidden tab gets none), available again on the next key press or touch.
 * Returns a ref with the current status and calls `onChange` when it flips.
 */
export function useIdleStatus(
  onChange: (status: ActivePresenceStatus) => void,
  idleAfter = CHAT_IDLE_AFTER_MS,
) {
  const statusRef = useRef<ActivePresenceStatus>('available');
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    let lastActive = Date.now();
    const set = (status: ActivePresenceStatus) => {
      if (statusRef.current === status) return;
      statusRef.current = status;
      onChangeRef.current(status);
    };
    const markActive = () => {
      if (document.visibilityState === 'hidden') return;
      lastActive = Date.now();
      set('available');
    };
    const check = () => {
      if (Date.now() - lastActive >= idleAfter) set('away');
    };

    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, markActive, { passive: true });
    }
    document.addEventListener('visibilitychange', markActive);
    const timer = window.setInterval(
      check,
      Math.min(CHECK_EVERY_MS, idleAfter),
    );
    return () => {
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, markActive);
      }
      document.removeEventListener('visibilitychange', markActive);
      window.clearInterval(timer);
    };
  }, [idleAfter]);

  return statusRef;
}
