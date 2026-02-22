import { NextRequest, NextResponse } from "next/server";
import { getFunnel, saveFunnel, isReactProject, isValidFunnelId } from "@/lib/storage";
import fs from "fs/promises";
import path from "path";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const funnel = await getFunnel(id);

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
  const { id } = await params;
  const funnel = await getFunnel(id);

  if (!funnel) {
    return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
  }

  const body = await request.json();

  if (body.preGenHistory) {
    funnel.preGenHistory = body.preGenHistory;
  }

  // Replace full chat history (used when inserting calendar-connected messages)
  if (Array.isArray(body.chatHistory)) {
    funnel.chatHistory = body.chatHistory;
  }

  // Append chat messages (used when edits are stopped — persist user prompt + stopped message)
  if (Array.isArray(body.appendChatHistory)) {
    funnel.chatHistory = [...funnel.chatHistory, ...body.appendChatHistory];
  }

  // Calendar integration fields
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

  await saveFunnel(funnel);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidFunnelId(id)) {
    return NextResponse.json({ error: "Invalid funnel ID" }, { status: 400 });
  }
  const dataDir = path.join(process.cwd(), "data");
  const filePath = path.join(dataDir, `${id}.json`);

  try {
    await fs.access(filePath);
  } catch {
    return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
  }

  await fs.unlink(filePath);

  // Also delete snapshot if it exists
  try {
    await fs.unlink(path.join(dataDir, "snapshots", `${id}.html`));
  } catch {
    // no snapshot — fine
  }

  return NextResponse.json({ ok: true });
}
