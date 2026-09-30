import { AuthRequestError } from './auth-api';

/** Calls the gateway with the session cookies and turns failures into readable `AuthRequestError`s. */
export async function requestJson<T>(
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers:
        body === undefined ? undefined : { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AuthRequestError(
      'Could not reach the server. Check your connection and try again.',
      0,
    );
  }

  const data = (await response.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
    message?: string;
  } | null;

  if (!response.ok || data?.success === false) {
    throw new AuthRequestError(
      response.status === 429
        ? 'You’ve sent a lot of requests. Wait a few minutes, then try again.'
        : (data?.error ??
            data?.message ??
            (response.status >= 500
              ? 'The server is unavailable right now. Please try again later.'
              : 'Something went wrong. Please try again.')),
      response.status,
    );
  }
  return data as T;
}
