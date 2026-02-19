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
      chatHistory: funnel.chatHistory || [],
      preGenHistory: funnel.preGenHistory || [],
      createdAt: funnel.createdAt,
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

  // Append chat messages (used when edits are stopped — persist user prompt + stopped message)
  if (Array.isArray(body.appendChatHistory)) {
    funnel.chatHistory = [...funnel.chatHistory, ...body.appendChatHistory];
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
