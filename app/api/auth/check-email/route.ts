import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("allowed_emails")
      .select("email")
      .eq("email", email.trim().toLowerCase())
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "This email is not authorized to access this application." },
        { status: 403 }
      );
    }

    return NextResponse.json({ allowed: true });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}
