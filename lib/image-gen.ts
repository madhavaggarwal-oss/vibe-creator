import { GoogleGenAI } from "@google/genai";
import { put } from "@vercel/blob";
import sharp from "sharp";
import type { PendingImageEntry } from "./storage";

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

const MAX_IMAGES = Infinity;
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
 * Compress an image buffer to JPEG using sharp.
 * Does NOT crop — just caps the longest edge at 1200px and compresses.
 * The browser's CSS object-cover handles display-time fitting, which is
 * more accurate because it knows the actual rendered container size.
 */
async function compressImage(
  buffer: Buffer,
): Promise<Buffer> {
  return sharp(buffer)
    .resize(1200, 1200, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/**
 * Generate images via Gemini and upload to Vercel Blob.
 * Returns a map from marker string → blob URL.
 */
const MAX_CONCURRENT = 3; // Limit parallel Gemini image API calls to avoid rate limiting
const MAX_RETRIES = 3;

/** Simple delay helper */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process items with a concurrency limit.
 * Runs at most `limit` tasks in parallel.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      try {
        results[idx] = { status: "fulfilled", value: await fn(items[idx]) };
      } catch (reason) {
        results[idx] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function generateAndUploadImages(
  markers: ImageMarker[]
): Promise<Map<string, string>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const ai = new GoogleGenAI({ apiKey });
  const capped = markers.slice(0, MAX_IMAGES);
  const urlMap = new Map<string, string>();

  const results = await mapWithConcurrency(capped, MAX_CONCURRENT, async (marker) => {
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
      const compressed = await compressImage(rawBuffer);
      const filename = `generated/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

      const blob = await put(filename, compressed, {
        access: "public",
        contentType: "image/jpeg",
      });

      console.log(`[image-gen] ${marker.width}×${marker.height} image: ${(rawBuffer.length / 1024).toFixed(0)}KB → ${(compressed.length / 1024).toFixed(0)}KB`);

      return { marker: marker.full, url: blob.url };
    };

    // Retry with exponential backoff
    let lastErr: Error | undefined;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await generate();
      } catch (err) {
        lastErr = err as Error;
        console.warn(`[image-gen] Attempt ${attempt}/${MAX_RETRIES} failed: ${lastErr.message}`);
        if (attempt < MAX_RETRIES) {
          await delay(1000 * attempt); // 1s, 2s backoff
        }
      }
    }
    throw lastErr;
  });

  for (const result of results) {
    if (result.status === "fulfilled") {
      urlMap.set(result.value.marker, result.value.url);
    } else {
      console.warn("[image-gen] Failed to generate image after retries:", result.reason);
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

    result[path] = content.replace(MARKER_REGEX, (full, desc) => {
      const url = urlMap.get(full);
      if (url) return url;

      // Fallback: placehold.co with subtle gradient and short description
      const dims = dimsLookup.get(full) || { width: 800, height: 600 };
      const shortDesc = (desc || "Image").trim().slice(0, 30);
      return `https://placehold.co/${dims.width}x${dims.height}/e2e8f0/64748b?text=${encodeURIComponent(shortDesc)}`;
    });
  }

  return result;
}

/**
 * Patterns that indicate a broken/placeholder image src in AI-generated code.
 * These get converted to __IMG:description__ markers so the image pipeline can replace them.
 */
const BROKEN_SRC_PATTERNS = [
  /^\/placeholder/i,            // /placeholder.svg, /placeholder.png, etc.
  /^\.?\/?assets\//i,           // ./assets/image.jpg, /assets/hero.png
  /^\.?\/?images?\//i,          // ./images/photo.jpg, /image/hero.png
  /^\/public\//i,               // /public/image.jpg
  /^https?:\/\/via\.placeholder/i, // via.placeholder.com
  /^https?:\/\/placehold\./i,   // placehold.co, placehold.it
  /^https?:\/\/placekitten/i,   // placekitten.com
  /^https?:\/\/picsum/i,        // picsum.photos
  /^https?:\/\/dummyimage/i,    // dummyimage.com
  /^https?:\/\/fakeimg/i,       // fakeimg.pl
  /^https?:\/\/loremflickr/i,   // loremflickr.com
  /^data:image\/svg\+xml/i,     // inline SVG data URIs used as placeholders
];

/** Src values that are effectively empty/broken */
function isBrokenSrc(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed || trimmed === "#" || trimmed === "about:blank") return true;
  return BROKEN_SRC_PATTERNS.some((re) => re.test(trimmed));
}

/** Already a valid image: blob URL, data URI (non-SVG), or our marker format */
function isValidImageSrc(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("__IMG:")) return true;
  if (trimmed.startsWith("https://") && trimmed.includes("blob.vercel-storage.com")) return true;
  if (trimmed.startsWith("data:image/") && !trimmed.startsWith("data:image/svg+xml")) return true;
  return false;
}

