import { NextRequest, NextResponse } from "next/server";
import { editFunnel } from "@/lib/gemini";
import { getFunnel, saveFunnel, isReactProject } from "@/lib/storage";
import { processImageMarkers } from "@/lib/image-gen";
import fs from "fs/promises";
import path from "path";

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

    const MAX_IMAGES = 10;
    const imageList = Array.isArray(images)
      ? images.filter((i: unknown) => typeof i === "string").slice(0, MAX_IMAGES)
      : [];

    // Pass abort signal so the Gemini call is cancelled when the client disconnects
    const result = await editFunnel(
      funnel.files!,
      trimmedMessage,
      funnel.chatHistory,
      modelId,
      imageList.length > 0 ? imageList : undefined,
      request.signal
    );

    // If client disconnected during generation, don't save changes
    if (request.signal.aborted) {
      return NextResponse.json(
        { error: "Edit cancelled" },
        { status: 499 }
      );
    }

    // Merge partial file updates into existing files
    const updatedFiles = { ...funnel.files! };
    for (const [filePath, content] of Object.entries(result.files)) {
      if (content === null) {
        delete updatedFiles[filePath];
      } else {
        updatedFiles[filePath] = content;
      }
    }

    // Process image markers in changed files.
    // Also detect broken/placeholder image patterns that need fixing
    // (empty src, /placeholder.svg, placeholder service URLs, etc.)
    const needsImageProcessing = Object.values(updatedFiles).some(
      (v) =>
        typeof v === "string" &&
        (/__IMG/.test(v) ||
          /src\s*=\s*"(?:\/placeholder|\.?\/?assets\/|\.?\/?images?\/|https?:\/\/(?:via\.placeholder|placehold\.|picsum|placekitten))[^"]*"/i.test(v) ||
          /src\s*=\s*""\s/i.test(v))
    );

    // Check again before expensive image processing
    if (request.signal.aborted) {
      return NextResponse.json(
        { error: "Edit cancelled" },
        { status: 499 }
      );
    }

    const finalFiles = needsImageProcessing
      ? await processImageMarkers(updatedFiles)
      : updatedFiles;

    // Final check before saving
    if (request.signal.aborted) {
      return NextResponse.json(
        { error: "Edit cancelled" },
        { status: 499 }
      );
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
      files: finalFiles,
      chatHistory,
    });

    // Invalidate cached snapshot so it gets re-captured
    try {
      await fs.unlink(path.join(process.cwd(), "data", "snapshots", `${funnelId}.html`));
    } catch {
      // File may not exist — that's fine
    }

    return NextResponse.json({
      message: result.message,
      changedFiles: Object.keys(result.files),
    });
  } catch (error: unknown) {
    // If the client disconnected (abort), return silently
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Edit cancelled" },
        { status: 499 }
      );
    }

    console.error("Chat edit error:", error);
    const errMsg =
      error instanceof Error ? error.message : "Failed to process edit";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
