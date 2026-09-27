/** Client for the auth-service endpoints, reached through the API gateway at /api/auth. */

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  /** ISO date string. */
  createdAt?: string;
};

type MessageResponse = { success: true; message: string };
type UserResponse = MessageResponse & { user: AuthUser };

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Mirrors the auth-service rule: 8+ chars with upper, lower, digit and special character. */
export const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export class AuthRequestError extends Error {
  /** HTTP status, or 0 when the server could not be reached. */
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AuthRequestError';
  }
}

async function requestAuth<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${path}`, {
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
      data?.error ??
        data?.message ??
        (response.status >= 500
          ? 'The server is unavailable right now. Please try again later.'
          : 'Something went wrong. Please try again.'),
      response.status,
    );
  }

  return data as T;
}

function postAuth<T>(path: string, body: unknown): Promise<T> {
  return requestAuth<T>('POST', path, body);
}

const isUnauthorized = (error: unknown) =>
  error instanceof AuthRequestError && error.status === 401;

/**
 * Returns the signed-in user, or null when nobody is signed in.
 * An expired access token is renewed once with the refresh token cookie.
 */
export async function getLoggedInUser(): Promise<AuthUser | null> {
  const fetchUser = async () =>
    (await requestAuth<{ user: AuthUser }>('GET', 'logged-in-user')).user;

  try {
    return await fetchUser();
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
  }

  try {
    await requestAuth('POST', 'refresh-token');
  } catch (error) {
    if (isUnauthorized(error)) return null;
    throw error;
  }

  return fetchUser();
}

export function logoutUser() {
  return requestAuth<MessageResponse>('POST', 'logout');
}

export function loginUser(body: {
  email: string;
  password: string;
  rememberMe: boolean;
}) {
  return postAuth<UserResponse>('login/user', body);
}

export function registerUser(body: {
  name: string;
  email: string;
  password: string;
}) {
  return postAuth<MessageResponse>('register/user', body);
}

export function verifyUser(body: {
  name: string;
  email: string;
  password: string;
  otp: string;
}) {
  return postAuth<UserResponse>('verify/user', body);
}

export function forgotPassword(body: { email: string }) {
  return postAuth<MessageResponse>('forgot-password/user', body);
}
