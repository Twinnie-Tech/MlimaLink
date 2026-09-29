import {
  AE,
  AU,
  BI,
  BR,
  BW,
  CA,
  CD,
  CI,
  CM,
  CN,
  DE,
  DZ,
  EG,
  ET,
  FR,
  GB,
  GH,
  IN,
  JP,
  KE,
  MA,
  MW,
  MZ,
  NA,
  NG,
  NL,
  QA,
  RW,
  SA,
  SD,
  SN,
  SO,
  SS,
  TN,
  TZ,
  UG,
  US,
  ZA,
  ZM,
  ZW,
} from 'country-flag-icons/react/3x2';

/**
 * SVG flags, because Windows doesn't render flag emoji. Named imports keep the
 * bundle to the countries offered in `configs/countries.ts`.
 */
const flags: Record<string, typeof KE> = {
  AE,
  AU,
  BI,
  BR,
  BW,
  CA,
  CD,
  CI,
  CM,
  CN,
  DE,
  DZ,
  EG,
  ET,
  FR,
  GB,
  GH,
  IN,
  JP,
  KE,
  MA,
  MW,
  MZ,
  NA,
  NG,
  NL,
  QA,
  RW,
  SA,
  SD,
  SN,
  SO,
  SS,
  TN,
  TZ,
  UG,
  US,
  ZA,
  ZM,
  ZW,
};

/** Decorative flag for an ISO 3166-1 alpha-2 code; renders nothing for unknown codes. */
export function CountryFlag({ code }: { code: string }) {
  const Flag = flags[code];
  if (!Flag) return null;
  return (
    <Flag
      aria-hidden
      data-testid={`flag-${code}`}
      className="h-4 w-6 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-black/10"
    />
  );
}
