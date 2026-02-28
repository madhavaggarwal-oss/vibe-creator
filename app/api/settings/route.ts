import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("user_settings")
    .select("ghl_api_key, ghl_location_id, ghl_user_id")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("[Settings] Failed to fetch settings:", error);
    return NextResponse.json(
      { error: "Failed to load settings." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ghlApiKey: data?.ghl_api_key || "",
    ghlLocationId: data?.ghl_location_id || "",
    ghlUserId: data?.ghl_user_id || "",
  });
}

export async function PUT(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { ghlApiKey, ghlLocationId, ghlUserId } = body;

    if (!ghlApiKey || !ghlLocationId || !ghlUserId) {
      return NextResponse.json(
        { error: "All three GHL fields are required." },
        { status: 400 }
      );
    }

    if (
      typeof ghlApiKey !== "string" ||
      typeof ghlLocationId !== "string" ||
      typeof ghlUserId !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid field types." },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const { error } = await supabase.from("user_settings").upsert(
      {
        user_id: userId,
        ghl_api_key: ghlApiKey.trim(),
        ghl_location_id: ghlLocationId.trim(),
        ghl_user_id: ghlUserId.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("[Settings] Failed to save settings:", error);
      return NextResponse.json(
        { error: "Failed to save settings." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }
}
