import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!apiKey || !locationId) {
    console.error("[GHL Calendars] Missing GHL_API_KEY or GHL_LOCATION_ID env vars");
    return NextResponse.json(
      { error: "Calendar service unavailable." },
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
