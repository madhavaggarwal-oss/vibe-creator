import { NextRequest, NextResponse } from "next/server";
import { getFunnel, isReactProject } from "@/lib/storage";

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
