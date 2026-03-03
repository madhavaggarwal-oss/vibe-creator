/**
 * Typed wrapper around sessionStorage for passing generation data between
 * the home page and the generate page across full-page navigation.
 *
 * Also keeps an in-memory copy so client-side navigations (if used in the
 * future) work without hitting sessionStorage's ~5MB limit.
 */

const STORAGE_KEY = "vibe-pending-generation";

export interface PendingGeneration {
  prompt: string;
  model: string;
  images: string[];
  scrapeUrl?: string;
  scrapeData?: Record<string, unknown>;
  isImageClone?: boolean;
}

let pending: PendingGeneration | null = null;

export function setPendingGeneration(data: PendingGeneration): void {
  pending = data;
  const payloadSize = JSON.stringify(data).length;
  console.log("[pending-generation] SET:", {
    prompt: data.prompt?.slice(0, 50),
    model: data.model,
    imageCount: data.images?.length ?? 0,
    imageSizes: data.images?.map((img) => `${Math.round(img.length / 1024)}KB`),
    scrapeUrl: data.scrapeUrl,
    isImageClone: data.isImageClone,
    payloadSize: `${Math.round(payloadSize / 1024)}KB`,
  });

  // Best-effort sessionStorage fallback so the data survives full-page navigation.
  // Clear first so stale data never persists if the new write fails (quota exceeded).
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log("[pending-generation] sessionStorage write SUCCESS");
  } catch {
    // Quota exceeded (large base64 images) — in-memory is primary.
    // Navigation will use window.location.href (full reload), so for large
    // payloads that don't fit in sessionStorage, the data will be lost.
    console.warn("[pending-generation] sessionStorage write FAILED (quota exceeded). Payload:", `${Math.round(payloadSize / 1024)}KB`);
  }
}

/**
 * Retrieve and clear the pending generation data.
 * Prefers the in-memory store (always available after client-side navigation),
 * falls back to sessionStorage (survives page refresh for small payloads).
 */
export function consumePendingGeneration(): PendingGeneration | null {
  if (pending) {
    const data = pending;
    pending = null;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    console.log("[pending-generation] CONSUME from in-memory:", {
      prompt: data.prompt?.slice(0, 50),
      imageCount: data.images?.length ?? 0,
      imageSizes: data.images?.map((img) => `${Math.round(img.length / 1024)}KB`),
      isImageClone: data.isImageClone,
    });
    return data;
  }

  // Fallback: check sessionStorage (handles page refresh edge case)
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      sessionStorage.removeItem(STORAGE_KEY);
      const data = JSON.parse(stored);
      console.log("[pending-generation] CONSUME from sessionStorage:", {
        prompt: data.prompt?.slice(0, 50),
        imageCount: data.images?.length ?? 0,
        imageSizes: data.images?.map((img: string) => `${Math.round(img.length / 1024)}KB`),
        isImageClone: data.isImageClone,
      });
      return data;
    }
  } catch {
    // sessionStorage unavailable
    console.warn("[pending-generation] sessionStorage read FAILED");
  }

  console.warn("[pending-generation] CONSUME returned NULL — no data in memory or sessionStorage");
  return null;
}
