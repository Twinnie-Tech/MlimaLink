/** Client for the seller service profile and service request endpoints of the shop API, reached through the gateway. */

import type {
  ApiResponse,
  OwnServiceProfile,
  ServiceProfileInput,
  ServiceRequest,
  ServiceRequestStatus,
} from '@org/models';
import { requestJson, withSession } from './seller-api';

const PROFILE_URL = '/api/seller/service-profile';
const REQUESTS_URL = '/api/seller/service-requests';

export async function getMyServiceProfile(): Promise<OwnServiceProfile | null> {
  const response = await withSession(() =>
    requestJson<ApiResponse<OwnServiceProfile | null>>('GET', PROFILE_URL),
  );
  return response.data;
}

export function saveServiceProfile(profile: ServiceProfileInput) {
  return withSession(() =>
    requestJson<ApiResponse<OwnServiceProfile>>('PUT', PROFILE_URL, profile),
  );
}

export async function listServiceRequests(): Promise<ServiceRequest[]> {
  const response = await withSession(() =>
    requestJson<ApiResponse<ServiceRequest[]>>('GET', REQUESTS_URL),
  );
  return response.data;
}

export function updateServiceRequest(
  id: string,
  status: ServiceRequestStatus,
  note?: string,
) {
  return withSession(() =>
    requestJson<ApiResponse<ServiceRequest>>(
      'PATCH',
      `${REQUESTS_URL}/${encodeURIComponent(id)}`,
      note ? { status, note } : { status },
    ),
  );
}
