import { GoogleGenAI } from "@google/genai";
import { put } from "@vercel/blob";
import sharp from "sharp";

interface ImageMarker {
  full: string; // e.g. __IMG:a sunset over mountains__
  description: string;
  width: number;
  height: number;
}

/** New format: __IMG:description__ (no aspect ratio) */
const MARKER_REGEX = /__IMG:([^_]+(?:_(?!_)[^_]*)*)__/g;

/** Legacy format: __IMG[16:9]:description__ */
const LEGACY_MARKER_REGEX = /__IMG\[\d+:\d+\]:([^_]+(?:_(?!_)[^_]*)*)__/g;

const MAX_IMAGES = 12;
const MIN_DIMENSION = 128; // Never generate images smaller than this

/** Tailwind spacing scale → pixels */
const TW_SCALE: Record<string, number> = {
  "12": 48, "16": 64, "20": 80, "24": 96, "32": 128,
  "40": 160, "48": 192, "56": 224, "64": 256, "72": 288,
  "80": 320, "96": 384,
};

/**
 * Normalize legacy __IMG[N:N]:desc__ markers to __IMG:desc__ format.
 */
function normalizeLegacyMarkers(
  files: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== "string") {
      result[path] = content;
      continue;
    }
    result[path] = content.replace(
      /__IMG\[\d+:\d+\]:([^_]+(?:_(?!_)[^_]*)*)__/g,
      (_, desc) => `__IMG:${desc}__`
    );
  }
  return result;
}

/**
 * For each marker, grab ~400 chars before it from the file content
 * to capture parent container Tailwind classes.
 */
function extractMarkerContexts(
  files: Record<string, string>,
  markers: ImageMarker[]
): Map<string, string> {
  const contextMap = new Map<string, string>();

  for (const marker of markers) {
    if (contextMap.has(marker.full)) continue;

    for (const content of Object.values(files)) {
      if (typeof content !== "string") continue;
      const idx = content.indexOf(marker.full);
      if (idx === -1) continue;

      const start = Math.max(0, idx - 400);
      contextMap.set(marker.full, content.substring(start, idx));
      break;
    }
  }

  return contextMap;
}

/**
 * Clamp dimensions so no side is smaller than MIN_DIMENSION,
 * preserving aspect ratio by scaling up.
 */
