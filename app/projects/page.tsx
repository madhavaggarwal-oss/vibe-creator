"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import HighLevelLayout from "@/components/highlevel-layout";

interface FunnelProject {
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

const ITEMS_PER_PAGE = 24; // 6 rows x 4 cols

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<FunnelProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch("/api/funnels");
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
        }
      } catch {
        // silent fail
      } finally {
        setLoading(false);
      }
    }
    loadProjects();
  }, []);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, searchQuery]);

  // Reset visible count when search changes
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [searchQuery]);

  const visibleProjects = filteredProjects.slice(0, visibleCount);
  const hasMore = visibleCount < filteredProjects.length;

  const formatDate = (dateStr: string) => {
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
  };

  return (
    <HighLevelLayout activeTab="Vibe Creator" onTabChange={() => router.push("/")}>
      <div className="flex-1 bg-gray-50/80 px-6 py-6">
        <div className="max-w-[1200px] mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/")}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
              </button>
              <h1 className="text-lg font-semibold text-gray-900">All projects</h1>
              {!loading && (
                <span className="text-sm text-gray-400">({filteredProjects.length})</span>
              )}
            </div>
          </div>

          {/* Search bar */}
          <div className="mb-5">
            <div className="relative max-w-md">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 py-2 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-44 rounded-xl bg-gray-200" />
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-gray-200" />
                    <div className="flex-1">
                      <div className="h-4 w-3/4 rounded bg-gray-200" />
                      <div className="mt-1 h-3 w-1/2 rounded bg-gray-200" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              {searchQuery ? (
                <>
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
                    <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#9CA3AF" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold text-gray-800">No projects matching &quot;{searchQuery}&quot;</h3>
                  <p className="mt-1 text-sm text-gray-500">Try a different search term.</p>
                </>
              ) : (
                <>
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FEC403]/10 via-[#2896FB]/10 to-[#4BCF29]/10">
                    <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#2896FB" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold text-gray-800">No projects yet</h3>
                  <p className="mt-1 text-sm text-gray-500">Go back to create your first project.</p>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {visibleProjects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => router.push(`/generate/${project.id}`)}
                    className="group text-left rounded-xl overflow-hidden bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200"
                  >
                    {/* Preview thumbnail */}
                    <div className="relative h-44 bg-gray-50 overflow-hidden">
                      <iframe
                        src={project.hasSnapshot
                          ? `/api/funnel/${project.id}/snapshot`
                          : project.isReactProject
                            ? `/preview-react/${project.id}`
                            : `/preview/${project.id}/${project.previewSlug}/`
                        }
                        className="w-[1440px] h-[900px] border-0 pointer-events-none"
                        style={{
                          transform: "scale(0.2)",
                          transformOrigin: "top left",
                        }}
                        title={project.name}
                        tabIndex={-1}
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                    </div>

                    {/* Project info */}
                    <div className="px-4 py-3.5">
                      <p className="text-sm font-semibold text-gray-800 truncate">{project.name}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatDate(project.createdAt)}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={() => setVisibleCount((prev) => prev + ITEMS_PER_PAGE)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-all"
                  >
                    Load more
                    <span className="text-xs text-gray-400">
                      ({filteredProjects.length - visibleCount} remaining)
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </HighLevelLayout>
  );
}
