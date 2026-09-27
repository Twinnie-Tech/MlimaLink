/** Client for the auth-service endpoints, reached through the API gateway at /api/auth. */

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
};

type MessageResponse = { success: true; message: string };
type UserResponse = MessageResponse & { user: AuthUser };

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Mirrors the auth-service rule: 8+ chars with upper, lower, digit and special character. */
export const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

async function postAuth<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      'Could not reach the server. Check your connection and try again.',
    );
  }

  const data = (await response.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
    message?: string;
  } | null;

  if (!response.ok || data?.success === false) {
    throw new Error(
      data?.error ??
        data?.message ??
        (response.status >= 500
          ? 'The server is unavailable right now. Please try again later.'
          : 'Something went wrong. Please try again.'),
    );
  }

  return data as T;
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
