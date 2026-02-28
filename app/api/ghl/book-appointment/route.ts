import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/server";
import { getGHLConfig } from "@/lib/ghl-config";

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getGHLConfig(userId);
  const apiKey = config.apiKey;
  const locationId = config.locationId;
  const assignedUserId = config.assignedUserId;

  if (!apiKey || !locationId) {
    console.error("[GHL] Missing GHL API key or Location ID for user:", userId);
    return NextResponse.json(
      { error: "GHL is not configured. Please set up your GHL credentials in Settings." },
      { status: 500 }
    );
  }

  if (!assignedUserId) {
    console.error("[GHL] Missing GHL User ID for user:", userId);
    return NextResponse.json(
      { error: "GHL User ID is not configured. Please set up your GHL credentials in Settings." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    console.log("[Booking] API received request:", JSON.stringify(body, null, 2));
    const { contactId, calendarId, selectedSlot, slotDuration } = body;

    if (!contactId || !calendarId || !selectedSlot) {
      console.warn("[Booking] Missing required fields — contactId:", contactId ?? "MISSING", "calendarId:", calendarId ?? "MISSING", "selectedSlot:", selectedSlot ?? "MISSING");
      return NextResponse.json(
        { error: "Missing booking information. Please try again." },
        { status: 400 }
      );
    }

    // Calculate endTime from startTime + slotDuration
    const startTime = new Date(selectedSlot).toISOString();
    const durationMs = (slotDuration || 30) * 60 * 1000;
    const endTime = new Date(new Date(selectedSlot).getTime() + durationMs).toISOString();

    const appointmentPayload = {
      calendarId,
      locationId,
      contactId,
      startTime,
      endTime,
      title: "Appointment",
      appointmentStatus: "confirmed",
      assignedUserId,
      ignoreDateRange: false,
      toNotify: true,
    };

    console.log("[Booking] Sending to GHL:", JSON.stringify(appointmentPayload, null, 2));

    const ghlRes = await fetch(
      "https://services.leadconnectorhq.com/calendars/events/appointments",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Version": "2021-04-15",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(appointmentPayload),
      }
    );

    let ghlData: Record<string, unknown> = {};
    try { ghlData = await ghlRes.json(); } catch { /* non-JSON response */ }
    console.log("[Booking] GHL response:", ghlRes.status, JSON.stringify(ghlData, null, 2));

    if (!ghlRes.ok) {
      console.error("[Booking] GHL appointment failed:", ghlRes.status, ghlData);

      let friendlyMessage = "Failed to book appointment. Please try again.";
      if (ghlRes.status === 422) {
        friendlyMessage = "The selected time slot is no longer available. Please choose another time.";
      } else if (ghlRes.status === 429) {
        friendlyMessage = "Too many requests. Please wait a moment and try again.";
      } else if (ghlRes.status >= 500) {
        friendlyMessage = "Something went wrong on our end. Please try again later.";
      }

      return NextResponse.json(
        { error: friendlyMessage },
        { status: ghlRes.status }
      );
    }

    console.log("[Booking] Appointment booked successfully — id:", ghlData.id || (ghlData as Record<string, unknown>)?.id);
    return NextResponse.json({
      success: true,
      appointmentId: ghlData.id || (ghlData as Record<string, unknown>)?.id,
    });
  } catch (error) {
    console.error("[Booking] Unexpected error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 }
    );
  }
}
