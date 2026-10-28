/**
 * Mobile numbers (doc 03): a country picker that defaults to Syria, then the
 * number as people write it locally. Stored as E.164 (+963912345678).
 * Country names come from the browser's built-in list, in the page's
 * language (owner, step 11), so they are not in the locale files.
 */
import type { Language } from '@mixline/shared';
import {
  type CountryCode,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from 'libphonenumber-js/min';

export type { CountryCode };

export const DEFAULT_PHONE_COUNTRY: CountryCode = 'SY';

export interface PhoneCountry {
  code: CountryCode;
  name: string;
  /** Calling code without "+", e.g. "963". */
  dial: string;
}

/** Every country with a calling code, by name in `lang`. */
export function phoneCountries(lang: Language): PhoneCountry[] {
  const names = new Intl.DisplayNames([lang], { type: 'region' });
  return getCountries()
    .map((code) => ({ code, name: names.of(code) ?? code, dial: getCountryCallingCode(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

/** The number in E.164, or undefined if it is not a valid number for that country. */
export function toE164(country: CountryCode, number: string): string | undefined {
  const parsed = parsePhoneNumberFromString(number.trim(), country);
  return parsed?.isValid() ? parsed.number : undefined;
}
