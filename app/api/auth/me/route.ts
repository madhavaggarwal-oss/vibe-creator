import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user email from auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email;

  if (!email) {
    return NextResponse.json({ name: null });
  }

  // Look up name from allowed_emails table
  const admin = createAdminClient();
  const { data } = await admin
    .from("allowed_emails")
    .select("name")
    .eq("email", email.toLowerCase())
    .single();

  return NextResponse.json({ name: data?.name || null });
}
