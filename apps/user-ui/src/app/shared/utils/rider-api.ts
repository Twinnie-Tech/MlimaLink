/** Client for rider sign-in (auth-service) and rider jobs (shop API), both reached through the gateway. */

import type {
  ApiResponse,
  RiderJob,
  RiderProfile,
  RiderProfileInput,
} from '@org/models';
import { isUnauthorized } from './auth-api';
import { requestJson } from './request-json';

export type AuthRider = {
  id: string;
  name: string;
  email: string;
  phone_number: string;
};

type MessageResponse = { success: true; message: string };
type RiderResponse = MessageResponse & { rider: AuthRider };

export const RIDER_QUERY_KEY = ['rider'];
export const RIDER_PROFILE_KEY = ['rider-profile'];
export const RIDER_JOBS_KEY = ['rider-jobs'];
export const RIDER_DELIVERIES_KEY = ['rider-deliveries'];

const auth = <T>(method: 'GET' | 'POST', path: string, body?: unknown) =>
  requestJson<T>(method, `/api/auth/${path}`, body);

export function refreshRiderSession() {
  return auth<MessageResponse>('POST', 'refresh-token/rider');
}

/** Retries once after renewing an expired rider session. */
async function withRiderSession<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
  }
  await refreshRiderSession();
  return request();
}

/** The signed-in rider, or null when no rider is signed in. */
export async function getLoggedInRider(): Promise<AuthRider | null> {
  try {
    return await withRiderSession(
      async () =>
        (await auth<{ rider: AuthRider }>('GET', 'logged-in-rider')).rider,
    );
  } catch (error) {
    if (isUnauthorized(error)) return null;
    throw error;
  }
}

export function registerRider(body: {
  name: string;
  email: string;
  phone_number: string;
  password: string;
}) {
  return auth<MessageResponse>('POST', 'register/rider', body);
}

export function verifyRider(body: {
  name: string;
  email: string;
  phone_number: string;
  password: string;
  otp: string;
}) {
  return auth<RiderResponse>('POST', 'verify/rider', body);
}

export function loginRider(body: {
  email: string;
  password: string;
  rememberMe: boolean;
}) {
  return auth<RiderResponse>('POST', 'login/rider', body);
}

export function logoutRider() {
  return auth<MessageResponse>('POST', 'logout/rider');
}

export async function getRiderProfile(): Promise<RiderProfile> {
  const response = await withRiderSession(() =>
    requestJson<ApiResponse<RiderProfile>>('GET', '/api/rider/profile'),
  );
  return response.data;
}

export function saveRiderProfile(profile: RiderProfileInput) {
  return withRiderSession(() =>
    requestJson<ApiResponse<RiderProfile>>(
      'PUT',
      '/api/rider/profile',
      profile,
    ),
  );
}

export async function listRiderJobs(): Promise<RiderJob[]> {
  const response = await withRiderSession(() =>
    requestJson<ApiResponse<RiderJob[]>>('GET', '/api/rider/jobs'),
  );
  return response.data;
}

export async function listRiderDeliveries(): Promise<RiderJob[]> {
  const response = await withRiderSession(() =>
    requestJson<ApiResponse<RiderJob[]>>('GET', '/api/rider/deliveries'),
  );
  return response.data;
}

const jobAction = <T>(path: string, body?: unknown) =>
  withRiderSession(() =>
    requestJson<ApiResponse<T>>('POST', `/api/rider/${path}`, body ?? {}),
  );

export const acceptJob = (id: string) =>
  jobAction<RiderJob>(`jobs/${encodeURIComponent(id)}/accept`);

export const declineJob = (id: string) =>
  jobAction<null>(`jobs/${encodeURIComponent(id)}/decline`);

export const pickUpDelivery = (id: string) =>
  jobAction<RiderJob>(`deliveries/${encodeURIComponent(id)}/pickup`);

export const completeDelivery = (id: string, code: string) =>
  jobAction<RiderJob>(`deliveries/${encodeURIComponent(id)}/deliver`, {
    code,
  });

export const shareDeliveryLocation = (
  id: string,
  point: { lat: number; lng: number },
) => jobAction<null>(`deliveries/${encodeURIComponent(id)}/location`, point);
