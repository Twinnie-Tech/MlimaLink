import { MAX_UPLOAD_DATA_URL_LENGTH } from '@org/models/catalog';

/** ImageKit makes smaller copies for display, so keep enough detail for zooming. */
const MAX_EDGE = 2000;
const UPLOADABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that image.'));
    image.src = url;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Returns the photo as a data URL for the upload API. Photos that already fit are sent
 * untouched; others are shrunk to at most 2000px on their longest side and saved as
 * JPEG, lowering the quality until they fit.
 */
export async function photoToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const longestEdge = Math.max(image.width, image.height);

    if (
      UPLOADABLE_TYPES.includes(file.type) &&
      longestEdge <= MAX_EDGE &&
      file.size * 1.37 < MAX_UPLOAD_DATA_URL_LENGTH
    ) {
      return await readAsDataUrl(file);
    }

    const scale = Math.min(1, MAX_EDGE / longestEdge);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not read that image.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.9, 0.82, 0.72, 0.6]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= MAX_UPLOAD_DATA_URL_LENGTH) return dataUrl;
    }
    throw new Error(
      `${file.name} is too detailed to upload. Try a smaller photo.`,
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
