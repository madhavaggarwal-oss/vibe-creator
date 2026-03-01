import { createAdminClient } from "@/lib/supabase/server";

interface ErrorContext {
  promptLength?: number;
  imageCount?: number;
  isClone?: boolean;
  stack?: string;
}

interface LogGenerationParams {
  userId: string;
  type: "generate" | "edit";
  status: "success" | "error";
  errorMessage?: string;
  errorContext?: ErrorContext;
  model?: string;
  funnelId?: string;
}

/**
 * Fire-and-forget logging of generation/edit attempts to `generation_logs`.
 * Uses the admin client to bypass RLS. Never throws — errors are silently logged.
 */
export function logGeneration(params: LogGenerationParams): void {
  const admin = createAdminClient();
  admin
    .from("generation_logs")
    .insert({
      user_id: params.userId,
      type: params.type,
      status: params.status,
      error_message: params.errorMessage || null,
      error_context: params.errorContext || null,
      model: params.model || null,
      funnel_id: params.funnelId || null,
    })
    .then(({ error }: { error: unknown }) => {
      if (error) {
        console.error("[generation-log] Failed to log:", error);
      }
    })
    .catch((err: unknown) => {
      console.error("[generation-log] Unexpected error:", err);
    });
}
