import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUserId, createClient, createAdminClient, isAdminSession } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify caller is admin (directly or via impersonation cookie)
  const isAdmin = await isAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get caller's email (to store as impersonator)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const callerEmail = user?.email;

  // Parse target email
  const body = await request.json();
  const targetEmail = body.email?.toLowerCase()?.trim();

  if (!targetEmail) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Verify target email is whitelisted
  const admin = createAdminClient();
  const { data: targetRecord } = await admin
    .from("allowed_emails")
    .select("email")
    .eq("email", targetEmail)
    .single();

  if (!targetRecord) {
    return NextResponse.json({ error: "User not found in allowed list" }, { status: 404 });
  }

  // Generate magic link silently (no email sent to the target user)
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: targetEmail,
  });

  if (linkError) {
    console.error("[impersonate] generateLink error:", linkError.message, linkError);

    // If user doesn't exist in auth yet, create them first then retry
    if (linkError.message?.includes("User not found") || linkError.status === 404 || linkError.message?.includes("Unable to find")) {
      const { error: createError } = await admin.auth.admin.createUser({
        email: targetEmail,
        email_confirm: true,
      });

      if (createError) {
        console.error("[impersonate] createUser error:", createError.message);
        return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
      }

      // Retry generating the link
      const { data: retryData, error: retryError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: targetEmail,
      });

      if (retryError || !retryData) {
        console.error("[impersonate] retry generateLink error:", retryError?.message);
        return NextResponse.json({ error: "Failed to generate link" }, { status: 500 });
      }

      // Determine the original admin email: use existing cookie if impersonating, otherwise current user
      const cookieStore = await cookies();
      const existingImpersonator = cookieStore.get("impersonator_email")?.value;
      const originalAdmin = existingImpersonator || callerEmail;

      if (originalAdmin) {
        cookieStore.set("impersonator_email", originalAdmin, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24, // 24 hours
        });
      }

      return NextResponse.json({ emailOtp: retryData.properties.email_otp });
    }

    return NextResponse.json({ error: "Failed to generate link" }, { status: 500 });
  }

  if (!linkData) {
    return NextResponse.json({ error: "Failed to generate link" }, { status: 500 });
  }

  // Determine the original admin email: use existing cookie if impersonating, otherwise current user
  const cookieStore = await cookies();
  const existingImpersonator = cookieStore.get("impersonator_email")?.value;
  const originalAdmin = existingImpersonator || callerEmail;

  if (originalAdmin) {
    cookieStore.set("impersonator_email", originalAdmin, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });
  }

  return NextResponse.json({ emailOtp: linkData.properties.email_otp });
}
