"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { MODELS } from "./model-data";
import { processImageFiles, type PendingImage } from "@/lib/image-utils";
import ImageUpload from "./image-upload";

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

export default function VibeSitePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string>(MODELS[0].id);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<FunnelProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clone from URL state
  const [cloneUrl, setCloneUrl] = useState("");
  const [scraping] = useState(false);

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
        setLoadingProjects(false);
      }
    }
    loadProjects();
  }, []);

  const handleImageSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Add placeholders with loading state
    const placeholders: PendingImage[] = Array.from(files).map((f) => ({
      dataUrl: "",
      name: f.name,
      loading: true,
    }));
    const startIdx = pendingImages.length;
    setPendingImages((prev) => [...prev, ...placeholders]);

    const processed = await processImageFiles(files);
    setPendingImages((prev) => {
      const updated = [...prev];
      processed.forEach((img, i) => {
        const idx = startIdx + i;
        if (idx < updated.length) {
          updated[idx] = { ...img, loading: false };
        }
      });
      return updated;
    });
  };

  const handleCloneUrl = () => {
    const url = cloneUrl.trim();
    if (!url || scraping) return;

    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    const clonePrompt = prompt.trim() || `Clone this website: ${url}`;

    try {
      sessionStorage.setItem(
        "vibe-pending-generation",
        JSON.stringify({
          prompt: clonePrompt,
          model,
          images: [],
          scrapeUrl: fullUrl,
        })
      );
    } catch {
      // sessionStorage might fail
    }

    window.location.href = "/generate/new";
  };

  const handleGenerate = () => {
    const trimmed = prompt.trim();
    if (!trimmed || generating) return;

    const imageDataUrls = pendingImages
      .filter((img) => !img.loading && img.dataUrl)
      .map((img) => img.dataUrl);

    // Store prompt data synchronously, then navigate to the builder
    try {
      sessionStorage.setItem(
        "vibe-pending-generation",
        JSON.stringify({
          prompt: trimmed,
          model,
          images: imageDataUrls,
        })
      );
    } catch {
      // sessionStorage might fail in some contexts
    }

    // Use window.location for reliable navigation (avoids client-side routing quirks)
    window.location.href = "/generate/new";
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `Edited ${diffHours} hours ago`;
    if (diffDays === 1) return "Edited yesterday";
    if (diffDays < 30)
      return `Edited ${diffDays} days ago`;
    return `Edited ${date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Hero section with animated background */}
      <div className="relative overflow-hidden" style={{ minHeight: "60vh" }}>
        {/* Animated gradient background */}
        <div className="absolute inset-0 vibe-animated-bg">
          {/* Moving gradient overlay */}
          <div className="absolute inset-0 vibe-gradient-sweep" />
          {/* Gradient blobs */}
          <div className="absolute w-[600px] h-[600px] rounded-full opacity-40 blur-[120px] vibe-blob-1" />
          <div className="absolute w-[500px] h-[500px] rounded-full opacity-35 blur-[100px] vibe-blob-2" />
          <div className="absolute w-[400px] h-[400px] rounded-full opacity-30 blur-[80px] vibe-blob-3" />
          {/* Subtle mesh overlay */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.3) 1px, transparent 0)",
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center px-6 py-20" style={{ minHeight: "60vh" }}>
          {/* Badge */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur-sm border border-gray-200/60 px-4 py-1.5 shadow-sm">
            <span className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#FEC403] via-[#2896FB] to-[#4BCF29] px-2 py-0.5 text-[10px] font-bold text-white">
              New
            </span>
            <span className="text-sm text-gray-700 font-medium">
              Build sites with AI in seconds
            </span>
            <svg
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              className="text-gray-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </div>

          {/* Heading */}
          <h1 className="mb-8 text-3xl font-bold text-gray-800 tracking-tight text-center">
            What&apos;s on your mind?
          </h1>

          {/* Prompt Input Card */}
          <div className="w-full max-w-[640px]">
            <div className="rounded-2xl bg-white/80 backdrop-blur-md border border-gray-200/80 shadow-lg shadow-black/5 overflow-hidden">
              {/* Clone from URL input */}
              <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                <div className="flex flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5">
                  <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                  <input
                    type="text"
                    value={cloneUrl}
                    onChange={(e) => setCloneUrl(e.target.value)}
                    placeholder="Paste a URL to clone a website..."
                    disabled={scraping}
                    className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none disabled:opacity-50"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCloneUrl();
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCloneUrl}
                  disabled={!cloneUrl.trim() || scraping}
                  className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  {scraping ? (
                    <>
                      <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Scraping...
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m0-3l-3-3m0 0l-3 3m3-3v11.25" />
                      </svg>
                      Clone
                    </>
                  )}
                </button>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the site you want to create..."
                rows={3}
                disabled={generating}
                className="w-full resize-none border-0 bg-transparent px-5 pt-4 pb-2 text-[15px] text-gray-800 placeholder-gray-400 outline-none disabled:opacity-50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />
              {/* Image previews */}
              {pendingImages.length > 0 && (
                <div className="px-4 pb-1">
                  <ImageUpload
                    images={pendingImages}
                    onRemove={(idx) => setPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                  />
                </div>
              )}
              <div className="flex items-center justify-between px-4 pb-3">
                <div className="flex items-center gap-2">
                  {/* Attach button */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handleImageSelect(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  >
                    <svg
                      width="18"
                      height="18"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 4.5v15m7.5-7.5h-15"
                      />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {/* Model selector */}
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={generating}
                    className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600 outline-none focus:border-blue-300 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>

                  {/* Submit button */}
                  <button
                    onClick={handleGenerate}
                    disabled={generating || !prompt.trim()}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-[#FEC403] via-[#2896FB] to-[#4BCF29] text-white shadow-sm transition-all hover:shadow-md hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:shadow-sm"
                  >
                    {generating ? (
                      <svg
                        className="h-4 w-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                    ) : (
                      <svg
                        width="16"
                        height="16"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Projects section */}
      <div className="flex-1 bg-gray-50/80 border-t border-gray-100 px-6 py-6">
        <div className="max-w-[1200px] mx-auto">
          {/* Projects header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-900">My projects</h2>
            {projects.length > 0 && (
              <button
                onClick={() => router.push("/projects")}
                className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Browse all
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Projects grid */}
          {loadingProjects ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {[1, 2, 3, 4].map((i) => (
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
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FEC403]/10 via-[#2896FB]/10 to-[#4BCF29]/10">
                <svg
                  width="28"
                  height="28"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="#2896FB"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-gray-800">
                No projects yet
              </h3>
              <p className="mt-1 text-sm text-gray-500 max-w-xs">
                Describe what you want to build above and let AI create it for
                you.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {projects.slice(0, 32).map((project) => (
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
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                  </div>

                  {/* Project info */}
                  <div className="px-4 py-3.5">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {project.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDate(project.createdAt)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
