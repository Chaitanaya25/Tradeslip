import { PHOTO_JPEG_QUALITY, fitWithin } from "./job-photos";

/**
 * Browser only. Decodes a photo (honouring EXIF rotation), scales it so the
 * longest side is at most 1600px and re-encodes it as JPEG (quality ~0.8).
 */
export async function compressToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");
    // JPEG has no transparency: put PNGs with transparent areas on white.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_JPEG_QUALITY));
    if (!blob) throw new Error("Could not encode the photo.");
    return blob;
  } finally {
    bitmap.close();
  }
}
