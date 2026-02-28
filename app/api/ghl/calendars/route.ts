import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/server";
import { getGHLConfig } from "@/lib/ghl-config";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getGHLConfig(userId);
  const apiKey = config.apiKey;
  const locationId = config.locationId;

  if (!apiKey || !locationId) {
    console.error("[GHL Calendars] Missing GHL API key or Location ID for user:", userId);
    return NextResponse.json(
      { error: "GHL is not configured. Please set up your GHL credentials in Settings." },
      { status: 500 }
    );
  }

  console.log("[GHL Calendars] Fetching calendars for location:", locationId);

  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/calendars/?locationId=${locationId}`,
      {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Version": "2021-04-15",
          "Authorization": `Bearer ${apiKey}`,
        },
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("[GHL Calendars] API error:", res.status, errData);
      return NextResponse.json(
        { error: "Failed to fetch calendars." },
        { status: res.status }
      );
    }

    const data = await res.json();
    console.log("[GHL Calendars] Found", data.calendars?.length || 0, "calendars");

    // Map to simplified calendar objects for the client
    const calendars = (data.calendars || []).map((cal: Record<string, unknown>) => ({
      id: cal.id,
      name: cal.name,
      calendarType: cal.calendarType || "unknown",
      slotDuration: cal.slotDuration || 30,
      description: cal.description || "",
    }));

    return NextResponse.json({ calendars });
  } catch (error) {
    console.error("[GHL Calendars] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch calendars." },
      { status: 500 }
    );
  }
}
