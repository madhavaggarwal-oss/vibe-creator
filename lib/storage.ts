import { createClient } from "@supabase/supabase-js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that an ID is a valid UUID to prevent injection attacks.
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
  role: "user" | "assistant" | "calendar-connected";
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

export interface GHLCalendar {
  id: string;
  name: string;
  calendarType: string;
  slotDuration: number;
  description?: string;
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
  hasCalendar?: boolean;
  selectedCalendarId?: string;
  selectedCalendarName?: string;
  selectedCalendarSlotDuration?: number;
  calendarSlots?: Record<string, string[]>;
  companionFunnelId?: string;
  companionModel?: string;
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

// ---------------------------------------------------------------------------
// Supabase client (server-side, uses service role for full access)
// ---------------------------------------------------------------------------

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------------------------------------------------------------------------
// Funnel CRUD — all functions require userId for user isolation
// ---------------------------------------------------------------------------

export async function saveFunnel(funnel: Funnel, userId: string): Promise<void> {
  const supabase = getSupabase();
  const isReact = !!funnel.files && Object.keys(funnel.files).length > 0;

  const { error } = await supabase.from("funnels").upsert(
    {
      id: funnel.id,
      user_id: userId,
      name: funnel.name || funnel.pages?.[0]?.title || funnel.prompt?.slice(0, 60) || "Untitled",
      prompt: funnel.prompt,
      model: funnel.model,
      project_type: isReact ? "react" : "html",
      has_calendar: funnel.hasCalendar || false,
      file_count: isReact ? Object.keys(funnel.files!).length : 0,
      page_count: funnel.pages?.length || 0,
      first_page_title: funnel.pages?.[0]?.title || "Untitled",
      preview_slug: funnel.pages?.[0]?.slug || "home",
      files: funnel.files || {},
      chat_history: funnel,
      created_at: funnel.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) {
    console.error("[storage] Failed to save funnel:", error);
    throw new Error(`Failed to save funnel: ${error.message}`);
  }
}

export async function getFunnel(id: string, userId: string): Promise<Funnel | null> {
  if (!isValidFunnelId(id)) {
    return null;
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("funnels")
    .select("chat_history")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    if (error?.code === "PGRST116") {
      return null;
    }
    console.error(`[storage] Error reading funnel ${id}:`, error);
    return null;
  }

  const funnel = data.chat_history as Funnel;
  if (!funnel.chatHistory) {
    funnel.chatHistory = [];
  }
  return funnel;
}

export async function deleteFunnel(id: string, userId: string): Promise<boolean> {
  if (!isValidFunnelId(id)) {
    return false;
  }

  const supabase = getSupabase();

  const { error } = await supabase
    .from("funnels")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error(`[storage] Error deleting funnel ${id}:`, error);
    return false;
  }

  await deleteSnapshot(id);
  return true;
}

// ---------------------------------------------------------------------------
// Funnel listing
// ---------------------------------------------------------------------------

export interface FunnelSummary {
  id: string;
  name: string;
  prompt: string;
  model: string;
  pageCount: number;
  fileCount: number;
  isReactProject: boolean;
  firstPageTitle: string;
  createdAt: string;
  previewSlug: string;
  hasSnapshot: boolean;
}

export async function listFunnels(userId: string): Promise<FunnelSummary[]> {
  const supabase = getSupabase();

  // Only fetch lightweight metadata columns — NOT chat_history (which is huge)
  const { data, error } = await supabase
    .from("funnels")
    .select("id, name, prompt, model, project_type, has_calendar, file_count, page_count, first_page_title, preview_slug, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("[storage] Failed to list funnels:", error);
    return [];
  }

  // Check which funnels have snapshots
  const { data: snapshotData } = await supabase
    .from("snapshots")
    .select("funnel_id");

  const snapshotIds = new Set(
    (snapshotData || []).map((s: { funnel_id: string }) => s.funnel_id)
  );

  return data.map((row) => ({
    id: row.id,
    name: row.name || "Untitled",
    prompt: row.prompt || "",
    model: row.model || "",
    pageCount: row.page_count || 0,
    fileCount: row.file_count || 0,
    isReactProject: row.project_type === "react",
    firstPageTitle: row.first_page_title || "Untitled",
    createdAt: row.created_at,
    previewSlug: row.preview_slug || "home",
    hasSnapshot: snapshotIds.has(row.id),
  }));
}

// ---------------------------------------------------------------------------
// Snapshots (not user-scoped — tied to funnel which is already user-scoped)
// ---------------------------------------------------------------------------

export async function getSnapshot(id: string): Promise<string | null> {
  if (!isValidFunnelId(id)) {
    return null;
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("snapshots")
    .select("html")
    .eq("funnel_id", id)
    .single();

  if (error || !data) {
    return null;
  }

  return data.html;
}

export async function saveSnapshot(id: string, html: string): Promise<void> {
  if (!isValidFunnelId(id)) {
    return;
  }

  const supabase = getSupabase();

  const { error } = await supabase.from("snapshots").upsert(
    {
      funnel_id: id,
      html,
      created_at: new Date().toISOString(),
    },
    { onConflict: "funnel_id" }
  );

  if (error) {
    console.error(`[storage] Failed to save snapshot ${id}:`, error);
  }
}

export async function deleteSnapshot(id: string): Promise<void> {
  if (!isValidFunnelId(id)) {
    return;
  }

  const supabase = getSupabase();

  await supabase.from("snapshots").delete().eq("funnel_id", id);
}
