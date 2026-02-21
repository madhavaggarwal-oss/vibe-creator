import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { generateFunnel } from "@/lib/gemini";
import { saveFunnel, extractProjectName } from "@/lib/storage";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, model, images, scrapeData, isImageClone } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const modelId = model || "gemini-3-flash-preview";
    const id = uuidv4();

    const MAX_IMAGES = 10;
    const imageList = Array.isArray(images)
      ? images.filter((i: unknown) => typeof i === "string").slice(0, MAX_IMAGES)
      : [];

    // Pass the request abort signal directly to generateFunnel so the Gemini API
    // call is actually cancelled when the client disconnects (not just ignored).
    // This prevents a zombie first-generation from consuming API quota when the
    // user aborts and retries with a new prompt.
    const files = await generateFunnel(
      prompt.trim(),
      modelId,
      imageList.length > 0 ? imageList : undefined,
      scrapeData || undefined,
      request.signal,
      !!isImageClone
    );

    // Double-check: if client disconnected while Gemini was finishing, don't save
    if (request.signal.aborted) {
      return NextResponse.json(
        { error: "Generation cancelled" },
        { status: 499 }
      );
    }

    const name = extractProjectName(files) || prompt.trim().slice(0, 60);

    const funnel = {
      id,
      name,
      prompt: prompt.trim(),
      ...(imageList.length > 0 ? { promptImages: imageList } : {}),
      ...(scrapeData?.metadata?.title ? { scrapeUrl: scrapeData.metadata.title } : {}),
      model: modelId,
      pages: [] as { title: string; slug: string; html: string }[],
      files,
      chatHistory: [],
      createdAt: new Date().toISOString(),
    };

    await saveFunnel(funnel);

    return NextResponse.json({
      id,
      fileCount: Object.keys(files).length,
    });
  } catch (error: unknown) {
    // If the client disconnected (abort), return silently
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Generation cancelled" },
        { status: 499 }
      );
    }

    console.error("Generation error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate funnel";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
