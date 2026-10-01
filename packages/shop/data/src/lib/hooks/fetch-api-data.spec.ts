import { vi, describe, it, expect, beforeEach } from 'vitest';
import { fetchApiData, SHOP_UNAVAILABLE } from './fetch-api-data';

global.fetch = vi.fn();

const notJson = async () => {
  throw new SyntaxError(
    `Unexpected token 'I', "Internal S"... is not valid JSON`,
  );
};

describe('fetchApiData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the data of a successful response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: ['Electronics'] }),
    } as Response);

    await expect(fetchApiData('/api/x', 'Failed')).resolves.toEqual([
      'Electronics',
    ]);
    expect(fetch).toHaveBeenCalledWith('/api/x');
  });

  it('explains a plain-text 500 instead of surfacing a JSON parse error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: notJson,
    } as unknown as Response);

    await expect(fetchApiData('/api/x', 'Failed')).rejects.toThrow(
      SHOP_UNAVAILABLE,
    );
  });

  it('uses the fallback for a non-JSON 4xx', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: notJson,
    } as unknown as Response);

    await expect(fetchApiData('/api/x', 'Failed to load')).rejects.toThrow(
      'Failed to load',
    );
  });

  it('prefers the error message from a JSON error body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ success: false, error: 'Product not found' }),
    } as Response);

    await expect(fetchApiData('/api/x', 'Failed')).rejects.toThrow(
      'Product not found',
    );
  });

  it('throws the API error when success is false', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: false }),
    } as Response);

    await expect(fetchApiData('/api/x', 'Failed')).rejects.toThrow('Failed');
  });
});
