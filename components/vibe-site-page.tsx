"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { MODELS } from "./model-data";
import { processImageFiles, processCloneImageFiles, type PendingImage } from "@/lib/image-utils";
import { type FunnelProject, formatRelativeDate } from "@/lib/shared-types";
import ImageUpload from "./image-upload";
import { createClient } from "@/lib/supabase/client";

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

  // Delete state
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FunnelProject | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch("/api/funnels");
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
        }
      } catch (err) {
        console.error("[loadProjects] Failed to fetch projects:", err);
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

    // Use higher resolution for clone images (processed at 2048px vs 1024px)
    const processed = await processCloneImageFiles(files);
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

  const MAX_CLONE_IMAGES = 5;

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    const imageDataUrls = pendingImages
      .filter((img) => !img.loading && img.dataUrl)
      .map((img) => img.dataUrl);

    if ((!trimmed && imageDataUrls.length === 0) || generating) return;
    setError(null);

    // Check if prompt contains a URL → clone pipeline, otherwise → generate
    // Matches https://... OR bare domains like example.com, foo.bar.com/path
    const httpMatch = trimmed.match(/https?:\/\/[^\s]+/i);
    const bareMatch = !httpMatch ? trimmed.match(/(?:^|\s)([\w-]+\.[\w.-]+\.[a-z]{2,}(?:\/\S*)?|[\w-]+\.[a-z]{2,}(?:\/\S*)?)/i) : null;
    const hasUrl = !!(httpMatch || bareMatch);

    // Clone-intent keywords for image-based cloning
    const cloneIntentRegex = /\b(clone|replicate|copy|recreate|replica|make this exact|same as this|build this exact)\b/i;
    const hasImages = imageDataUrls.length > 0;
    const isImageClone = !hasUrl && hasImages && (!trimmed || cloneIntentRegex.test(trimmed));

    console.log(`[handleSubmit] Pipeline routing — hasUrl: ${hasUrl}, hasImages: ${hasImages} (${imageDataUrls.length}), isImageClone: ${isImageClone}, prompt: "${trimmed.slice(0, 80)}"`);

    try {
      if (hasUrl) {
        // Tier 1: URL detected → existing scrape+clone pipeline
        const extractedUrl = httpMatch ? httpMatch[0] : bareMatch![1];
        const fullUrl = extractedUrl.startsWith("http") ? extractedUrl : `https://${extractedUrl}`;
        console.log(`[handleSubmit] → Pipeline: URL_CLONE | Sub: scrape+generate | URL: ${fullUrl}`);
        sessionStorage.setItem(
          "vibe-pending-generation",
          JSON.stringify({
            prompt: trimmed,
            model,
            images: [],
            scrapeUrl: fullUrl,
          })
        );
      } else if (isImageClone) {
        // Tier 2: Images + (no text OR clone-intent keywords) → image clone pipeline
        console.log(`[handleSubmit] → Pipeline: IMAGE_CLONE | Sub: direct generate | Images: ${imageDataUrls.length}, hasText: ${!!trimmed}`);
        const cloneImages = imageDataUrls.slice(0, MAX_CLONE_IMAGES);
        const clonePrompt = trimmed || "Clone this website exactly as shown in the screenshots.";
        sessionStorage.setItem(
          "vibe-pending-generation",
          JSON.stringify({
            prompt: clonePrompt,
            model,
            images: cloneImages,
            isImageClone: true,
          })
        );
      } else {
        // Tier 3: Normal generation
        console.log(`[handleSubmit] → Pipeline: NORMAL_GENERATION | Sub: ${imageDataUrls.length > 0 ? 'with reference images' : 'text only'}`);
        sessionStorage.setItem(
          "vibe-pending-generation",
          JSON.stringify({
            prompt: trimmed,
            model,
            images: imageDataUrls,
          })
        );
      }
    } catch {
      // sessionStorage might fail in some contexts
    }

    window.location.href = "/generate/new";
  };

  const formatDate = formatRelativeDate;

  const handleDeleteProject = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/funnel/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
        setToast("Project deleted");
        setTimeout(() => setToast(null), 3000);
      } else {
        console.error("[handleDeleteProject] Delete failed with status:", res.status);
        setToast("Failed to delete project");
        setTimeout(() => setToast(null), 3000);
      }
    } catch (err) {
      console.error("[handleDeleteProject] Delete request failed:", err);
      setToast("Failed to delete project");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logout button */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg bg-white/70 backdrop-blur-sm border border-gray-200/60 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-white/90 transition-all shadow-sm"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>

      {/* Hero section with animated background */}
      <div className="relative overflow-hidden" style={{ minHeight: "83vh" }}>
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
        <div className="relative z-10 flex flex-col items-center justify-center px-6 py-20" style={{ minHeight: "83vh" }}>
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
            What&apos;s on your mind, Varun?
          </h1>

          {/* Prompt Input Card */}
          <div className="w-full max-w-[640px]">
            <div className="rounded-2xl bg-white/80 backdrop-blur-md border border-gray-200/80 shadow-lg shadow-black/5 overflow-hidden">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe a site to create, or paste a URL to clone..."
                rows={3}
                disabled={generating}
                className="w-full resize-none border-0 bg-transparent px-5 pt-4 pb-2 text-[15px] text-gray-800 placeholder-gray-400 outline-none disabled:opacity-50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
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
                    onClick={handleSubmit}
                    disabled={generating || (!prompt.trim() && pendingImages.filter(img => !img.loading && img.dataUrl).length === 0)}
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
                <div
                  key={project.id}
                  className="group relative text-left rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200 cursor-pointer"
                  onClick={() => router.push(`/generate/${project.id}`)}
                >
                  {/* Preview thumbnail */}
                  <div className="relative h-44 bg-gray-50 overflow-hidden rounded-t-xl">
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

                  {/* Project info + kebab menu */}
                  <div className="flex items-start justify-between px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {project.name}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDate(project.createdAt)}
                      </p>
                    </div>

                    {/* Kebab menu */}
                    <div className="relative shrink-0 ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === project.id ? null : project.id);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-600 transition-all"
                      >
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                          <circle cx="8" cy="3" r="1.5" />
                          <circle cx="8" cy="8" r="1.5" />
                          <circle cx="8" cy="13" r="1.5" />
                        </svg>
                      </button>

                      {menuOpenId === project.id && (
                        <>
                          <div className="fixed inset-0 z-20" onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); }} />
                          <div className="absolute right-0 top-full mt-1 z-30 w-36 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenId(null);
                                setDeleteTarget(project);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => !deleting && setDeleteTarget(null)}>
          <div
            className="w-full max-w-md rounded-2xl bg-white px-7 py-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with close button */}
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-xl font-bold text-gray-900">
                Delete {deleteTarget.name}?
              </h3>
              <button
                onClick={() => !deleting && setDeleteTarget(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors -mr-1 -mt-1"
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <p className="text-[15px] text-gray-600 leading-relaxed">
              This action cannot be undone.{" "}
              <span className="text-red-600 font-medium">This will permanently delete your project.</span>{" "}
              Including:
            </p>
            <ul className="mt-3 mb-6 ml-1 space-y-1.5 text-[15px] text-gray-600 list-disc list-inside">
              <li>All project files and chat history</li>
              <li>All preview links</li>
            </ul>

            {/* Buttons */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProject}
                disabled={deleting}
                className="rounded-lg bg-red-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-800 transition-colors disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2.5 text-sm text-white shadow-lg animate-[fadeInUp_0.2s_ease-out]">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          {toast}
        </div>
      )}
    </div>
  );
}