function clampDims(dims: { width: number; height: number }): { width: number; height: number } {
  const { width, height } = dims;
  if (width >= MIN_DIMENSION && height >= MIN_DIMENSION) return dims;
  const scale = Math.max(MIN_DIMENSION / width, MIN_DIMENSION / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Parse Tailwind classes from surrounding context to determine image dimensions.
 * Priority order:
 * 1. rounded-full + small w-N h-N (≤200px) → avatar 128×128
 * 2. aspect-square → 512×512
 * 3. aspect-video → 800×450
 * 4. aspect-[W/H] → compute from 800px base width
 * 5. h-{N} / md:h-{N} → Tailwind scale mapping, width from aspect or 16:9
 * 6. Arbitrary h-[Npx] / h-[Nrem] → parse directly
 * 7. Fixed w-N h-N → map both
 * 8. Default → 800×600
 */
function parseDimsFromContext(context: string): { width: number; height: number } {
  const isRoundedFull = /rounded-full/.test(context);

  // Extract w-N, h-N, and size-N values from Tailwind classes
  const wMatch = context.match(/(?:^|\s)w-(\d+)(?:\s|"|')/);
  const hMatch = context.match(/(?:^|\s)h-(\d+)(?:\s|"|')/);
  const sizeMatch = context.match(/(?:^|\s)size-(\d+)(?:\s|"|')/);

  // Helper: resolve a TW scale value for w or h (also considers size-N)
  const resolveW = (): number | undefined => TW_SCALE[wMatch?.[1] ?? ""] || TW_SCALE[sizeMatch?.[1] ?? ""];
  const resolveH = (): number | undefined => TW_SCALE[hMatch?.[1] ?? ""] || TW_SCALE[sizeMatch?.[1] ?? ""];

  // 1. Avatar detection: rounded-full + any small dimension (w, h, or size)
  if (isRoundedFull) {
    const wPx = resolveW();
    const hPx = resolveH();
    if ((wPx && wPx <= 200) || (hPx && hPx <= 200)) {
      return { width: 128, height: 128 };
    }
  }

  // 2. aspect-square
  if (/aspect-square/.test(context)) {
    return { width: 512, height: 512 };
  }

  // 3. aspect-video
  if (/aspect-video/.test(context)) {
    return { width: 800, height: 450 };
  }

  // 4. aspect-[W/H]
  const aspectCustom = context.match(/aspect-\[(\d+)\/(\d+)\]/);
  if (aspectCustom) {
    const aw = parseInt(aspectCustom[1], 10);
    const ah = parseInt(aspectCustom[2], 10);
    if (aw > 0 && ah > 0) {
      const baseWidth = 800;
      return { width: baseWidth, height: Math.round(baseWidth * (ah / aw)) };
    }
  }

  // 5. h-{N} with Tailwind scale (also check md:h-{N})
  const hScaleMatch = context.match(/(?:^|\s|md:)h-(\d+)(?:\s|"|')/);
  if (hScaleMatch && TW_SCALE[hScaleMatch[1]]) {
    const hPx = TW_SCALE[hScaleMatch[1]];
    // Check for accompanying aspect ratio
    if (aspectCustom) {
      const aw = parseInt(aspectCustom[1], 10);
      const ah = parseInt(aspectCustom[2], 10);
      return { width: Math.round(hPx * (aw / ah)), height: hPx };
    }
    // Default to 16:9 width from height
    return clampDims({ width: Math.round(hPx * (16 / 9)), height: hPx });
  }

  // 6. Arbitrary h-[Npx] or h-[Nrem]
  const hArbitrary = context.match(/h-\[(\d+)(px|rem)\]/);
  if (hArbitrary) {
    const val = parseInt(hArbitrary[1], 10);
    const hPx = hArbitrary[2] === "rem" ? val * 16 : val;
    return clampDims({ width: Math.round(hPx * (16 / 9)), height: hPx });
  }

  // 7. Fixed w-N h-N or size-N (both dimensions available)
  const wPx = resolveW();
  const hPx = resolveH();
  if (wPx && hPx) {
    return clampDims({ width: wPx, height: hPx });
  }

  // 8. Default
  return { width: 800, height: 600 };
}

/**
 * Scan all file contents for __IMG:description__ markers.
 * Extracts surrounding context and parses container dimensions.
 * Returns deduplicated list with computed width/height.
 */
export function extractImageMarkers(
  files: Record<string, string>
): ImageMarker[] {
  const seen = new Set<string>();
  const markers: ImageMarker[] = [];

  for (const content of Object.values(files)) {
    if (typeof content !== "string") continue;
    let match: RegExpExecArray | null;
    MARKER_REGEX.lastIndex = 0;
    while ((match = MARKER_REGEX.exec(content)) !== null) {
      const full = match[0];
      if (seen.has(full)) continue;
      seen.add(full);
      const description = match[1].trim();
      markers.push({ full, description, width: 800, height: 600 }); // defaults, overwritten below
    }
  }

  // Extract context and parse dimensions
  const contextMap = extractMarkerContexts(files, markers);
  for (const marker of markers) {
    const ctx = contextMap.get(marker.full) || "";
    const dims = parseDimsFromContext(ctx);
    marker.width = dims.width;
    marker.height = dims.height;
    console.log(`[image-gen] "${marker.description.slice(0, 40)}..." → ${dims.width}×${dims.height}px`);
  }

  return markers;
}

/**
 * Resize and compress an image buffer to JPEG using sharp.
 * Uses "attention" strategy to smart-crop around faces/points of interest.
 */
async function compressImage(
  buffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> {
  return sharp(buffer)
    .resize(width, height, {
      fit: "cover",
      position: sharp.strategy.attention,
    })
    .jpeg({ quality: 75 })
    .toBuffer();
}

/**
 * Generate images via Gemini and upload to Vercel Blob.
 * Returns a map from marker string → blob URL.
 */
async function generateAndUploadImages(
  markers: ImageMarker[]
): Promise<Map<string, string>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey });
  const capped = markers.slice(0, MAX_IMAGES);
  const urlMap = new Map<string, string>();

  const results = await Promise.allSettled(
    capped.map(async (marker) => {
      const generate = async (): Promise<{ marker: string; url: string }> => {
        const prompt = `Generate a high-quality, photorealistic image: ${marker.description}. Image dimensions: ${marker.width}x${marker.height} pixels. No text or watermarks.`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-image",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        });

        const parts = response.candidates?.[0]?.content?.parts;
        if (!parts) throw new Error("No parts in response");

        const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));
        if (!imagePart?.inlineData) throw new Error("No image data in response");

        const { data } = imagePart.inlineData;
        if (!data) throw new Error("Empty image data");

        const rawBuffer = Buffer.from(data, "base64");
        const compressed = await compressImage(rawBuffer, marker.width, marker.height);
        const filename = `generated/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

        const blob = await put(filename, compressed, {
          access: "public",
          contentType: "image/jpeg",
        });

        console.log(`[image-gen] ${marker.width}×${marker.height} image: ${(rawBuffer.length / 1024).toFixed(0)}KB → ${(compressed.length / 1024).toFixed(0)}KB`);

        return { marker: marker.full, url: blob.url };
      };

      // Retry once on failure
      try {
        return await generate();
      } catch (err) {
        console.warn(`[image-gen] First attempt failed, retrying...`, (err as Error).message);
        return await generate();
      }
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      urlMap.set(result.value.marker, result.value.url);
    } else {
      console.warn("[image-gen] Failed to generate image:", result.reason);
    }
  }

  return urlMap;
}

/**
 * Replace all image markers in file contents with blob URLs.
 * Unresolved markers get a placehold.co fallback using marker dimensions.
 */
export function replaceImageMarkers(
  files: Record<string, string>,
  urlMap: Map<string, string>,
  markers: ImageMarker[]
): Record<string, string> {
  // Build a lookup from marker full string → dims for fallback
  const dimsLookup = new Map<string, { width: number; height: number }>();
  for (const m of markers) {
    dimsLookup.set(m.full, { width: m.width, height: m.height });
  }

  const result: Record<string, string> = {};

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== "string") {
      result[path] = content;
      continue;
    }

    result[path] = content.replace(MARKER_REGEX, (full) => {
      const url = urlMap.get(full);
      if (url) return url;

      // Fallback: placehold.co with detected dimensions
      const dims = dimsLookup.get(full) || { width: 800, height: 600 };
      return `https://placehold.co/${dims.width}x${dims.height}/1a1a2e/ffffff?text=Image`;
    });
  }

  return result;
}

/**
 * Orchestrator: normalize legacy markers → extract markers → generate images → replace markers.
 * No-ops if no markers found or BLOB_READ_WRITE_TOKEN is missing.
 */
export async function processImageMarkers(
  files: Record<string, string>
): Promise<Record<string, string>> {
  // Backward compat: normalize __IMG[N:N]:desc__ → __IMG:desc__
  const normalized = normalizeLegacyMarkers(files);

  const markers = extractImageMarkers(normalized);
  if (markers.length === 0) return normalized;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn("[image-gen] BLOB_READ_WRITE_TOKEN not set, using fallbacks");
    return replaceImageMarkers(normalized, new Map(), markers);
  }

  console.log(`[image-gen] Processing ${markers.length} image markers...`);
  const urlMap = await generateAndUploadImages(markers);
  console.log(`[image-gen] Generated ${urlMap.size}/${markers.length} images`);

  return replaceImageMarkers(normalized, urlMap, markers);
}
