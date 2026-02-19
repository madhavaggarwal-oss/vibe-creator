import { Langfuse } from "langfuse";
import { AsyncLocalStorage } from "node:async_hooks";

// Lazy singleton — created on first use when env vars are present
let instance: Langfuse | null = null;

function getLangfuse(): Langfuse | null {
  if (instance) return instance;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  if (!secretKey || !publicKey) return null;
  instance = new Langfuse({
    secretKey,
    publicKey,
    baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
  });
  return instance;
}

// Carries the active Langfuse trace through async call chains
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const traceStorage = new AsyncLocalStorage<any>();

/**
 * Run an async function within a Langfuse trace.
 * All calls to getActiveTrace() inside `fn` (including nested async calls)
 * will return this trace, enabling child spans/generations.
 * No-ops gracefully when Langfuse env vars are missing.
 */
export async function withLangfuseTrace<T>(
  name: string,
  sessionId: string,
  options: { metadata?: Record<string, unknown>; input?: unknown },
  fn: () => Promise<T>
): Promise<T> {
  const lf = getLangfuse();
  if (!lf) return fn();

  const trace = lf.trace({
    name,
    sessionId,
    metadata: options.metadata,
    input: options.input,
  });
  try {
    const result = await traceStorage.run(trace, fn);
    trace.update({ output: result });
    return result;
  } catch (error) {
    trace.update({
      output: { error: error instanceof Error ? error.message : String(error) },
      metadata: { ...options.metadata, error: true },
    });
    throw error;
  }
}

/**
 * Get the active Langfuse trace from the current async context.
 * Returns null when no trace is active or Langfuse is not configured.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getActiveTrace(): any | null {
  return traceStorage.getStore() ?? null;
}

/**
 * Flush pending Langfuse events. Call via Next.js `after()` to avoid
 * adding latency to the response.
 */
export async function flushLangfuse(): Promise<void> {
  const lf = getLangfuse();
  if (!lf) return;
  try {
    await lf.flushAsync();
  } catch (error) {
    console.warn("[langfuse] Flush failed:", error);
  }
}
