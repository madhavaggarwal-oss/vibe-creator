import { NextResponse } from "next/server";
import { getCurrentUserId, createAdminClient, isAdminSession } from "@/lib/supabase/server";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify caller is admin (directly or via impersonation cookie)
  const isAdmin = await isAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch all whitelisted users
  const admin = createAdminClient();
  const { data: users, error } = await admin
    .from("allowed_emails")
    .select("email, name")
    .order("name", { ascending: true });

  if (error) {
    console.error("[admin/users] Failed to fetch users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }

  return NextResponse.json(users || []);
}
