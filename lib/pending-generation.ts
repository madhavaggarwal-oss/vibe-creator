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

  // Best-effort sessionStorage fallback so the data survives a page refresh
  // during navigation. Silently ignore quota errors from large image payloads.
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded (large base64 images) — OK, in-memory is primary
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
    return data;
  }

  // Fallback: check sessionStorage (handles page refresh edge case)
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      sessionStorage.removeItem(STORAGE_KEY);
      return JSON.parse(stored);
    }
  } catch {
    // sessionStorage unavailable
  }

  return null;
}
