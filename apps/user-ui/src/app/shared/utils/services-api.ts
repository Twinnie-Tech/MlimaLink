/** Client for the provider and service request endpoints of the shop API, reached through the gateway. */

import type {
  ApiResponse,
  Provider,
  ServiceRequest,
  ServiceRequestInput,
} from '@org/models';
import {
  AuthRequestError,
  isUnauthorized,
  refreshUserSession,
} from './auth-api';
import { requestJson } from './request-json';

/** Retries once after renewing an expired session. */
export async function withSession<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
  }
  await refreshUserSession();
  return request();
}

/** A provider's public profile and services, or null when they haven't set up a profile. */
export async function getProvider(shopId: string): Promise<Provider | null> {
  try {
    const response = await requestJson<ApiResponse<Provider>>(
      'GET',
      `/api/providers/${encodeURIComponent(shopId)}`,
    );
    return response.data;
  } catch (error) {
    if (error instanceof AuthRequestError && error.status === 404) return null;
    throw error;
  }
}

export function requestService(request: ServiceRequestInput) {
  return withSession(() =>
    requestJson<ApiResponse<ServiceRequest>>(
      'POST',
      '/api/service-requests',
      request,
    ),
  );
}

export async function listMyServiceRequests(): Promise<ServiceRequest[]> {
  const response = await withSession(() =>
    requestJson<ApiResponse<ServiceRequest[]>>(
      'GET',
      '/api/service-requests/mine',
    ),
  );
  return response.data;
}
