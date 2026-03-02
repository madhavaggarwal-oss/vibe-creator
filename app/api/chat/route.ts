import { NextRequest } from "next/server";
import { editFunnel } from "@/lib/gemini";
import { getFunnel, saveFunnel, isReactProject, deleteSnapshot } from "@/lib/storage";
import { processImageMarkers } from "@/lib/image-gen";
import { createStreamingResponse } from "@/lib/stream-response";
import { getCurrentUserId } from "@/lib/supabase/server";
import { logGeneration } from "@/lib/generation-log";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { funnelId, message, model, images } = body;

  if (!funnelId || typeof funnelId !== "string") {
    return Response.json({ error: "funnelId is required" }, { status: 400 });
  }
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const funnel = await getFunnel(funnelId, userId);
  if (!funnel) {
    return Response.json({ error: "Funnel not found" }, { status: 404 });
  }

  if (!isReactProject(funnel)) {
    return Response.json(
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

  return createStreamingResponse(async (send) => {
    try {
      send({ type: "progress", message: "Editing with AI..." });

      const result = await editFunnel(
        funnel.files!,
        trimmedMessage,
        funnel.chatHistory,
        modelId,
        imageList.length > 0 ? imageList : undefined,
        request.signal
      );

      const errCtx = { promptLength: trimmedMessage.length, imageCount: imageList.length };

      if (request.signal.aborted) {
        logGeneration({ userId, type: "edit", status: "error", errorMessage: "Aborted by user", model: modelId, funnelId, errorContext: errCtx });
        send({ type: "error", message: "Edit cancelled" });
        return;
      }

      send({ type: "progress", message: "Processing changes..." });

      // Merge partial file updates into existing files
      const updatedFiles = { ...funnel.files! };
      for (const [filePath, content] of Object.entries(result.files)) {
        if (content === null) {
          delete updatedFiles[filePath];
        } else {
          updatedFiles[filePath] = content;
        }
      }

      // Process image markers in changed files
      const needsImageProcessing = Object.values(updatedFiles).some(
        (v) =>
          typeof v === "string" &&
          (/__IMG/.test(v) ||
            /src\s*=\s*"(?:\/placeholder|\.?\/?assets\/|\.?\/?images?\/|https?:\/\/(?:via\.placeholder|placehold\.|picsum|placekitten))[^"]*"/i.test(v) ||
            /src\s*=\s*""\s/i.test(v))
      );

      if (request.signal.aborted) {
        logGeneration({ userId, type: "edit", status: "error", errorMessage: "Aborted by user", model: modelId, funnelId, errorContext: errCtx });
        send({ type: "error", message: "Edit cancelled" });
        return;
      }

      if (needsImageProcessing) {
        send({ type: "progress", message: "Generating images..." });
      }

      const finalFiles = needsImageProcessing
        ? await processImageMarkers(updatedFiles)
        : updatedFiles;

      if (request.signal.aborted) {
        logGeneration({ userId, type: "edit", status: "error", errorMessage: "Aborted by user", model: modelId, funnelId, errorContext: errCtx });
        send({ type: "error", message: "Edit cancelled" });
        return;
      }

      send({ type: "progress", message: "Saving changes..." });

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

      console.log(`[Chat API] hasCalendar: ${result.hasCalendar}`);

      await saveFunnel({
        ...funnel,
        files: finalFiles,
        chatHistory,
        hasCalendar: result.hasCalendar,
        ...(!result.hasCalendar && funnel.hasCalendar ? {
          selectedCalendarId: undefined,
          selectedCalendarName: undefined,
          calendarSlots: undefined,
        } : {}),
      }, userId);

      await deleteSnapshot(funnelId);

      send({
        type: "result",
        data: {
          message: result.message,
          changedFiles: Object.keys(result.files),
          hasCalendar: result.hasCalendar,
        },
      });

      logGeneration({ userId, type: "edit", status: "success", model: modelId, funnelId });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      const stack = error instanceof Error ? error.stack?.slice(0, 1000) : undefined;
      logGeneration({ userId, type: "edit", status: "error", errorMessage: msg, model: modelId, funnelId, errorContext: { promptLength: trimmedMessage.length, imageCount: imageList.length, stack } });
      throw error;
    }
  }, request.signal);
}
