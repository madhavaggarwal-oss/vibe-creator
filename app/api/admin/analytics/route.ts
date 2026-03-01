import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, createAdminClient, isAdminSession } from "@/lib/supabase/server";

interface GenerationLog {
  id: string;
  user_id: string;
  type: string;
  status: string;
  error_message: string | null;
  error_context: Record<string, unknown> | null;
  model: string | null;
  funnel_id: string | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = await isAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const days = Math.min(Math.max(parseInt(searchParams.get("days") || "7", 10) || 7, 1), 90);

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString();

  const admin = createAdminClient();

  // Fetch logs for the date range
  const { data: logs, error: logsError } = await admin
    .from("generation_logs")
    .select("id, user_id, type, status, error_message, error_context, model, funnel_id, created_at")
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false });

  if (logsError) {
    console.error("[admin/analytics] Failed to fetch logs:", logsError);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }

  // Fetch all auth users to resolve emails
  const { data: authData, error: authError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (authError) {
    console.error("[admin/analytics] Failed to fetch users:", authError);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }

  const userMap = new Map<string, { email: string; name: string }>();
  for (const u of authData.users) {
    userMap.set(u.id, {
      email: u.email || "unknown",
      name: u.user_metadata?.name || u.user_metadata?.full_name || "",
    });
  }

  // Compute overall stats
  const allLogs: GenerationLog[] = logs || [];
  const totalGenerations = allLogs.filter((l) => l.type === "generate").length;
  const successGenerations = allLogs.filter((l) => l.type === "generate" && l.status === "success").length;
  const errorGenerations = totalGenerations - successGenerations;
  const totalEdits = allLogs.filter((l) => l.type === "edit").length;
  const successEdits = allLogs.filter((l) => l.type === "edit" && l.status === "success").length;
  const errorEdits = totalEdits - successEdits;
  const activeUserIds = new Set(allLogs.map((l) => l.user_id));

  // Per-user breakdown
  const perUserMap = new Map<string, {
    totalGenerations: number;
    successGenerations: number;
    totalEdits: number;
    successEdits: number;
    errors: number;
    lastActive: string;
  }>();

  for (const log of allLogs) {
    let entry = perUserMap.get(log.user_id);
    if (!entry) {
      entry = { totalGenerations: 0, successGenerations: 0, totalEdits: 0, successEdits: 0, errors: 0, lastActive: log.created_at };
      perUserMap.set(log.user_id, entry);
    }

    if (log.type === "generate") {
      entry.totalGenerations++;
      if (log.status === "success") entry.successGenerations++;
    } else {
      entry.totalEdits++;
      if (log.status === "success") entry.successEdits++;
    }

    if (log.status === "error") entry.errors++;

    if (log.created_at > entry.lastActive) {
      entry.lastActive = log.created_at;
    }
  }

  const perUser = Array.from(perUserMap.entries()).map(([uid, stats]) => {
    const user = userMap.get(uid);
    return {
      email: user?.email || "unknown",
      name: user?.name || "",
      ...stats,
    };
  }).sort((a, b) => (a.totalGenerations + a.totalEdits) > (b.totalGenerations + b.totalEdits) ? -1 : 1);

  // Recent errors (last 20)
  const recentErrors = allLogs
    .filter((l) => l.status === "error" && l.error_message)
    .slice(0, 20)
    .map((l) => {
      const user = userMap.get(l.user_id);
      return {
        email: user?.email || "unknown",
        type: l.type,
        errorMessage: l.error_message,
        errorContext: l.error_context,
        model: l.model,
        createdAt: l.created_at,
      };
    });

  return NextResponse.json({
    days,
    overall: {
      totalGenerations,
      successGenerations,
      errorGenerations,
      totalEdits,
      successEdits,
      errorEdits,
      activeUsers: activeUserIds.size,
    },
    perUser,
    recentErrors,
  });
}
