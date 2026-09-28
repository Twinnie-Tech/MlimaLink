import { Check } from 'lucide-react';

export const SIGNUP_STEPS = ['Create Account', 'Setup Shop', 'Connect Bank'];

/** Progress bar for the three seller sign-up steps; `current` is 1-based. */
export function SignupSteps({ current }: { current: number }) {
  return (
    <ol aria-label="Sign-up progress" className="mb-8 flex items-start">
      {SIGNUP_STEPS.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            className="relative flex flex-1 flex-col items-center text-center"
          >
            {index > 0 && (
              <span
                aria-hidden="true"
                className={`absolute top-4 right-1/2 h-0.5 w-full ${step <= current ? 'bg-brand-start' : 'bg-neutral-200'}`}
              />
            )}
            <span
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                done || active
                  ? 'bg-brand-start text-white'
                  : 'bg-neutral-200 text-neutral-500'
              }`}
            >
              {done ? <Check size={16} aria-label="Done" /> : step}
            </span>
            <span
              className={`mt-2 text-xs sm:text-sm ${active ? 'font-semibold text-neutral-900' : 'text-neutral-500'}`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
