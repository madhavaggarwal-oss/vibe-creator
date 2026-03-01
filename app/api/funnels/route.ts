import { NextResponse } from "next/server";
import { listFunnels } from "@/lib/storage";
import { getCurrentUserId } from "@/lib/supabase/server";
import { seedProjectsForUser } from "@/lib/seed-projects";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let funnels = await listFunnels(userId);

    if (funnels.length === 0) {
      await seedProjectsForUser(userId);
      funnels = await listFunnels(userId);
    }

    return NextResponse.json(funnels);
  } catch (err) {
    console.error("[funnels] Failed to list funnels:", err);
    return NextResponse.json([], { status: 500 });
  }
}
