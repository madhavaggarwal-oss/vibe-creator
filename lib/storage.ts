import fs from "fs/promises";
import path from "path";

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

export interface Funnel {
  id: string;
  name?: string;
  prompt: string;
  promptImages?: string[];
  model: string;
  pages: FunnelPage[];
  files?: Record<string, string>;
  chatHistory: ChatMessage[];
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

export async function saveFunnel(funnel: Funnel): Promise<void> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, `${funnel.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(funnel, null, 2));
}

export async function getFunnel(id: string): Promise<Funnel | null> {
  const filePath = path.join(DATA_DIR, `${id}.json`);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    const funnel = JSON.parse(data) as Funnel;
    if (!funnel.chatHistory) {
      funnel.chatHistory = [];
    }
    return funnel;
  } catch {
    return null;
  }
}
