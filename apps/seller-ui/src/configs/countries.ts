export type Country = {
  /** ISO 3166-1 alpha-2 code, stored on the seller. */
  code: string;
  name: string;
  /** International dialling prefix, without the "+". */
  dialCode: string;
};

export const DEFAULT_COUNTRY_CODE = 'KE';

/** East Africa first, then the rest of Africa and the main markets elsewhere. */
export const countries: Country[] = [
  { code: 'KE', name: 'Kenya', dialCode: '254' },
  { code: 'UG', name: 'Uganda', dialCode: '256' },
  { code: 'TZ', name: 'Tanzania', dialCode: '255' },
  { code: 'RW', name: 'Rwanda', dialCode: '250' },
  { code: 'BI', name: 'Burundi', dialCode: '257' },
  { code: 'SS', name: 'South Sudan', dialCode: '211' },
  { code: 'ET', name: 'Ethiopia', dialCode: '251' },
  { code: 'SO', name: 'Somalia', dialCode: '252' },
  { code: 'CD', name: 'DR Congo', dialCode: '243' },
  { code: 'DZ', name: 'Algeria', dialCode: '213' },
  { code: 'BW', name: 'Botswana', dialCode: '267' },
  { code: 'CM', name: 'Cameroon', dialCode: '237' },
  { code: 'CI', name: "Côte d'Ivoire", dialCode: '225' },
  { code: 'EG', name: 'Egypt', dialCode: '20' },
  { code: 'GH', name: 'Ghana', dialCode: '233' },
  { code: 'MW', name: 'Malawi', dialCode: '265' },
  { code: 'MA', name: 'Morocco', dialCode: '212' },
  { code: 'MZ', name: 'Mozambique', dialCode: '258' },
  { code: 'NA', name: 'Namibia', dialCode: '264' },
  { code: 'NG', name: 'Nigeria', dialCode: '234' },
  { code: 'SN', name: 'Senegal', dialCode: '221' },
  { code: 'ZA', name: 'South Africa', dialCode: '27' },
  { code: 'SD', name: 'Sudan', dialCode: '249' },
  { code: 'TN', name: 'Tunisia', dialCode: '216' },
  { code: 'ZM', name: 'Zambia', dialCode: '260' },
  { code: 'ZW', name: 'Zimbabwe', dialCode: '263' },
  { code: 'AU', name: 'Australia', dialCode: '61' },
  { code: 'BR', name: 'Brazil', dialCode: '55' },
  { code: 'CA', name: 'Canada', dialCode: '1' },
  { code: 'CN', name: 'China', dialCode: '86' },
  { code: 'FR', name: 'France', dialCode: '33' },
  { code: 'DE', name: 'Germany', dialCode: '49' },
  { code: 'IN', name: 'India', dialCode: '91' },
  { code: 'JP', name: 'Japan', dialCode: '81' },
  { code: 'NL', name: 'Netherlands', dialCode: '31' },
  { code: 'QA', name: 'Qatar', dialCode: '974' },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '966' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '971' },
  { code: 'GB', name: 'United Kingdom', dialCode: '44' },
  { code: 'US', name: 'United States', dialCode: '1' },
];

export function findCountry(code: string): Country | undefined {
  return countries.find((country) => country.code === code);
}

/**
 * Joins a dialling code and a locally typed number into international format,
 * dropping spaces, dashes and the leading 0 of local numbers (0712… → +254712…).
 */
export function toInternationalPhone(dialCode: string, localNumber: string) {
  const digits = localNumber.replace(/\D/g, '').replace(/^0+/, '');
  return `+${dialCode}${digits}`;
}
