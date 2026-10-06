export type DeviceType = 'mobile' | 'tablet' | 'desktop';

/** Device, country and city of the shopper making a request, where known. */
export type RequestContext = {
  device?: DeviceType;
  country?: string;
  city?: string;
};

const TABLET = /ipad|tablet|kindle|silk|playbook|android(?!.*mobile)/i;
const MOBILE = /mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i;

/** Rough device class from a User-Agent header; tablets are checked first as many say "Android". */
export function deviceFromUserAgent(
  userAgent: string | null,
): DeviceType | undefined {
  if (!userAgent) return undefined;
  if (TABLET.test(userAgent)) return 'tablet';
  if (MOBILE.test(userAgent)) return 'mobile';
  return 'desktop';
}

/** Cloudflare's codes for an unknown country and for Tor. */
const UNKNOWN_COUNTRIES = new Set(['XX', 'T1']);

function readHeader(
  headers: Pick<Headers, 'get'>,
  ...names: string[]
): string | undefined {
  for (const name of names) {
    const value = headers.get(name)?.trim();
    if (!value) continue;
    try {
      // Vercel URI-encodes city names, e.g. "S%C3%A3o%20Paulo".
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

/**
 * Reads the shopper's device from the User-Agent and their location from the geo-IP
 * headers Vercel or Cloudflare add. Location is absent when running locally.
 */
export function requestContext(headers: Pick<Headers, 'get'>): RequestContext {
  const device = deviceFromUserAgent(headers.get('user-agent'));
  const country = readHeader(headers, 'x-vercel-ip-country', 'cf-ipcountry');
  const city = readHeader(headers, 'x-vercel-ip-city', 'cf-ipcity');
  return {
    ...(device ? { device } : {}),
    ...(country && !UNKNOWN_COUNTRIES.has(country) ? { country } : {}),
    ...(city ? { city } : {}),
  };
}
