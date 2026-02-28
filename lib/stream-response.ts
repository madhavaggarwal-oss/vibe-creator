/**
 * Streaming response utilities for long-running API routes.
 *
 * On Vercel, serverless functions time out if no data is sent for too long.
 * These utilities create an NDJSON stream that sends heartbeat pings to keep
 * the connection alive, then sends the final result as the last line.
 */

export interface StreamEvent {
  type: "heartbeat" | "progress" | "result" | "error";
  message?: string;
  data?: unknown;
}

/**
 * Create a streaming response that keeps the connection alive with heartbeats
 * while a long-running task executes.
 *
 * Usage:
 *   return createStreamingResponse(async (send) => {
 *     send({ type: "progress", message: "Generating code..." });
 *     const result = await longRunningTask();
 *     send({ type: "result", data: result });
 *   });
 */
export function createStreamingResponse(
  executor: (send: (event: StreamEvent) => void) => Promise<void>,
  signal?: AbortSignal
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // Stream may have been closed
        }
      };

      // Send heartbeats every 15 seconds to keep the connection alive
      const heartbeatInterval = setInterval(() => {
        send({ type: "heartbeat" });
      }, 15000);

      // Stop heartbeat if client disconnects
      const abortHandler = () => {
        clearInterval(heartbeatInterval);
      };
      signal?.addEventListener("abort", abortHandler);

      try {
        await executor(send);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          send({ type: "error", message: "Cancelled" });
        } else {
          const msg = error instanceof Error ? error.message : "Unknown error";
          send({ type: "error", message: msg });
        }
      } finally {
        clearInterval(heartbeatInterval);
        signal?.removeEventListener("abort", abortHandler);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    },
  });
}

/**
 * Client-side helper: Read an NDJSON stream and extract the final result.
 * Returns the data from the last "result" event, or throws on "error".
 *
 * Usage:
 *   const res = await fetch("/api/generate", { method: "POST", body, signal });
 *   const data = await readStreamResponse(res);
 */
export async function readStreamResponse<T = unknown>(
  response: Response,
  onProgress?: (message: string) => void
): Promise<T> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete lines
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event: StreamEvent = JSON.parse(line);
        switch (event.type) {
          case "progress":
            onProgress?.(event.message || "");
            break;
          case "result":
            result = event.data as T;
            break;
          case "error":
            throw new Error(event.message || "Stream error");
          case "heartbeat":
            // Ignore heartbeats
            break;
        }
      } catch (e) {
        if (e instanceof Error && e.message !== "Stream error") {
          // JSON parse error — ignore malformed lines
        } else {
          throw e;
        }
      }
    }
  }

  if (result === undefined) {
    throw new Error("No result received from stream");
  }

  return result;
}
