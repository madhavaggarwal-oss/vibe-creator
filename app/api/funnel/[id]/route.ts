import { NextRequest, NextResponse } from "next/server";
import { getFunnel, saveFunnel, isReactProject, isValidFunnelId, deleteFunnel } from "@/lib/storage";
import { getCurrentUserId } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const funnel = await getFunnel(id, userId);

  if (!funnel) {
    return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
  }

  if (isReactProject(funnel)) {
    return NextResponse.json({
      id: funnel.id,
      name: funnel.name || funnel.prompt?.slice(0, 60) || "Untitled",
      prompt: funnel.prompt,
      promptImages: funnel.promptImages || [],
      model: funnel.model,
      files: funnel.files,
      pendingImages: funnel.pendingImages || [],
      chatHistory: funnel.chatHistory || [],
      preGenHistory: funnel.preGenHistory || [],
      createdAt: funnel.createdAt,
      hasCalendar: funnel.hasCalendar || false,
      selectedCalendarId: funnel.selectedCalendarId || null,
      selectedCalendarName: funnel.selectedCalendarName || null,
      selectedCalendarSlotDuration: funnel.selectedCalendarSlotDuration || null,
      calendarSlots: funnel.calendarSlots || null,
      companionFunnelId: funnel.companionFunnelId || null,
      companionModel: funnel.companionModel || null,
    });
  }

  // Legacy HTML funnels
  return NextResponse.json({
    id: funnel.id,
    prompt: funnel.prompt,
    model: funnel.model,
    pages: funnel.pages.map((p) => ({
      title: p.title,
      slug: p.slug,
    })),
    chatHistory: funnel.chatHistory || [],
    createdAt: funnel.createdAt,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const funnel = await getFunnel(id, userId);

  if (!funnel) {
    return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
  }

  const body = await request.json();

  if (body.preGenHistory) {
    funnel.preGenHistory = body.preGenHistory;
  }

  if (Array.isArray(body.chatHistory)) {
    funnel.chatHistory = body.chatHistory;
  }

  if (Array.isArray(body.appendChatHistory)) {
    funnel.chatHistory = [...funnel.chatHistory, ...body.appendChatHistory];
  }

  if (body.selectedCalendarId !== undefined) {
    funnel.selectedCalendarId = body.selectedCalendarId || undefined;
    funnel.selectedCalendarName = body.selectedCalendarName || undefined;
    funnel.selectedCalendarSlotDuration = body.selectedCalendarSlotDuration || undefined;
  }
  if (body.calendarSlots !== undefined) {
    funnel.calendarSlots = body.calendarSlots || undefined;
  }
  if (body.hasCalendar !== undefined) {
    funnel.hasCalendar = body.hasCalendar;
  }
  if (body.companionFunnelId !== undefined) {
    funnel.companionFunnelId = body.companionFunnelId || undefined;
    funnel.companionModel = body.companionModel || undefined;
  }

  await saveFunnel(funnel, userId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isValidFunnelId(id)) {
    return NextResponse.json({ error: "Invalid funnel ID" }, { status: 400 });
  }

  const deleted = await deleteFunnel(id, userId);
  if (!deleted) {
    return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