/**
 * Scan TSX/JSX/HTML files for <img> tags with broken/placeholder/empty src attributes
 * and convert them to __IMG:description__ markers using the alt text or context.
 *
 * This catches cases where the AI doesn't use the marker format:
 * - Empty src: <img src="" alt="Team photo" />
 * - Placeholder paths: <img src="/placeholder.svg" alt="Hero" />
 * - External placeholder services: <img src="https://via.placeholder.com/800x600" />
 */
function fixBrokenImageSrcs(
  files: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  let fixCount = 0;

  // Simple src extraction — avoids complex regex that can cause stack overflow on large files
  const SRC_REGEX = /src\s*=\s*"([^"]*)"/i;
  const ALT_REGEX = /alt\s*=\s*"([^"]*)"/i;

  for (const [filePath, content] of Object.entries(files)) {
    if (typeof content !== "string" || !/\.(tsx|jsx|html)$/.test(filePath)) {
      result[filePath] = content;
      continue;
    }

    // Process line-by-line to avoid catastrophic regex backtracking
    const lines = content.split("\n");
    const fixedLines = lines.map((line) => {
      if (!line.includes("<img") && !line.includes("src=")) return line;

      const srcMatch = line.match(SRC_REGEX);
      if (!srcMatch) return line;
      const src = srcMatch[1].trim();

      // Already valid — leave it alone
      if (isValidImageSrc(src)) return line;
      // Not broken and looks like a real URL
      if (!isBrokenSrc(src) && src.startsWith("http")) return line;

      // Skip small icon-sized images — don't replace icons with AI-generated photos
      // Detect by className having small fixed dimensions (h-4 to h-12, w-4 to w-12)
      const clsMatch = line.match(/className="([^"]*)"/);
      const cls = clsMatch ? clsMatch[1] : "";
      const isSmallIcon = /\b[wh]-(?:[4-9]|1[0-2])\b/.test(cls) && !cls.includes("w-full");
      if (isSmallIcon) {
        // Remove the broken src entirely — leave a transparent placeholder
        return line.replace(SRC_REGEX, 'src=""');
      }

      // Extract alt text for the marker description
      const altMatch = line.match(ALT_REGEX);
      const alt = (altMatch?.[1] ?? "").trim();

      let description: string;
      if (alt && alt.length > 3 && !/^(image|photo|picture|img|placeholder)$/i.test(alt)) {
        description = `high quality professional photo of ${alt.toLowerCase()}, well-lit, detailed`;
      } else {
        const contextHint = filePath.replace(/.*\//, "").replace(/\.(tsx|jsx|html)$/, "");
        description = `high quality professional photo for ${contextHint.toLowerCase()} section, well-lit, modern setting`;
      }

      const marker = `__IMG:${description}__`;
      fixCount++;
      return line.replace(SRC_REGEX, `src="${marker}"`);
    });

    result[filePath] = fixedLines.join("\n");
  }

  if (fixCount > 0) {
    console.log(`[image-gen] Fixed ${fixCount} broken/placeholder image src attributes → markers`);
  }

  return result;
}

/**
 * Ensure every content <img> tag's immediate parent div has overflow-hidden
 * and explicit sizing classes. This prevents images from bleeding out of
 * containers (especially with hover:scale) and ensures parseDimsFromContext
 * can detect proper dimensions instead of defaulting to 800×600.
 */
