/** Client for the seller photo endpoints of the shop API, reached through the gateway at /api/seller/product-images. */

import type { ApiResponse, UploadedImage } from '@org/models';
import { photoToDataUrl } from './image';
import { requestJson, withSession } from './seller-api';

const IMAGES_URL = '/api/seller/product-images';

/** Shrinks the photo and uploads it to the shop's ImageKit folder as base64. */
export async function uploadProductImage(file: File): Promise<UploadedImage> {
  const dataUrl = await photoToDataUrl(file);
  const response = await withSession(() =>
    requestJson<ApiResponse<UploadedImage>>('POST', IMAGES_URL, {
      fileName: file.name,
      file: dataUrl,
    }),
  );
  return response.data;
}

export function deleteProductImage(fileId: string) {
  return withSession(() =>
    requestJson<ApiResponse<null>>(
      'DELETE',
      `${IMAGES_URL}/${encodeURIComponent(fileId)}`,
    ),
  );
}
