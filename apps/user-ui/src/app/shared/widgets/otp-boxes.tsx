'use client';

import {
  useRef,
  type ClipboardEvent,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from 'react';

/** The auth service sends 4-digit codes and allows a resend after 60 seconds. */
export const OTP_LENGTH = 4;
export const RESEND_SECONDS = 60;

export const emptyOtp = () => Array<string>(OTP_LENGTH).fill('');

/** One box per digit, with typing, backspace, arrows, paste and SMS autofill handled. */
export function OtpBoxes({
  otp,
  setOtp,
}: {
  otp: string[];
  setOtp: Dispatch<SetStateAction<string[]>>;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const focusOtpBox = (index: number) => {
    const box = inputRefs.current[Math.max(0, Math.min(index, OTP_LENGTH - 1))];
    box?.focus();
    box?.select();
  };

  /** Writes digits into consecutive boxes from `start`, then moves to the next empty spot. */
  const fillOtp = (start: number, digits: string) => {
    const chars = digits.slice(0, OTP_LENGTH - start).split('');
    setOtp((current) =>
      current.map((d, i) =>
        i >= start && i < start + chars.length ? chars[i - start] : d,
      ),
    );
    focusOtpBox(start + chars.length);
  };

  // Desktop typing is handled in keydown, so this mainly covers mobile keyboards and SMS autofill.
  const handleOtpChange = (index: number, value: string) => {
    const current = otp[index];
    let digits = value.replace(/\D/g, '');
    if (digits === current) return;
    if (!digits) {
      setOtp((otpDigits) => otpDigits.map((d, i) => (i === index ? '' : d)));
      return;
    }
    if (current && digits.length === current.length + 1) {
      // A digit typed next to the existing one: keep only the new digit.
      digits = digits.startsWith(current)
        ? digits.slice(current.length)
        : digits.slice(0, 1);
    }
    fillOtp(digits.length >= OTP_LENGTH ? 0 : index, digits);
  };

  const handleOtpKeyDown = (
    index: number,
    e: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      fillOtp(index, e.key);
      return;
    }

    switch (e.key) {
      case 'Backspace':
        e.preventDefault();
        if (otp[index]) {
          setOtp((current) => current.map((d, i) => (i === index ? '' : d)));
        } else if (index > 0) {
          setOtp((current) =>
            current.map((d, i) => (i === index - 1 ? '' : d)),
          );
          focusOtpBox(index - 1);
        }
        return;
      case 'ArrowLeft':
        e.preventDefault();
        focusOtpBox(index - 1);
        return;
      case 'ArrowRight':
        e.preventDefault();
        focusOtpBox(index + 1);
        return;
      default:
        // Block letters and symbols; Tab, Enter etc. keep working.
        if (e.key.length === 1) e.preventDefault();
    }
  };

  const handleOtpPaste = (
    index: number,
    e: ClipboardEvent<HTMLInputElement>,
  ) => {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!digits) return;
    fillOtp(digits.length >= OTP_LENGTH ? 0 : index, digits);
  };

  return (
    <div className="flex justify-center gap-3">
      {otp.map((digit, index) => (
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
          aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
          onChange={(e) => handleOtpChange(index, e.target.value)}
          onKeyDown={(e) => handleOtpKeyDown(index, e)}
          onPaste={(e) => handleOtpPaste(index, e)}
          onFocus={(e) => e.target.select()}
          onMouseUp={(e) => e.preventDefault()}
          className="h-14 w-14 rounded-md border border-neutral-300 text-center font-poppins text-2xl font-semibold outline-none transition focus:border-brand-start focus:ring-2 focus:ring-brand-start/20"
        />
      ))}
    </div>
  );
}
