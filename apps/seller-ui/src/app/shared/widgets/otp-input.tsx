'use client';

import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

/**
 * One box per digit. Typing moves to the next box, Backspace moves back,
 * and pasting or SMS autofill spreads the code across the boxes.
 */
export function OtpInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (digits: string[]) => void;
}) {
  const length = value.length;
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const focusBox = (index: number) => {
    const box = inputRefs.current[Math.max(0, Math.min(index, length - 1))];
    box?.focus();
    box?.select();
  };

  const setDigit = (index: number, digit: string) =>
    onChange(value.map((d, i) => (i === index ? digit : d)));

  /** Writes digits into consecutive boxes from `start`, then moves to the next empty spot. */
  const fill = (start: number, digits: string) => {
    const chars = digits.slice(0, length - start).split('');
    onChange(
      value.map((d, i) =>
        i >= start && i < start + chars.length ? chars[i - start] : d,
      ),
    );
    focusBox(start + chars.length);
  };

  // Desktop typing is handled in keydown, so this mainly covers mobile keyboards and SMS autofill.
  const handleChange = (index: number, raw: string) => {
    const current = value[index];
    let digits = raw.replace(/\D/g, '');
    if (digits === current) return;
    if (!digits) {
      setDigit(index, '');
      return;
    }
    if (current && digits.length === current.length + 1) {
      // A digit typed next to the existing one: keep only the new digit.
      digits = digits.startsWith(current)
        ? digits.slice(current.length)
        : digits.slice(0, 1);
    }
    fill(digits.length >= length ? 0 : index, digits);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      fill(index, e.key);
      return;
    }

    switch (e.key) {
      case 'Backspace':
        e.preventDefault();
        if (value[index]) {
          setDigit(index, '');
        } else if (index > 0) {
          setDigit(index - 1, '');
          focusBox(index - 1);
        }
        return;
      case 'ArrowLeft':
        e.preventDefault();
        focusBox(index - 1);
        return;
      case 'ArrowRight':
        e.preventDefault();
        focusBox(index + 1);
        return;
      default:
        // Block letters and symbols; Tab, Enter etc. keep working.
        if (e.key.length === 1) e.preventDefault();
    }
  };

  const handlePaste = (index: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!digits) return;
    fill(digits.length >= length ? 0 : index, digits);
  };

  return (
    <div className="flex justify-center gap-3">
      {value.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          autoFocus={index === 0}
          value={digit}
          aria-label={`Digit ${index + 1} of ${length}`}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={(e) => handlePaste(index, e)}
          onFocus={(e) => e.target.select()}
          onMouseUp={(e) => e.preventDefault()}
          className="h-14 w-14 rounded-md border border-neutral-300 text-center font-poppins text-2xl font-semibold outline-none transition focus:border-brand-start focus:ring-2 focus:ring-brand-start/20"
        />
      ))}
    </div>
  );
}
