'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import {
  DEFAULT_COUNTRY_CODE,
  countries,
  findCountry,
  toInternationalPhone,
} from '../../../../configs/countries';
import {
  EMAIL_PATTERN,
  PASSWORD_PATTERN,
  registerSeller,
  verifySeller,
  type Seller,
  type SellerAccountData,
} from '../../../shared/utils/seller-api';
import {
  FieldError,
  PasswordToggle,
  ServerError,
  inputClassName,
  labelClassName,
  submitButtonClassName,
  textLinkClassName,
} from '../../../shared/widgets/auth-form';
import { OtpInput } from '../../../shared/widgets/otp-input';

type FormData = {
  name: string;
  email: string;
  country: string;
  phone: string;
  password: string;
};

/** The auth service sends 4-digit codes and allows a resend after 60 seconds. */
const OTP_LENGTH = 4;
const RESEND_SECONDS = 60;
/** E.164 allows at most 15 digits including the country code. */
const MAX_PHONE_DIGITS = 15;

const emptyOtp = () => Array<string>(OTP_LENGTH).fill('');

export function CreateAccountStep({
  onVerified,
}: {
  onVerified: (seller: Seller) => void;
}) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [accountData, setAccountData] = useState<SellerAccountData | null>(
    null,
  );
  const [otp, setOtp] = useState<string[]>(emptyOtp);
  const [timer, setTimer] = useState(RESEND_SECONDS);
  const [canResend, setCanResend] = useState(false);

  const showOtp = accountData !== null;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({ defaultValues: { country: DEFAULT_COUNTRY_CODE } });

  const dialCode = findCountry(watch('country'))?.dialCode ?? '';

  useEffect(() => {
    if (!showOtp || canResend) return;
    const timeout = setTimeout(() => {
      if (timer <= 1) {
        setTimer(0);
        setCanResend(true);
      } else {
        setTimer(timer - 1);
      }
    }, 1000);
    return () => clearTimeout(timeout);
  }, [showOtp, canResend, timer]);

  const sendCodeMutation = useMutation({
    mutationFn: registerSeller,
    onSuccess: (_response, data) => {
      setServerError(null);
      setAccountData(data);
      setOtp(emptyOtp());
      setTimer(RESEND_SECONDS);
      setCanResend(false);
    },
    onError: (error: Error) => setServerError(error.message),
  });

  const verifyMutation = useMutation({
    mutationFn: () => {
      if (!accountData) throw new Error('Please fill in your details first.');
      return verifySeller({ ...accountData, otp: otp.join('') });
    },
    onSuccess: ({ seller }) => {
      setServerError(null);
      onVerified(seller);
    },
    onError: (error: Error) => setServerError(error.message),
  });

  const onSubmit = (data: FormData) => {
    setServerError(null);
    sendCodeMutation.mutate({
      name: data.name.trim(),
      email: data.email.trim(),
      country: data.country,
      phone_number: toInternationalPhone(dialCode, data.phone),
      password: data.password,
    });
  };

  const otpComplete = otp.every(Boolean);

  if (showOtp) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (otpComplete) verifyMutation.mutate();
        }}
        className="space-y-5"
      >
        <div className="text-center">
          <h2 className="font-poppins text-xl font-semibold text-neutral-900">
            Verify your email
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            We sent a {OTP_LENGTH}-digit code to{' '}
            <span className="font-medium text-neutral-900">
              {accountData.email}
            </span>
          </p>
        </div>

        <OtpInput value={otp} onChange={setOtp} />

        <ServerError message={serverError} />

        <button
          type="submit"
          disabled={!otpComplete || verifyMutation.isPending}
          className={submitButtonClassName}
        >
          {verifyMutation.isPending ? 'Verifying…' : 'Verify and continue'}
        </button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setAccountData(null);
              setServerError(null);
              setOtp(emptyOtp());
            }}
            className={textLinkClassName}
          >
            Edit my details
          </button>
          {canResend ? (
            <button
              type="button"
              onClick={() => sendCodeMutation.mutate(accountData)}
              disabled={sendCodeMutation.isPending}
              className={`${textLinkClassName} disabled:opacity-60`}
            >
              {sendCodeMutation.isPending ? 'Sending…' : 'Resend code'}
            </button>
          ) : (
            <span className="text-neutral-500" aria-live="polite">
              Resend code in {timer}s
            </span>
          )}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div>
        <label htmlFor="name" className={labelClassName(!!errors.name)}>
          Name
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          placeholder="Your full name"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'name-error' : undefined}
          className={inputClassName(!!errors.name)}
          {...register('name', {
            validate: (value) => value.trim().length > 0 || 'Name is required',
          })}
        />
        <FieldError id="name-error" message={errors.name?.message} />
      </div>

      <div>
        <label htmlFor="email" className={labelClassName(!!errors.email)}>
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
          className={inputClassName(!!errors.email)}
          {...register('email', {
            required: 'Email is required',
            pattern: {
              value: EMAIL_PATTERN,
              message: 'Enter a valid email address',
            },
          })}
        />
        <FieldError id="email-error" message={errors.email?.message} />
      </div>

      <div>
        <label htmlFor="country" className={labelClassName(false)}>
          Country
        </label>
        <select
          id="country"
          autoComplete="country"
          className={inputClassName(false)}
          {...register('country', { required: true })}
        >
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="phone" className={labelClassName(!!errors.phone)}>
          Phone number
        </label>
        <div className="flex">
          <span
            data-testid="dial-code"
            className="flex items-center rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 px-3 text-neutral-700"
          >
            +{dialCode}
          </span>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="712 345 678"
            aria-invalid={!!errors.phone}
            aria-describedby="phone-hint"
            className={`${inputClassName(!!errors.phone)} rounded-l-none`}
            {...register('phone', {
              validate: (value) => {
                if (!value.trim()) return 'Phone number is required';
                if (/[^\d\s()-]/.test(value.trim()))
                  return 'Use digits only; the country code is added for you';
                const digits = value.replace(/\D/g, '').replace(/^0+/, '');
                return (
                  (digits.length >= 6 &&
                    dialCode.length + digits.length <= MAX_PHONE_DIGITS) ||
                  'Enter a valid phone number'
                );
              },
            })}
          />
        </div>
        {errors.phone ? (
          <FieldError id="phone-hint" message={errors.phone.message} />
        ) : (
          <p id="phone-hint" className="mt-1.5 text-sm text-neutral-500">
            Changes with the country you pick. A leading 0 is dropped for you.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="password" className={labelClassName(!!errors.password)}>
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={passwordVisible ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Create a password"
            aria-invalid={!!errors.password}
            aria-describedby="password-hint"
            className={`${inputClassName(!!errors.password)} pr-12`}
            {...register('password', {
              required: 'Password is required',
              pattern: {
                value: PASSWORD_PATTERN,
                message:
                  'Use at least 8 characters with uppercase, lowercase, a number and a special character',
              },
            })}
          />
          <PasswordToggle
            visible={passwordVisible}
            onToggle={() => setPasswordVisible((visible) => !visible)}
          />
        </div>
        {errors.password ? (
          <FieldError id="password-hint" message={errors.password.message} />
        ) : (
          <p id="password-hint" className="mt-1.5 text-sm text-neutral-500">
            At least 8 characters with uppercase, lowercase, a number and a
            special character.
          </p>
        )}
      </div>

      <ServerError message={serverError} />

      <button
        type="submit"
        disabled={sendCodeMutation.isPending}
        className={submitButtonClassName}
      >
        {sendCodeMutation.isPending ? 'Sending code…' : 'Create Account'}
      </button>
    </form>
  );
}
