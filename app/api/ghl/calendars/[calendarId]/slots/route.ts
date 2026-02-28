import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/server";
import { getGHLConfig } from "@/lib/ghl-config";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ calendarId: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { calendarId } = await params;
  const config = await getGHLConfig(userId);
  const apiKey = config.apiKey;

  if (!apiKey) {
    console.error("[GHL Slots] Missing GHL API key for user:", userId);
    return NextResponse.json(
      { error: "GHL is not configured. Please set up your GHL credentials in Settings." },
      { status: 500 }
    );
  }

  if (!calendarId) {
    return NextResponse.json(
      { error: "Calendar ID is required." },
      { status: 400 }
    );
  }

  // Date range: today to today + 30 days (epoch milliseconds)
  const now = new Date();
  // Start of today (midnight)
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = startOfDay.getTime();
  // End of day 30 days from now (23:59:59.999)
  const endDate = new Date(startOfDay.getTime() + 30 * 24 * 60 * 60 * 1000 - 1).getTime();

  console.log(`[GHL Slots] Fetching slots for calendar ${calendarId}`);
  console.log(`[GHL Slots] Date range: ${new Date(startDate).toISOString()} to ${new Date(endDate).toISOString()}`);

  try {
    const url = `https://services.leadconnectorhq.com/calendars/${calendarId}/free-slots?startDate=${startDate}&endDate=${endDate}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Version": "2021-04-15",
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("[GHL Slots] API error:", res.status, errData);
      return NextResponse.json(
        { error: "Failed to fetch available slots." },
        { status: res.status }
      );
    }

    const data = await res.json();
    console.log(`[GHL Slots] Response keys: ${Object.keys(data).join(", ")}`);

    // Debug: log the raw structure of the first date key to understand GHL's format
    const dateKeys = Object.keys(data).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
    if (dateKeys.length > 0) {
      const firstKey = dateKeys[0];
      const firstVal = data[firstKey];
      console.log(`[GHL Slots] Raw type of ${firstKey}: ${typeof firstVal}, isArray: ${Array.isArray(firstVal)}`);
      console.log(`[GHL Slots] Raw value of ${firstKey}:`, JSON.stringify(firstVal).slice(0, 500));
    }

    // GHL free-slots API returns date keys at the top level.
    // The value for each date can be:
    //   1. string[] of ISO datetimes: ["2026-02-24T09:00:00+05:30", ...]
    //   2. {slots: string[]} object with nested slots array
    //   3. {slot: string}[] array of objects
    // We normalize to Record<date, HH:mm[]> for the client.
    const slots: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(data)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;

      // Determine the actual array of slot values
      let slotArray: unknown[] | null = null;
      if (Array.isArray(value)) {
        slotArray = value;
      } else if (typeof value === "object" && value !== null) {
        // Handle nested {slots: [...]} structure
        const obj = value as Record<string, unknown>;
        if (Array.isArray(obj.slots)) {
          slotArray = obj.slots;
        } else if (Array.isArray(obj.freeSlots)) {
          slotArray = obj.freeSlots;
        }
      }

      if (!slotArray || slotArray.length === 0) continue;

      // Normalize slot values to HH:mm strings
      const times: string[] = [];
      for (const item of slotArray) {
        let isoStr: string | null = null;
        if (typeof item === "string") {
          isoStr = item;
        } else if (typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).slot === "string") {
          isoStr = (item as Record<string, unknown>).slot as string;
        }
        if (isoStr) {
          // Extract HH:mm from ISO string like "2026-02-24T09:00:00+05:30" or "09:00"
          const timeMatch = isoStr.match(/T(\d{2}:\d{2})/);
          if (timeMatch) {
            times.push(timeMatch[1]);
          } else if (/^\d{2}:\d{2}/.test(isoStr)) {
            times.push(isoStr.slice(0, 5));
          }
        }
      }
      if (times.length > 0) {
        slots[key] = times;
      }
    }
    const slotCount = Object.keys(slots).length;
    console.log(`[GHL Slots] Found ${slotCount} days with available slots`);
    if (slotCount > 0) {
      const sampleKey = Object.keys(slots)[0];
      console.log(`[GHL Slots] Sample normalized: ${sampleKey} = [${slots[sampleKey].slice(0, 5).join(", ")}]`);
    }

    return NextResponse.json({ slots, calendarId });
  } catch (error) {
    console.error("[GHL Slots] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch available slots." },
      { status: 500 }
    );
  }
}
