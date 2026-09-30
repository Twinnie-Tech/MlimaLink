import { MAX_IMAGE_DATA_URL_LENGTH } from '@org/models/catalog';

const MAX_EDGE = 1200;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that image.'));
    image.src = url;
  });
}

/**
 * Shrinks a photo to at most 1200px on its longest side and returns it as a JPEG data
 * URL small enough for the product API, lowering the quality until it fits.
 */
export async function photoToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not read that image.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.85, 0.75, 0.6, 0.45]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) return dataUrl;
    }
    throw new Error(
      `${file.name} is too detailed to upload. Try a smaller photo.`,
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
