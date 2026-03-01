"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface OverallStats {
  totalGenerations: number;
  successGenerations: number;
  errorGenerations: number;
  totalEdits: number;
  successEdits: number;
  errorEdits: number;
  activeUsers: number;
}

interface PerUserStats {
  email: string;
  name: string;
  totalGenerations: number;
  successGenerations: number;
  totalEdits: number;
  successEdits: number;
  errors: number;
  lastActive: string;
}

interface RecentError {
  email: string;
  type: string;
  errorMessage: string;
  errorContext: {
    promptLength?: number;
    imageCount?: number;
    isClone?: boolean;
    stack?: string;
  } | null;
  model: string | null;
  createdAt: string;
}

interface AnalyticsData {
  days: number;
  overall: OverallStats;
  perUser: PerUserStats[];
  recentErrors: RecentError[];
}

const DAY_OPTIONS = [1, 3, 7, 14, 30];

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1d ago";
  return `${diffDays}d ago`;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?days=${d}`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 403) {
        setError("You do not have admin access.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError("Failed to load analytics.");
        setLoading(false);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      setError("Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData(days);
  }, [days, fetchData]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link
            href="/"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">Analytics</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Day selector */}
        <div className="flex items-center gap-2 mb-6">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                days === d
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-white border border-gray-200 shadow-sm px-6 py-12 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <SummaryCard label="Generations" value={data.overall.totalGenerations} />
              <SummaryCard label="Gen. Success" value={data.overall.successGenerations} color="green" />
              <SummaryCard label="Gen. Errors" value={data.overall.errorGenerations} color="red" />
              <SummaryCard label="Edits" value={data.overall.totalEdits} />
              <SummaryCard label="Active Users" value={data.overall.activeUsers} color="blue" />
            </div>

            {/* Per-user table */}
            <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">Per-User Breakdown</h2>
              </div>
              {data.perUser.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-gray-500">No activity in this period.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="px-6 py-3">User</th>
                        <th className="px-4 py-3 text-center">Generations</th>
                        <th className="px-4 py-3 text-center">Edits</th>
                        <th className="px-4 py-3 text-center">Errors</th>
                        <th className="px-4 py-3 text-right">Last Active</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.perUser.map((u) => (
                        <tr key={u.email} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3.5">
                            <p className="font-medium text-gray-900 truncate max-w-[200px]">
                              {u.name || u.email}
                            </p>
                            {u.name && (
                              <p className="text-xs text-gray-500 truncate max-w-[200px]">{u.email}</p>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span className="text-gray-900 font-medium">{u.successGenerations}</span>
                            <span className="text-gray-400">/{u.totalGenerations}</span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span className="text-gray-900 font-medium">{u.successEdits}</span>
                            <span className="text-gray-400">/{u.totalEdits}</span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {u.errors > 0 ? (
                              <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                                {u.errors}
                              </span>
                            ) : (
                              <span className="text-gray-400">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right text-gray-500">
                            {formatTimeAgo(u.lastActive)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recent errors */}
            <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">Recent Errors</h2>
                <p className="mt-1 text-sm text-gray-500">Last 20 errors in the selected period</p>
              </div>
              {data.recentErrors.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-gray-500">No errors in this period.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {data.recentErrors.map((e, i) => (
                    <div key={i} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3 mb-1.5">
                        <span className="text-xs text-gray-500">{formatTimeAgo(e.createdAt)}</span>
                        <span className="text-xs text-gray-400">·</span>
                        <span className="text-xs font-medium text-gray-700">{e.email}</span>
                        <span className="text-xs text-gray-400">·</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          e.type === "generate"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-purple-50 text-purple-700"
                        }`}>
                          {e.type}
                        </span>
                        {e.model && (
                          <>
                            <span className="text-xs text-gray-400">·</span>
                            <span className="text-xs text-gray-500">{e.model}</span>
                          </>
                        )}
                      </div>
                      <p className="text-sm text-red-600 break-all">{e.errorMessage}</p>
                      {e.errorContext && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {e.errorContext.promptLength != null && (
                            <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                              prompt: {e.errorContext.promptLength} chars
                            </span>
                          )}
                          {e.errorContext.imageCount != null && e.errorContext.imageCount > 0 && (
                            <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                              images: {e.errorContext.imageCount}
                            </span>
                          )}
                          {e.errorContext.isClone && (
                            <span className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                              clone
                            </span>
                          )}
                          {e.errorContext.stack && (
                            <details className="w-full mt-1">
                              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">Stack trace</summary>
                              <pre className="mt-1 text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{e.errorContext.stack}</pre>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: "green" | "red" | "blue" }) {
  const colorClasses = {
    green: "text-green-700",
    red: "text-red-700",
    blue: "text-blue-700",
  };

  return (
    <div className="rounded-2xl bg-white border border-gray-200 shadow-sm px-5 py-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ? colorClasses[color] : "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}
