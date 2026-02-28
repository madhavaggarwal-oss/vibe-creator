import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method is called from a Server Component where
            // cookies cannot be set. This can be ignored if middleware
            // refreshes user sessions.
          }
        },
      },
    }
  );
}

/**
 * Create a Supabase admin client using the service role key.
 * Use this for server-side operations that bypass RLS (e.g., checking allowed_emails).
 */
export function createAdminClient() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

/**
 * Get the current authenticated user's ID from the session cookies.
 * Returns null if not authenticated.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

/**
 * Check if the current request is from an admin session.
 * Returns true if:
 * - The current user's email has is_admin=true in allowed_emails, OR
 * - There is a valid impersonator_email cookie from an admin impersonation session
 */
export async function isAdminSession(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email;
  const admin = createAdminClient();

  // Check if current user is directly an admin
  if (email) {
    const { data } = await admin
      .from("allowed_emails")
      .select("is_admin")
      .eq("email", email.toLowerCase())
      .single();

    if (data?.is_admin) return true;
  }

  // Check impersonator cookie (set during admin impersonation)
  const cookieStore = await cookies();
  const impersonatorEmail = cookieStore.get("impersonator_email")?.value;

  if (impersonatorEmail) {
    const { data } = await admin
      .from("allowed_emails")
      .select("is_admin")
      .eq("email", impersonatorEmail.toLowerCase())
      .single();

    if (data?.is_admin) return true;
  }

  return false;
}
