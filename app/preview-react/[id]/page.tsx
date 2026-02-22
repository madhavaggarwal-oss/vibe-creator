"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";

const ReactProjectPreview = dynamic(
  () => import("@/components/react-preview"),
  { ssr: false, loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <p className="text-sm text-gray-500">Loading preview...</p>
      </div>
    </div>
  )}
);

interface CalendarData {
  slots: Record<string, string[]>;
  slotDuration: number;
  calendarId: string;
}

export default function PreviewReactPage() {
  const params = useParams();
  const id = params.id as string;
  const [files, setFiles] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);

  // Store calendar config in refs so the message handler always sees latest values
  const calendarIdRef = useRef<string | null>(null);
  const slotDurationRef = useRef<number | null>(null);

  // GHL form submission handler — listens for form data from Sandpack iframe
  useEffect(() => {
    const handleGhlFormSubmit = async (e: MessageEvent) => {
      if (!e.data || e.data.type !== "ghl-form-submit") return;

      const { fields, customFieldKeys, customFieldLabels, bookingData } = e.data;
      if (!fields || Object.keys(fields).length === 0) return;

      console.log("[GHL] Received form submission from preview iframe:", fields);
      if (customFieldKeys?.length) console.log("[GHL] Custom field keys:", customFieldKeys);
      if (customFieldLabels && Object.keys(customFieldLabels).length) console.log("[GHL] Custom field labels:", customFieldLabels);
      if (bookingData) console.log("[GHL] Booking data:", bookingData);

      const iframe = document.querySelector('.sp-preview-iframe') as HTMLIFrameElement;

      try {
        // Step 0: Verify slot availability before creating contact
        if (bookingData?.selectedSlot && calendarIdRef.current) {
          console.log("[Booking] Verifying slot availability — selected:", bookingData.selectedSlot, "calendarId:", calendarIdRef.current);
          try {
            const slotsRes = await fetch(`/api/ghl/calendars/${calendarIdRef.current}/slots`);
            const slotsData = await slotsRes.json();
            console.log("[Booking] Fresh slots response:", slotsRes.status, "days:", slotsRes.ok && slotsData.slots ? Object.keys(slotsData.slots).length : "N/A");
            if (slotsRes.ok && slotsData.slots) {
              const freshSlots = slotsData.slots as Record<string, string[]>;
              const dateKey = bookingData.selectedSlot.substring(0, 10);
              const time = bookingData.selectedSlot.substring(11, 16);
              const slotsForDate = freshSlots[dateKey];
              const isAvailable = slotsForDate?.includes(time);
              console.log("[Booking] Checking date:", dateKey, "time:", time, "— slots for date:", slotsForDate?.length ?? 0, "available:", isAvailable);

              if (!isAvailable) {
                console.warn("[Booking] Slot unavailable! Remaining slots for", dateKey + ":", slotsForDate ?? "no slots for this date");
                // Show error toast asking user to refresh availability
                iframe?.contentWindow?.postMessage({
                  type: "ghl-form-result",
                  success: false,
                  message: "The selected time slot is no longer available. Please refresh availability and choose another slot.",
                }, "*");
                console.log("[Booking] Aborting submission — slot no longer available");
                return;
              }

              console.log("[Booking] Slot verified available — proceeding with submission");
            }
          } catch (slotCheckErr) {
            console.warn("[Booking] Slot availability check failed, proceeding with submission anyway:", slotCheckErr);
          }
        }

        // Step 1: Create contact
        const res = await fetch("/api/ghl/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields, customFieldKeys, customFieldLabels }),
        });

        let data: Record<string, unknown> = {};
        try { data = await res.json(); } catch { /* non-JSON response */ }
        console.log("[GHL] Contact API response:", res.status, data);

        if (!res.ok) {
          iframe?.contentWindow?.postMessage({
            type: "ghl-form-result",
            success: false,
            message: typeof data.error === "string" ? data.error : "Submission failed",
          }, "*");
          return;
        }

        // Step 2: If booking data exists, create appointment
        if (bookingData?.selectedSlot && calendarIdRef.current && data.contactId) {
          const appointmentRequest = {
            contactId: data.contactId,
            calendarId: calendarIdRef.current,
            selectedSlot: bookingData.selectedSlot,
            slotDuration: slotDurationRef.current || 30,
          };
          console.log("[Booking] Creating appointment:", JSON.stringify(appointmentRequest, null, 2));
          try {
            const apptRes = await fetch("/api/ghl/book-appointment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(appointmentRequest),
            });

            let apptData: Record<string, unknown> = {};
            try { apptData = await apptRes.json(); } catch { /* non-JSON response */ }
            console.log("[Booking] Appointment API response:", apptRes.status, apptData);

            iframe?.contentWindow?.postMessage({
              type: "ghl-form-result",
              success: apptRes.ok,
              message: apptRes.ok
                ? "Appointment booked successfully!"
                : (typeof apptData.error === "string" ? apptData.error : "Failed to book appointment"),
            }, "*");
          } catch (apptErr) {
            console.error("[GHL] Appointment network error:", apptErr);
            iframe?.contentWindow?.postMessage({
              type: "ghl-form-result",
              success: false,
              message: "Contact saved but failed to book appointment. Please try again.",
            }, "*");
          }
        } else {
          // Regular form (no booking) — log why booking was skipped if any booking data was partially present
          if (bookingData || calendarIdRef.current) {
            console.warn("[Booking] Skipped appointment creation — selectedSlot:", bookingData?.selectedSlot ?? "missing", "calendarId:", calendarIdRef.current ?? "missing", "contactId:", data.contactId ?? "missing");
          }
          iframe?.contentWindow?.postMessage({
            type: "ghl-form-result",
            success: true,
            message: "Form submitted successfully!",
          }, "*");
        }
      } catch (err) {
        console.error("[GHL] Network error:", err);
        iframe?.contentWindow?.postMessage({
          type: "ghl-form-result",
          success: false,
          message: "Network error. Please try again.",
        }, "*");
      }
    };

    window.addEventListener("message", handleGhlFormSubmit);
    return () => window.removeEventListener("message", handleGhlFormSubmit);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/funnel/${id}`);
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        if (data.files) {
          setFiles(data.files);

          // Load calendar config if available
          if (data.selectedCalendarId && data.calendarSlots) {
            const calId = data.selectedCalendarId;
            const slotDur = data.selectedCalendarSlotDuration || 30;
            const slotDays = Object.keys(data.calendarSlots).length;
            console.log("[Booking] Preview loaded calendar config — calendarId:", calId, "slotDuration:", slotDur, "days with slots:", slotDays);
            calendarIdRef.current = calId;
            slotDurationRef.current = slotDur;
            setCalendarData({
              slots: data.calendarSlots,
              slotDuration: slotDur,
              calendarId: calId,
            });
          }
        } else {
          setError("This project does not support React preview.");
        }
      } catch {
        setError("Failed to load project.");
      }
    }
    load();
  }, [id]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">{error}</p>
      </div>
    );
  }

  if (!files) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <ReactProjectPreview files={files} calendarData={calendarData} />
    </div>
  );
}
