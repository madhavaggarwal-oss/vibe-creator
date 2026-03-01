import { NextResponse } from "next/server";
import { listFunnels } from "@/lib/storage";
import { getCurrentUserId } from "@/lib/supabase/server";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const funnels = await listFunnels(userId);
    return NextResponse.json(funnels);
  } catch (err) {
    console.error("[funnels] Failed to list funnels:", err);
    return NextResponse.json([], { status: 500 });
  }
}
