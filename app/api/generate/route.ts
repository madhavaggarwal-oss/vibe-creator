import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { generateFunnel } from "@/lib/gemini";
import { saveFunnel, extractProjectName } from "@/lib/storage";
import { createStreamingResponse } from "@/lib/stream-response";
import { getCurrentUserId } from "@/lib/supabase/server";
import { logGeneration } from "@/lib/generation-log";
import { scrapeUrl as performScrape } from "@/lib/firecrawl";

export const maxDuration = 800;

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { prompt, model, images, scrapeData, scrapeUrl, isImageClone } = body;

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
      let finalImages = imageList;
      let finalScrapeData = scrapeData || undefined;
      let scrapedPageTitle: string | undefined;

      // Server-side scrape when a URL is provided (avoids 4.5MB client→server payload)
      if (scrapeUrl && typeof scrapeUrl === "string") {
        send({ type: "progress", message: "Scraping website..." });

        const scrapeResult = await performScrape(scrapeUrl);

        // Stream screenshot to client for UI display
        if (scrapeResult.screenshot) {
          send({
            type: "progress",
            message: "scrape-complete",
            data: { screenshot: scrapeResult.screenshot },
          });
          finalImages = [scrapeResult.screenshot];
        }

        // Build scrapeData for generation (without screenshot — it's passed via images)
        const { screenshot: _s, ...scrapeDataLite } = scrapeResult;
        finalScrapeData = scrapeDataLite;
        scrapedPageTitle = scrapeResult.metadata?.title;
      }

      send({ type: "progress", message: "Generating code with AI..." });

      const { files, hasCalendar } = await generateFunnel(
        prompt.trim(),
        modelId,
        finalImages.length > 0 ? finalImages : undefined,
        finalScrapeData || undefined,
        request.signal,
        !!isImageClone
      );

      if (request.signal.aborted) {
        logGeneration({ userId, type: "generate", status: "error", errorMessage: "Aborted by user", model: modelId, funnelId: id, errorContext: { promptLength: prompt.trim().length, imageCount: finalImages.length, isClone: !!finalScrapeData || !!isImageClone } });
        send({ type: "error", message: "Generation cancelled" });
        return;
      }

      send({ type: "progress", message: "Saving project..." });

      const name = extractProjectName(files) || prompt.trim().slice(0, 60);

      // Store actual URL for URL clones, or page title from client-provided scrapeData
      const funnelScrapeUrl = scrapeUrl || scrapedPageTitle || finalScrapeData?.metadata?.title;

      const funnel = {
        id,
        name,
        prompt: prompt.trim(),
        ...(finalImages.length > 0 ? { promptImages: finalImages } : {}),
        ...(funnelScrapeUrl ? { scrapeUrl: funnelScrapeUrl } : {}),
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
      logGeneration({ userId, type: "generate", status: "error", errorMessage: msg, model: modelId, funnelId: id, errorContext: { promptLength: prompt.trim().length, imageCount: imageList.length, isClone: !!scrapeUrl || !!scrapeData || !!isImageClone, stack } });
      throw error;
    }
  }, request.signal);
}
