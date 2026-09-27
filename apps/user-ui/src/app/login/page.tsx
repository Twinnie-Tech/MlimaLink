'use client';

import { useState } from 'react';
import { Eye, EyeOff, UserRound } from 'lucide-react';

const inputClassName =
  'w-full rounded-md border border-neutral-300 px-4 py-3 outline-none transition focus:border-brand-start focus:ring-2 focus:ring-brand-start/20';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-start/10 text-brand-start">
            <UserRound size={28} />
          </span>
          <h1 className="font-poppins text-3xl font-semibold text-neutral-900">
            Welcome back
          </h1>
          <p className="mt-2 text-neutral-500">
            Sign in to your MlimaLink account
          </p>
        </div>

        {/* UI only for now: submitting is wired to the auth service in a later step. */}
        <form
          className="mt-8 space-y-5"
          onSubmit={(e) => e.preventDefault()}
          noValidate
        >
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-neutral-700"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={inputClassName}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-neutral-700"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                className={`${inputClassName} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-neutral-500 hover:text-neutral-800"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-brand-start py-3 font-poppins font-medium text-white transition hover:bg-brand-end"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
