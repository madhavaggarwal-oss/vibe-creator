import { NextRequest, NextResponse } from "next/server";
import { editFunnel } from "@/lib/gemini";
import { getFunnel, saveFunnel, isReactProject } from "@/lib/storage";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { funnelId, message, model, images } = body;

    if (!funnelId || typeof funnelId !== "string") {
      return NextResponse.json(
        { error: "funnelId is required" },
        { status: 400 }
      );
    }
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    const funnel = await getFunnel(funnelId);
    if (!funnel) {
      return NextResponse.json(
        { error: "Funnel not found" },
        { status: 404 }
      );
    }

    if (!isReactProject(funnel)) {
      return NextResponse.json(
        { error: "Legacy HTML funnels cannot be edited. Please create a new project." },
        { status: 400 }
      );
    }

    const modelId = model || funnel.model;
    const trimmedMessage = message.trim();

    const imageList = Array.isArray(images) ? images.filter((i: unknown) => typeof i === "string") : [];
    const result = await editFunnel(
      funnel.files!,
      trimmedMessage,
      funnel.chatHistory,
      modelId,
      imageList.length > 0 ? imageList : undefined
    );

    // Merge partial file updates into existing files
    const updatedFiles = { ...funnel.files! };
    for (const [path, content] of Object.entries(result.files)) {
      if (content === null) {
        delete updatedFiles[path];
      } else {
        updatedFiles[path] = content;
      }
    }

    // Update chat history
    const chatHistory = [...funnel.chatHistory];
    chatHistory.push({
      role: "user",
      content: trimmedMessage,
      timestamp: new Date().toISOString(),
      ...(imageList.length > 0 ? { images: imageList } : {}),
    });
    chatHistory.push({
      role: "assistant",
      content: result.message,
      timestamp: new Date().toISOString(),
    });

    // Save updated funnel
    await saveFunnel({
      ...funnel,
      files: updatedFiles,
      chatHistory,
    });

    return NextResponse.json({
      message: result.message,
      changedFiles: Object.keys(result.files),
    });
  } catch (error: unknown) {
    console.error("Chat edit error:", error);
    const errMsg =
      error instanceof Error ? error.message : "Failed to process edit";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
