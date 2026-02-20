import fs from "fs/promises";
import path from "path";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that an ID is a valid UUID to prevent path traversal attacks.
 * All funnel IDs are generated via uuidv4(), so this rejects any crafted input.
 */
export function isValidFunnelId(id: string): boolean {
  return UUID_REGEX.test(id);
}

export interface FunnelPage {
  title: string;
  slug: string;
  html: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  images?: string[];
}

export interface PendingImageEntry {
  placeholder: string;   // placehold.co URL currently in files
  markerFull: string;     // Original "__IMG:description__" string
  description: string;    // Full description (not truncated)
  width: number;
  height: number;
}

export interface Funnel {
  id: string;
  name?: string;
  prompt: string;
  promptImages?: string[];
  scrapeUrl?: string;
  model: string;
  pages: FunnelPage[];
  files?: Record<string, string>;
  pendingImages?: PendingImageEntry[];
  chatHistory: ChatMessage[];
  preGenHistory?: ChatMessage[];
  createdAt: string;
}

/**
 * Extract a project name from files (index.html <title> or package.json name)
 */
export function extractProjectName(files: Record<string, string>): string {
  // Try index.html <title>
  const indexHtml = files["/index.html"];
  if (indexHtml) {
    const titleMatch = indexHtml.match(/<title>([^<]+)<\/title>/);
    if (titleMatch && titleMatch[1] && titleMatch[1] !== "Vite + React + TS") {
      return titleMatch[1].trim();
    }
  }
  // Try package.json name
  const pkgJson = files["/package.json"];
  if (pkgJson) {
    try {
      const pkg = JSON.parse(pkgJson);
      if (pkg.name && pkg.name !== "vibe-project") {
        return pkg.name.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
      }
    } catch { /* ignore */ }
  }
  return "";
}

export function isReactProject(funnel: Funnel): boolean {
  return !!funnel.files && Object.keys(funnel.files).length > 0;
}

const DATA_DIR = path.join(process.cwd(), "data");

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/**
 * Simple in-memory lock to prevent concurrent writes to the same funnel.
 * Prevents lost-update race conditions when two chat edits arrive simultaneously.
 */
const writeLocks = new Map<string, Promise<void>>();

export async function saveFunnel(funnel: Funnel): Promise<void> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, `${funnel.id}.json`);

  // Wait for any existing write to this funnel to finish
  const existingLock = writeLocks.get(funnel.id);
  if (existingLock) {
    await existingLock.catch(() => {}); // don't fail if the previous write errored
  }

  // Create and register a new lock for this write
  const writePromise = fs.writeFile(filePath, JSON.stringify(funnel, null, 2));
  writeLocks.set(funnel.id, writePromise);

  try {
    await writePromise;
  } finally {
    // Clean up lock if it's still ours
    if (writeLocks.get(funnel.id) === writePromise) {
      writeLocks.delete(funnel.id);
    }
  }
}

export async function getFunnel(id: string): Promise<Funnel | null> {
  if (!isValidFunnelId(id)) {
    return null;
  }
  const filePath = path.join(DATA_DIR, `${id}.json`);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const funnel = JSON.parse(data) as Funnel;
    if (!funnel.chatHistory) {
      funnel.chatHistory = [];
    }
    return funnel;
  } catch (err: unknown) {
    // File not found — normal case
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    // JSON parse error or other issue — log and return null
    console.error(`[storage] Error reading funnel ${id}:`, err);
    return null;
  }
}
