import { NextResponse } from "next/server";
import { getCurrentUserId, createClient, createAdminClient, isAdminSession } from "@/lib/supabase/server";

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
    return NextResponse.json({ name: null, isAdmin: false });
  }

  // Look up name from allowed_emails table
  const admin = createAdminClient();
  const { data } = await admin
    .from("allowed_emails")
    .select("name")
    .eq("email", email.toLowerCase())
    .single();

  // Check admin status (includes impersonation cookie check)
  const isAdmin = await isAdminSession();

  return NextResponse.json({
    name: data?.name || null,
    isAdmin,
  });
}
