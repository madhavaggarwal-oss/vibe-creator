import { createClient } from "@supabase/supabase-js";

export interface GHLConfig {
  apiKey: string | null;
  locationId: string | null;
  assignedUserId: string | null;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Get GHL configuration for a user.
 * Queries user_settings table first, falls back to process.env if not configured.
 */
export async function getGHLConfig(userId: string): Promise<GHLConfig> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("user_settings")
    .select("ghl_api_key, ghl_location_id, ghl_user_id")
    .eq("user_id", userId)
    .single();

  if (!error && data && (data.ghl_api_key || data.ghl_location_id || data.ghl_user_id)) {
    return {
      apiKey: data.ghl_api_key || null,
      locationId: data.ghl_location_id || null,
      assignedUserId: data.ghl_user_id || null,
    };
  }

  // Fallback to environment variables
  return {
    apiKey: process.env.GHL_API_KEY || null,
    locationId: process.env.GHL_LOCATION_ID || null,
    assignedUserId: process.env.GHL_USER_ID || null,
  };
}
