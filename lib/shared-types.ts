/**
 * Shared types and utilities used across both server and client code.
 */

/**
 * Summary of a funnel project as returned by the /api/funnels listing endpoint.
 */
export interface FunnelProject {
  id: string;
  name: string;
  prompt: string;
  model: string;
  pageCount: number;
  fileCount: number;
  isReactProject: boolean;
  firstPageTitle: string;
  createdAt: string;
  previewSlug: string;
  hasSnapshot: boolean;
}

/**
 * Format a date string as a relative time (e.g. "Just now", "2 hours ago", "Edited yesterday").
 */
export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `Edited ${diffHours} hours ago`;
  if (diffDays === 1) return "Edited yesterday";
  if (diffDays < 30) return `Edited ${diffDays} days ago`;
  return `Edited ${date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`;
}