function ensureImageContainers(
  files: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  let fixCount = 0;

  for (const [filePath, content] of Object.entries(files)) {
    if (typeof content !== "string" || !/\.(tsx|jsx|html)$/.test(filePath)) {
      result[filePath] = content;
      continue;
    }

    let modified = content;
    const imgRegex = /<img\b/g;
    let imgMatch: RegExpExecArray | null;
    const replacements: Array<{ oldStr: string; newStr: string }> = [];

    while ((imgMatch = imgRegex.exec(modified)) !== null) {
      const imgIdx = imgMatch.index;

      // Extract the full <img ... > or <img ... /> tag
      const imgTagEnd = modified.indexOf(">", imgIdx);
      if (imgTagEnd === -1) continue;
      const imgTag = modified.substring(imgIdx, imgTagEnd + 1);

      // Extract img className
      const imgClsMatch = imgTag.match(/className="([^"]*)"/);
      const imgCls = imgClsMatch ? imgClsMatch[1] : "";

      // Skip logos/icons (same heuristics as ensureImageFitClasses)
      if (imgCls.includes("object-contain")) continue;
      if (/\bh-\d+\b/.test(imgCls) && imgCls.includes("w-auto")) continue;
      if (/\bw-\d+\b/.test(imgCls) && /\bh-\d+\b/.test(imgCls) && !imgCls.includes("w-full")) continue;

      // Look backward up to 500 chars for parent div
      const searchStart = Math.max(0, imgIdx - 500);
      const before = modified.substring(searchStart, imgIdx);

      // Find all <div className="..."> in the preceding text
      const divRegex = /<div\s[^>]*?className="([^"]*)"[^>]*>/g;
      const divMatches: RegExpExecArray[] = [];
      let dm: RegExpExecArray | null;
      while ((dm = divRegex.exec(before)) !== null) divMatches.push(dm);
      if (divMatches.length === 0) continue;

      // Find the nearest open parent div by checking div balance
      let parentCls: string | null = null;
      let fullDivTag: string | null = null;

      for (let i = divMatches.length - 1; i >= 0; i--) {
        const dm = divMatches[i];
        const textAfterDiv = before.substring(dm.index! + dm[0].length);
        const opens = (textAfterDiv.match(/<div[\s>]/g) || []).length;
        const closes = (textAfterDiv.match(/<\/div>/g) || []).length;
        // This div is still open at the img position if closes <= opens
        if (closes <= opens) {
          parentCls = dm[1];
          fullDivTag = dm[0];
          break;
        }
      }

      if (!parentCls || !fullDivTag) continue;

      // Check what's already present
      const hasOverflowHidden = parentCls.includes("overflow-hidden");
      const hasSizing =
        /\baspect-/.test(parentCls) ||
        /\bh-\[/.test(parentCls) ||
        /\bh-\d+\b/.test(parentCls) ||
        /\b(?:min-)?h-(?:screen|full|dvh|svh|lvh)\b/.test(parentCls) ||
        /\binset-/.test(parentCls);

      if (hasOverflowHidden && hasSizing) continue;

      // Build updated className
      let newCls = parentCls;
      if (!hasOverflowHidden) newCls = (newCls + " overflow-hidden").trim();
      if (!hasSizing) newCls = (newCls + " w-full aspect-video").trim();

      if (newCls !== parentCls) {
        const newDivTag = fullDivTag.replace(
          `className="${parentCls}"`,
          `className="${newCls}"`
        );
        replacements.push({ oldStr: fullDivTag, newStr: newDivTag });
        fixCount++;
      }
    }

    // Apply deduplicated replacements
    const applied = new Set<string>();
    for (const { oldStr, newStr } of replacements) {
      if (applied.has(oldStr)) continue;
      applied.add(oldStr);
      modified = modified.split(oldStr).join(newStr);
    }

    result[filePath] = modified;
  }

  if (fixCount > 0) {
    console.log(
      `[image-gen] ensureImageContainers: fixed ${fixCount} image wrapper divs (added overflow-hidden/sizing)`
    );
  }

  return result;
}

/**
 * Ensure all <img> tags in TSX/JSX/HTML files have object-cover w-full h-full classes
 * so images always fill their containers without being cut off or leaving gaps.
 * This is a code-level enforcement — LLMs sometimes omit these classes.
 */
function ensureImageFitClasses(
  files: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  let fixCount = 0;

  const REQUIRED_CLASSES = ["object-cover", "w-full", "h-full"];

  for (const [filePath, content] of Object.entries(files)) {
    if (typeof content !== "string" || !/\.(tsx|jsx|html)$/.test(filePath)) {
      result[filePath] = content;
      continue;
    }

    // Process line-by-line to avoid regex backtracking on large files
    const lines = content.split("\n");
    const fixedLines = lines.map((line) => {
      if (!line.includes("<img")) return line;

      // Extract className if present
      const classMatch = line.match(/className="([^"]*)"/);
      const cls = classMatch ? classMatch[1] : "";

      // SKIP logos/icons — they have intentional fixed sizing
      if (cls.includes("object-contain")) return line;
      if (/\bh-\d+\b/.test(cls) && cls.includes("w-auto")) return line;
      if (/\bw-\d+\b/.test(cls) && /\bh-\d+\b/.test(cls) && !cls.includes("w-full")) return line;

      // For content images: ensure object-cover w-full h-full
      if (!classMatch) {
        // No className at all — add one
        fixCount++;
        return line.replace(/<img\b/, `<img className="${REQUIRED_CLASSES.join(" ")}"`);
      }

      const missing = REQUIRED_CLASSES.filter((c) => !cls.includes(c));
      if (missing.length === 0) return line;

      fixCount++;
      const updated = (cls + " " + missing.join(" ")).trim();
      return line.replace(`className="${cls}"`, `className="${updated}"`);
    });

    result[filePath] = fixedLines.join("\n");
  }

  if (fixCount > 0) {
    console.log(`[image-gen] Ensured object-cover w-full h-full on ${fixCount} content <img> tags (skipped logos/icons)`);
  }

  return result;
}

/**
 * Phase 1: Replace image markers with placehold.co placeholders (fast, no AI generation).
 * Returns the updated files and metadata about pending images for Phase 2.
 */
