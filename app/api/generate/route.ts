import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { generateFunnel } from "@/lib/gemini";
import { saveFunnel, extractProjectName } from "@/lib/storage";
import { createStreamingResponse } from "@/lib/stream-response";
import { getCurrentUserId } from "@/lib/supabase/server";
import { logGeneration } from "@/lib/generation-log";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { prompt, model, images, scrapeData, isImageClone } = body;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return Response.json({ error: "Prompt is required" }, { status: 400 });
  }

  const modelId = model || "gemini-3-flash-preview";
  const id = uuidv4();

  const MAX_IMAGES = 10;
  const imageList = Array.isArray(images)
    ? images.filter((i: unknown) => typeof i === "string").slice(0, MAX_IMAGES)
    : [];

  return createStreamingResponse(async (send) => {
    try {
      send({ type: "progress", message: "Generating code with AI..." });

      const { files, hasCalendar } = await generateFunnel(
        prompt.trim(),
        modelId,
        imageList.length > 0 ? imageList : undefined,
        scrapeData || undefined,
        request.signal,
        !!isImageClone
      );

      if (request.signal.aborted) {
        logGeneration({ userId, type: "generate", status: "error", errorMessage: "Aborted by user", model: modelId, funnelId: id, errorContext: { promptLength: prompt.trim().length, imageCount: imageList.length, isClone: !!scrapeData || !!isImageClone } });
        send({ type: "error", message: "Generation cancelled" });
        return;
      }

      send({ type: "progress", message: "Saving project..." });

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
        hasCalendar,
        chatHistory: [],
        createdAt: new Date().toISOString(),
      };

      await saveFunnel(funnel, userId);

      send({
        type: "result",
        data: {
          id,
          fileCount: Object.keys(files).length,
          hasCalendar,
        },
      });

      logGeneration({ userId, type: "generate", status: "success", model: modelId, funnelId: id });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      const stack = error instanceof Error ? error.stack?.slice(0, 1000) : undefined;
      logGeneration({ userId, type: "generate", status: "error", errorMessage: msg, model: modelId, funnelId: id, errorContext: { promptLength: prompt.trim().length, imageCount: imageList.length, isClone: !!scrapeData || !!isImageClone, stack } });
      throw error;
    }
  }, request.signal);
}
