import type { ApiResponse } from '@org/models';

export const SHOP_UNAVAILABLE =
  'The shop is unavailable right now. Please try again in a moment.';

/**
 * GETs an `ApiResponse` and returns its data. Proxies and crashed servers can answer
 * with a plain-text error page, so a failed response never has to be JSON.
 */
export async function fetchApiData<T>(
  url: string,
  fallbackError: string,
): Promise<T> {
  const response = await fetch(url);

  let body: ApiResponse<T> | null = null;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch (error) {
    if (response.ok) throw error;
  }

  if (!response.ok) {
    throw new Error(
      body?.error ??
        (response.status >= 500 ? SHOP_UNAVAILABLE : fallbackError),
    );
  }
  if (!body?.success) {
    throw new Error(body?.error || fallbackError);
  }
  return body.data;
}
