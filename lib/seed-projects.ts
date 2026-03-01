import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

const SEED_EMAIL = "madhav.aggarwal@gohighlevel.com";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Copy all projects from the seed user to the target user.
 * Called once when a new user has 0 projects.
 * Errors are logged but never thrown.
 */
export async function seedProjectsForUser(userId: string): Promise<void> {
  try {
    const supabase = getSupabase();

    // Find seed user's auth ID
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (authError || !authData) {
      console.error("[seed] Failed to list users:", authError);
      return;
    }

    const seedUser = authData.users.find((u) => u.email === SEED_EMAIL);
    if (!seedUser) {
      console.error("[seed] Seed user not found:", SEED_EMAIL);
      return;
    }

    // Don't seed yourself
    if (seedUser.id === userId) return;

    // Fetch all seed user's funnels
    const { data: funnels, error: funnelsError } = await supabase
      .from("funnels")
      .select("*")
      .eq("user_id", seedUser.id)
      .order("created_at", { ascending: true });

    if (funnelsError || !funnels || funnels.length === 0) {
      if (funnelsError) console.error("[seed] Failed to fetch seed funnels:", funnelsError);
      return;
    }

    console.log(`[seed] Seeding ${funnels.length} projects for user ${userId}`);

    // Insert copies for the target user
    const copies = funnels.map((f) => {
      const newId = uuidv4();
      const chatHistory = f.chat_history;

      // Patch the id inside the chat_history JSON
      let patchedChatHistory = chatHistory;
      if (chatHistory && typeof chatHistory === "object") {
        patchedChatHistory = { ...chatHistory, id: newId };
      }

      return {
        id: newId,
        user_id: userId,
        name: f.name,
        prompt: f.prompt,
        model: f.model,
        project_type: f.project_type,
        has_calendar: f.has_calendar,
        file_count: f.file_count,
        page_count: f.page_count,
        first_page_title: f.first_page_title,
        preview_slug: f.preview_slug,
        files: f.files,
        chat_history: patchedChatHistory,
        created_at: f.created_at,
        updated_at: new Date().toISOString(),
      };
    });

    const { error: insertError } = await supabase.from("funnels").insert(copies);
    if (insertError) {
      console.error("[seed] Failed to insert seeded projects:", insertError);
      return;
    }

    console.log(`[seed] Successfully seeded ${copies.length} projects for user ${userId}`);
  } catch (err) {
    console.error("[seed] Unexpected error:", err);
  }
}
