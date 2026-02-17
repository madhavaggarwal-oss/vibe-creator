export interface ProcessedImage {
  dataUrl: string;
  name: string;
}

export interface PendingImage {
  dataUrl: string;
  name: string;
  loading: boolean;
}

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.8;

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      const isPng = file.type === "image/png";
      const dataUrl = canvas.toDataURL(
        isPng ? "image/png" : "image/jpeg",
        isPng ? undefined : JPEG_QUALITY
      );
      resolve(dataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image: ${file.name}`));
    };

    img.src = url;
  });
}

export async function processImageFiles(
  files: FileList
): Promise<ProcessedImage[]> {
  const results: ProcessedImage[] = [];

  for (const file of Array.from(files)) {
    if (!file.type.startsWith("image/")) continue;
    const dataUrl = await resizeImage(file);
    results.push({ dataUrl, name: file.name });
  }

  return results;
}

export function extractMimeAndBase64(dataUrl: string): {
  mimeType: string;
  base64: string;
} {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) {
    return { mimeType: "image/jpeg", base64: dataUrl };
  }
  return { mimeType: match[1], base64: match[2] };
}