export function replaceMarkersWithPlaceholders(
  files: Record<string, string>
): { files: Record<string, string>; pendingImages: PendingImageEntry[] } {
  // Layer 1: Convert broken/placeholder image src values into __IMG: markers
  const fixed = fixBrokenImageSrcs(files);

  // Layer 2: Normalize legacy __IMG[N:N]:desc__ → __IMG:desc__
  const normalized = normalizeLegacyMarkers(fixed);

  // Layer 3: Ensure image wrapper divs have overflow-hidden and sizing
  const withContainers = ensureImageContainers(normalized);

  const markers = extractImageMarkers(withContainers);

  if (markers.length === 0) {
    return { files: ensureImageFitClasses(withContainers), pendingImages: [] };
  }

  // Build placeholder URLs and pending image entries
  const pendingImages: PendingImageEntry[] = [];
  const urlMap = new Map<string, string>();

  for (const marker of markers) {
    const shortDesc = (marker.description || "Image").trim().slice(0, 30);
    const placeholder = `https://placehold.co/${marker.width}x${marker.height}/e2e8f0/64748b?text=${encodeURIComponent(shortDesc)}`;
    urlMap.set(marker.full, placeholder);

    pendingImages.push({
      placeholder,
      markerFull: marker.full,
      description: marker.description,
      width: marker.width,
      height: marker.height,
    });
  }

  // Replace markers with placeholders
  const withPlaceholders = replaceImageMarkers(withContainers, urlMap, markers);

  // Ensure fit classes
  const finalFiles = ensureImageFitClasses(withPlaceholders);

  console.log(`[image-gen] Phase 1: replaced ${markers.length} markers with placeholders`);

  return { files: finalFiles, pendingImages };
}

/**
 * Phase 2: Generate AI images for pending placeholders and replace them in files.
 * Returns updated files and count of failures.
 */
export async function generateImagesForFiles(
  files: Record<string, string>,
  pendingImages: PendingImageEntry[]
): Promise<{ files: Record<string, string>; failedCount: number }> {
  if (pendingImages.length === 0) {
    return { files, failedCount: 0 };
  }

  // Convert PendingImageEntry[] to ImageMarker[] for the existing generation pipeline
  const markers: ImageMarker[] = pendingImages.map((entry) => ({
    full: entry.markerFull,
    description: entry.description,
    width: entry.width,
    height: entry.height,
  }));

  console.log(`[image-gen] Phase 2: generating ${markers.length} AI images...`);
  const urlMap = await generateAndUploadImages(markers);
  console.log(`[image-gen] Phase 2: generated ${urlMap.size}/${markers.length} images`);

  // Replace placehold.co URLs with real blob URLs in file contents
  let updatedFiles = { ...files };
  let failedCount = 0;

  for (const entry of pendingImages) {
    const blobUrl = urlMap.get(entry.markerFull);
    if (blobUrl) {
      // Replace placeholder URL with real blob URL in all files
      for (const [filePath, content] of Object.entries(updatedFiles)) {
        if (typeof content === "string" && content.includes(entry.placeholder)) {
          updatedFiles[filePath] = content.split(entry.placeholder).join(blobUrl);
        }
      }
    } else {
      failedCount++;
    }
  }

  return { files: updatedFiles, failedCount };
}

/**
 * Orchestrator: fix broken srcs → normalize legacy markers → extract markers → generate images → replace markers → ensure fit classes.
 * No-ops if no markers found or BLOB_READ_WRITE_TOKEN is missing.
 */
export async function processImageMarkers(
  files: Record<string, string>
): Promise<Record<string, string>> {
  // Layer 1: Convert broken/placeholder image src values into __IMG: markers
  const fixed = fixBrokenImageSrcs(files);

  // Layer 2: Normalize legacy __IMG[N:N]:desc__ → __IMG:desc__
  const normalized = normalizeLegacyMarkers(fixed);

  // Layer 3: Ensure image wrapper divs have overflow-hidden and sizing
  const withContainers = ensureImageContainers(normalized);

  const markers = extractImageMarkers(withContainers);
  if (markers.length === 0) {
    // Still ensure fit classes even when no markers
    return ensureImageFitClasses(withContainers);
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn("[image-gen] BLOB_READ_WRITE_TOKEN not set, using fallbacks");
    const withFallbacks = replaceImageMarkers(withContainers, new Map(), markers);
    return ensureImageFitClasses(withFallbacks);
  }

  console.log(`[image-gen] Processing ${markers.length} image markers...`);
  const urlMap = await generateAndUploadImages(markers);
  console.log(`[image-gen] Generated ${urlMap.size}/${markers.length} images`);

  const withImages = replaceImageMarkers(withContainers, urlMap, markers);

  // Final pass: ensure all <img> tags have object-cover w-full h-full
  return ensureImageFitClasses(withImages);
}
