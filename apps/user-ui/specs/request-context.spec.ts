import { describe, expect, it } from 'vitest';
import {
  deviceFromUserAgent,
  requestContext,
} from '../src/app/shared/utils/request-context';

describe('deviceFromUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148',
      'mobile',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129.0 Mobile Safari/537.36',
      'mobile',
    ],
    ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1', 'tablet'],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-X710) Chrome/129.0 Safari/537.36',
      'tablet',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0 Safari/537.36',
      'desktop',
    ],
  ])('reads %s as %s', (userAgent, device) => {
    expect(deviceFromUserAgent(userAgent)).toBe(device);
  });

  it('knows nothing without a User-Agent', () => {
    expect(deviceFromUserAgent(null)).toBeUndefined();
  });
});

describe('requestContext', () => {
  it('reads Vercel’s geo-IP headers, decoding the city', () => {
    const headers = new Headers({
      'x-vercel-ip-country': 'BR',
      'x-vercel-ip-city': 'S%C3%A3o%20Paulo',
    });

    expect(requestContext(headers)).toEqual({
      country: 'BR',
      city: 'São Paulo',
    });
  });

  it('falls back to Cloudflare’s, ignoring its unknown-country codes', () => {
    expect(
      requestContext(
        new Headers({ 'cf-ipcountry': 'KE', 'cf-ipcity': 'Kisumu' }),
      ),
    ).toEqual({ country: 'KE', city: 'Kisumu' });
    expect(requestContext(new Headers({ 'cf-ipcountry': 'XX' }))).toEqual({});
  });

  it('keeps a city that isn’t valid URI encoding as it is', () => {
    expect(requestContext(new Headers({ 'x-vercel-ip-city': '100%' }))).toEqual(
      { city: '100%' },
    );
  });
});
