"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import hljs from "highlight.js/lib/core";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import "highlight.js/styles/github-dark.css";
import { processImageFiles, type PendingImage } from "@/lib/image-utils";
import ImageUpload from "@/components/image-upload";

hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("json", json);

// Dynamically import Sandpack to avoid SSR issues
const ReactProjectPreview = dynamic(
  () => import("@/components/react-preview"),
  { ssr: false, loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <p className="text-sm text-gray-500">Loading preview...</p>
      </div>
    </div>
  )}
);

interface CodeFile {
  name: string;
  path: string;
  content: string;
  size: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  images?: string[];
}

interface FunnelData {
  id: string;
  name?: string;
  prompt: string;
  promptImages?: string[];
  model: string;
  files?: Record<string, string>;
  chatHistory: ChatMessage[];
  createdAt: string;
}

// File tree node for nested folder structure
interface FileTreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children?: FileTreeNode[];
  size?: number;
}

const DEVICES = [
  { id: "desktop", label: "Desktop", width: "100%", height: "100%" },
  { id: "tablet", label: "Tablet", width: "768px", height: "1024px" },
  { id: "mobile", label: "Mobile", width: "375px", height: "812px" },
] as const;

const GENERATION_STEPS = [
  { label: "Analyzing your requirements", icon: "scan", duration: 3000 },
  { label: "Designing component architecture", icon: "layout", duration: 4000 },
  { label: "Building React components", icon: "palette", duration: 5000 },
  { label: "Setting up routing", icon: "nav", duration: 3000 },
  { label: "Generating page content", icon: "code", duration: 6000 },
  { label: "Styling with Tailwind CSS", icon: "responsive", duration: 4000 },
  { label: "Adding animations & interactions", icon: "sparkle", duration: 3000 },
  { label: "Connecting all pages", icon: "link", duration: 3000 },
  { label: "Finalizing your project", icon: "check", duration: 5000 },
];

type GeneratingState = "idle" | "generating" | "aborted" | "error";

function getFileLanguage(filePath: string): string {
  if (filePath.endsWith(".tsx") || filePath.endsWith(".ts")) return "typescript";
  if (filePath.endsWith(".json")) return "json";
  if (filePath.endsWith(".css")) return "css";
  if (filePath.endsWith(".html")) return "xml";
  if (filePath.endsWith(".js") || filePath.endsWith(".jsx")) return "javascript";
  return "typescript";
}

function getFileIcon(name: string): { color: string; type: "code" | "config" | "style" | "folder" } {
  if (name.endsWith(".tsx") || name.endsWith(".jsx")) return { color: "#61dafb", type: "code" };
  if (name.endsWith(".ts") || name.endsWith(".js")) return { color: "#f0db4f", type: "code" };
  if (name.endsWith(".css")) return { color: "#a855f7", type: "style" };
  if (name.endsWith(".html")) return { color: "#e06c75", type: "code" };
  if (name.endsWith(".json")) return { color: "#98c379", type: "config" };
  return { color: "#9ca3af", type: "config" };
}

function buildFileTree(files: CodeFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const folderMap = new Map<string, FileTreeNode>();

  // Sort files by path
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    const parts = file.path.replace(/^\//, "").split("/");
    let currentLevel = root;

    // Create folders
    for (let i = 0; i < parts.length - 1; i++) {
      const folderPath = "/" + parts.slice(0, i + 1).join("/");
      let folder = folderMap.get(folderPath);
      if (!folder) {
        folder = {
          name: parts[i],
          path: folderPath,
          isFolder: true,
          children: [],
        };
        folderMap.set(folderPath, folder);
        currentLevel.push(folder);
      }
      currentLevel = folder.children!;
    }

    // Add file
    currentLevel.push({
      name: parts[parts.length - 1],
      path: file.path,
      isFolder: false,
      size: file.size,
    });
  }

  // Sort: folders first, then files
  function sortNodes(nodes: FileTreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children) sortNodes(node.children);
    }
  }
  sortNodes(root);

  return root;
}

export default function GenerateResultPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params.id as string;

  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<string>("desktop");

  // Generation state (for new funnels)
  const [generatingState, setGeneratingState] = useState<GeneratingState>("idle");
  const [generationStep, setGenerationStep] = useState(0);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [pendingPrompt, setPendingPrompt] = useState<string>("");
  const [pendingModel, setPendingModel] = useState<string>("");
  const generateAbortRef = useRef<AbortController | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [editModel, setEditModel] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [chatPendingImages, setChatPendingImages] = useState<PendingImage[]>([]);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const [pendingPromptImages, setPendingPromptImages] = useState<string[]>([]);

  // Code view state (view-only)
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [codeFiles, setCodeFiles] = useState<CodeFile[]>([]);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string>("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["/src", "/src/pages", "/src/components"]));
  const [downloadDropdownOpen, setDownloadDropdownOpen] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  // Snapshot capture ref to track if we need to capture
  const snapshotPendingRef = useRef(false);

  // Capture snapshot from Sandpack iframe and save it
  const captureSnapshot = useCallback((funnelId: string) => {
    // Wait for Sandpack to finish rendering
    setTimeout(() => {
      const iframe = document.querySelector('.sp-preview-iframe') as HTMLIFrameElement;
      if (!iframe) return;

      const handleMessage = (e: MessageEvent) => {
        if (e.data && e.data.type === "html-snapshot" && e.data.html) {
          window.removeEventListener("message", handleMessage);
          fetch(`/api/funnel/${funnelId}/snapshot`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ html: e.data.html }),
          }).catch(() => { /* silent fail */ });
        }
      };
      window.addEventListener("message", handleMessage);
      iframe.contentWindow?.postMessage({ type: "capture-html" }, "*");

      // Cleanup listener after 10s if no response
      setTimeout(() => window.removeEventListener("message", handleMessage), 10000);
    }, 4000);
  }, []);

  // Project files for Sandpack preview
  const projectFiles = funnel?.files || null;

  // Page route state (must be declared here with all other hooks)
  const [currentPage, setCurrentPage] = useState("/");

  const startGeneration = useCallback(
    async (prompt: string, model: string, images?: string[], scrapeData?: Record<string, unknown>) => {
      setGeneratingState("generating");
      setGenerationStep(0);
      setGenerationProgress(0);

      // Animate steps
      let step = 0;
      stepTimerRef.current = setInterval(() => {
        step = (step + 1) % GENERATION_STEPS.length;
        setGenerationStep(step);
      }, 3500);

      // Animate progress (slow ramp to ~85%, then pause)
      let progress = 0;
      progressTimerRef.current = setInterval(() => {
        progress += 0.3 + Math.random() * 0.4;
        if (progress > 85) progress = 85;
        setGenerationProgress(progress);
      }, 200);

      const controller = new AbortController();
      generateAbortRef.current = controller;

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, model, images, scrapeData }),
          signal: controller.signal,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to generate");

        // Finish progress
        if (progressTimerRef.current) clearInterval(progressTimerRef.current);
        if (stepTimerRef.current) clearInterval(stepTimerRef.current);
        setGenerationProgress(100);

        // Small delay for the 100% animation to show
        await new Promise((r) => setTimeout(r, 600));

        // Update URL without navigation
        window.history.replaceState(null, "", `/generate/${data.id}`);

        // Load the funnel
        const funnelRes = await fetch(`/api/funnel/${data.id}`);
        if (!funnelRes.ok) throw new Error("Failed to load funnel");
        const funnelData = await funnelRes.json();

        setFunnel(funnelData);
        setChatMessages(funnelData.chatHistory || []);
        setEditModel(funnelData.model);
        setGeneratingState("idle");
        setLoading(false);

        // Capture snapshot after Sandpack renders
        captureSnapshot(data.id);
      } catch (err: unknown) {
        if (progressTimerRef.current) clearInterval(progressTimerRef.current);
        if (stepTimerRef.current) clearInterval(stepTimerRef.current);

        if (err instanceof DOMException && err.name === "AbortError") {
          setGeneratingState("aborted");
        } else {
          const message =
            err instanceof Error ? err.message : "Something went wrong";
          setError(message);
          setGeneratingState("error");
        }
      } finally {
        generateAbortRef.current = null;
      }
    },
    [captureSnapshot]
  );

  useEffect(() => {
    if (rawId === "new") {
      // New generation flow
      const stored = sessionStorage.getItem("vibe-pending-generation");
      if (stored) {
        sessionStorage.removeItem("vibe-pending-generation");
        const { prompt, model, images, scrapeData, scrapeUrl } = JSON.parse(stored);
        setPendingPrompt(prompt);
        setPendingModel(model);
        if (Array.isArray(images) && images.length > 0) {
          setPendingPromptImages(images);
        }
        setLoading(false);

        if (scrapeUrl) {
          // Scrape first, then generate with scrape data
          (async () => {
            setGeneratingState("generating");
            setGenerationStep(0);
            setGenerationProgress(0);
            let step = 0;
            stepTimerRef.current = setInterval(() => {
              step = (step + 1) % GENERATION_STEPS.length;
              setGenerationStep(step);
            }, 3500);
            let progress = 0;
            progressTimerRef.current = setInterval(() => {
              progress += 0.3 + Math.random() * 0.4;
              if (progress > 85) progress = 85;
              setGenerationProgress(progress);
            }, 200);

            try {
              const scrapeRes = await fetch("/api/scrape", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: scrapeUrl }),
              });
              const scrapeResult = await scrapeRes.json();
              if (!scrapeRes.ok) throw new Error(scrapeResult.error || "Failed to scrape URL");

              const scrapeImages = scrapeResult.screenshot ? [scrapeResult.screenshot] : [];
              if (scrapeImages.length > 0) {
                setPendingPromptImages(scrapeImages);
              }

              // Now generate with scrape data
              const genRes = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  prompt,
                  model,
                  images: scrapeImages,
                  scrapeData: scrapeResult,
                }),
              });
              const genData = await genRes.json();
              if (!genRes.ok) throw new Error(genData.error || "Failed to generate");

              if (progressTimerRef.current) clearInterval(progressTimerRef.current);
              if (stepTimerRef.current) clearInterval(stepTimerRef.current);
              setGenerationProgress(100);
              await new Promise((r) => setTimeout(r, 600));

              window.history.replaceState(null, "", `/generate/${genData.id}`);
              const funnelRes = await fetch(`/api/funnel/${genData.id}`);
              if (!funnelRes.ok) throw new Error("Failed to load funnel");
              const funnelData = await funnelRes.json();

              setFunnel(funnelData);
              setChatMessages(funnelData.chatHistory || []);
              setEditModel(funnelData.model);
              setGeneratingState("idle");
              setLoading(false);

              // Capture snapshot after Sandpack renders
              captureSnapshot(genData.id);
            } catch (err: unknown) {
              if (progressTimerRef.current) clearInterval(progressTimerRef.current);
              if (stepTimerRef.current) clearInterval(stepTimerRef.current);
              if (err instanceof DOMException && err.name === "AbortError") {
                setGeneratingState("aborted");
              } else {
                const message = err instanceof Error ? err.message : "Something went wrong";
                setError(message);
                setGeneratingState("error");
              }
            }
          })();
        } else {
          startGeneration(prompt, model, images, scrapeData || undefined);
        }
      } else {
        // No pending data, go back
        router.replace("/");
      }
      return;
    }

    // Existing funnel flow
    async function loadFunnel() {
      try {
        const res = await fetch(`/api/funnel/${rawId}`);
        if (!res.ok) throw new Error("Funnel not found");
        const data = await res.json();
        setFunnel(data);
        setChatMessages(data.chatHistory || []);
        setEditModel(data.model);
      } catch {
        setError("Failed to load funnel");
      } finally {
        setLoading(false);
      }
    }
    loadFunnel();
  }, [rawId, router, startGeneration]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (generateAbortRef.current) generateAbortRef.current.abort();
    };
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isSending]);

  // Load code files when switching to code view
  const loadCodeFiles = useCallback(async (funnelId: string) => {
    setCodeLoading(true);
    try {
      const res = await fetch(`/api/funnel/${funnelId}/code`);
      if (res.ok) {
        const data = await res.json();
        setCodeFiles(data.files);
      }
    } catch {
      // silent fail
    } finally {
      setCodeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "code" && funnel?.id && codeFiles.length === 0) {
      loadCodeFiles(funnel.id);
    }
  }, [viewMode, funnel?.id, codeFiles.length, loadCodeFiles]);

  // Auto-open first file when code files load
  useEffect(() => {
    if (codeFiles.length > 0 && openFiles.length === 0) {
      // Open App.tsx by default, or first file
      const appFile = codeFiles.find((f) => f.path === "/src/App.tsx");
      const first = appFile || codeFiles[0];
      setOpenFiles([first.path]);
      setActiveFile(first.path);
    }
  }, [codeFiles, openFiles.length]);

  const handleAbortGeneration = () => {
    if (generateAbortRef.current) {
      generateAbortRef.current.abort();
    }
  };

  const handleRetryGeneration = () => {
    if (pendingPrompt) {
      startGeneration(pendingPrompt, pendingModel);
    }
  };

  const handleChatImageSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const placeholders: PendingImage[] = Array.from(files).map((f) => ({
      dataUrl: "",
      name: f.name,
      loading: true,
    }));
    const startIdx = chatPendingImages.length;
    setChatPendingImages((prev) => [...prev, ...placeholders]);

    const processed = await processImageFiles(files);
    setChatPendingImages((prev) => {
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

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isSending || !funnel) return;

    const userMessage = chatInput.trim();
    const imageDataUrls = chatPendingImages
      .filter((img) => !img.loading && img.dataUrl)
      .map((img) => img.dataUrl);

    setChatInput("");
    setChatPendingImages([]);
    setIsSending(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userMsg: ChatMessage = {
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
      ...(imageDataUrls.length > 0 ? { images: imageDataUrls } : {}),
    };
    setChatMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          funnelId: funnel.id,
          message: userMessage,
          model: editModel,
          images: imageDataUrls.length > 0 ? imageDataUrls : undefined,
        }),
        signal: controller.signal,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process edit");

      const aiMsg: ChatMessage = {
        role: "assistant",
        content: data.message,
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, aiMsg]);

      // Reload the funnel to get updated files
      const funnelRes = await fetch(`/api/funnel/${funnel.id}`);
      if (funnelRes.ok) {
        const updatedFunnel = await funnelRes.json();
        setFunnel(updatedFunnel);
      }

      setRefreshKey((prev) => prev + 1);

      // Re-capture snapshot after edit
      captureSnapshot(funnel.id);

      // Refresh code files if in code view
      if (viewMode === "code") {
        setCodeFiles([]);
        setOpenFiles([]);
        setActiveFile("");
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        const stopMsg: ChatMessage = {
          role: "assistant",
          content: "Generation stopped. No changes were made.",
          timestamp: new Date().toISOString(),
        };
        setChatMessages((prev) => [...prev, stopMsg]);
      } else {
        const errMsg =
          err instanceof Error ? err.message : "Something went wrong";
        const errorMsg: ChatMessage = {
          role: "assistant",
          content: `Error: ${errMsg}. Please try again.`,
          timestamp: new Date().toISOString(),
        };
        setChatMessages((prev) => [...prev, errorMsg]);
      }
    } finally {
      abortControllerRef.current = null;
      setIsSending(false);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Code view helpers
  const handleOpenFile = (filePath: string) => {
    if (!openFiles.includes(filePath)) {
      setOpenFiles((prev) => [...prev, filePath]);
    }
    setActiveFile(filePath);
  };

  const handleCloseFile = (filePath: string) => {
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f !== filePath);
      if (activeFile === filePath) {
        setActiveFile(next[next.length - 1] || "");
      }
      return next;
    });
  };

  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const handleCopyFile = async (content: string, filePath: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedFile(filePath);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  const handleDownloadFile = (content: string, fileName: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const file of codeFiles) {
      const path = file.path.startsWith("/") ? file.path.slice(1) : file.path;
      zip.file(path, file.content);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "project.zip";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Build nested file tree
  const fileTree = useMemo(() => {
    if (codeFiles.length === 0) return [];

    if (fileSearchQuery) {
      const filtered = codeFiles.filter((f) =>
        f.name.toLowerCase().includes(fileSearchQuery.toLowerCase()) ||
        f.path.toLowerCase().includes(fileSearchQuery.toLowerCase())
      );
      return filtered.map((f) => ({
        name: f.name,
        path: f.path,
        isFolder: false,
        size: f.size,
      })) as FileTreeNode[];
    }

    return buildFileTree(codeFiles);
  }, [codeFiles, fileSearchQuery]);

  const activeFileData = codeFiles.find((f) => f.path === activeFile);
  const currentFileContent = activeFileData?.content || "";

  const highlightedCode = useMemo(() => {
    if (!currentFileContent || !activeFile) return "";
    try {
      const language = getFileLanguage(activeFile);
      return hljs.highlight(currentFileContent, { language }).value;
    } catch {
      return currentFileContent
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
  }, [currentFileContent, activeFile]);

  // Extract page routes from App.tsx for the page switcher
  const pageRoutes = useMemo(() => {
    if (!projectFiles) return [];
    const appTsx = projectFiles["/src/App.tsx"];
    if (!appTsx) return [];
    const routes: { path: string; label: string }[] = [];
    const routeRegex = /<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g;
    let match;
    while ((match = routeRegex.exec(appTsx)) !== null) {
      routes.push({ path: match[1], label: match[2] });
    }
    return routes.length > 0 ? routes : [{ path: "/", label: "Home" }];
  }, [projectFiles]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  // Render file tree node recursively
  const renderFileTreeNode = (node: FileTreeNode, depth: number = 0) => {
    if (node.isFolder) {
      const isExpanded = expandedFolders.has(node.path);
      return (
        <div key={node.path}>
          <button
            onClick={() => toggleFolder(node.path)}
            className="flex w-full items-center gap-1.5 py-1 text-xs text-gray-400 hover:text-gray-300 hover:bg-[#252540] transition-colors"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            <svg className={`h-3 w-3 transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 16 16">
              <path d="M6 4l4 4-4 4" />
            </svg>
            <svg className="h-3.5 w-3.5 text-[#FEC403] shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
            </svg>
            <span className="font-medium truncate">{node.name}</span>
            {node.children && (
              <span className="ml-auto text-[10px] text-gray-600 pr-2">{node.children.length}</span>
            )}
          </button>
          {isExpanded && node.children && (
            <div>
              {node.children.map((child) => renderFileTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // File node
    const icon = getFileIcon(node.name);
    return (
      <button
        key={node.path}
        onClick={() => handleOpenFile(node.path)}
        className={`flex w-full items-center gap-1.5 py-1 text-xs transition-colors ${
          activeFile === node.path
            ? "bg-[#2a2a4a] text-white"
            : "text-gray-400 hover:text-gray-300 hover:bg-[#252540]"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <svg className="h-3.5 w-3.5 shrink-0" style={{ color: icon.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          {icon.type === "code" ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25" />
          ) : icon.type === "style" ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          )}
        </svg>
        <span className="truncate">{node.name}</span>
        {node.size !== undefined && (
          <span className="ml-auto text-[10px] text-gray-600 pr-2">{formatFileSize(node.size)}</span>
        )}
      </button>
    );
  };

  // ─── Loading state ───
  if (loading && generatingState === "idle") {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  // ─── Error state (not during generation) ───
  if (generatingState === "error") {
    return (
      <div className="flex h-screen flex-col bg-white overflow-hidden">
        <header className="flex items-center border-b border-gray-200 bg-white px-4 py-2.5 shrink-0">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-tr from-[#FEC403] via-[#2896FB] to-[#4BCF29]">
              <svg className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-700 group-hover:text-gray-900 transition-colors">Vibe Creator</span>
          </Link>
        </header>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-5 text-center px-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
              <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#EF4444" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Generation failed</h2>
              <p className="mt-1 text-sm text-gray-500 max-w-md">{error}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRetryGeneration}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-all"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                Try again
              </button>
              <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 underline">
                Go back
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Non-generation error ───
  if (error && generatingState === "idle" && !funnel) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-50">
        <p className="text-gray-500">{error || "Funnel not found"}</p>
        <Link href="/" className="text-sm text-blue-600 hover:text-blue-500 underline">
          Go back home
        </Link>
      </div>
    );
  }

  // ─── Generating / Aborted / Ready states share the same layout ───
  const isGenerating = generatingState === "generating";
  const isAborted = generatingState === "aborted";
  const isReady = generatingState === "idle" && funnel !== null;

  const selectedDevice = DEVICES.find((d) => d.id === device) || DEVICES[0];
  const currentStep = GENERATION_STEPS[generationStep] || GENERATION_STEPS[0];

  const fileCount = projectFiles ? Object.keys(projectFiles).length : 0;

  const projectName = funnel?.name || pendingPrompt?.slice(0, 30) || "Untitled Project";

  return (
    <div className="flex h-screen flex-col bg-white overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center border-b border-gray-200 bg-white shrink-0 h-11">
        {/* Left zone - Project name (above chat panel) */}
        <div className={`flex items-center justify-between shrink-0 px-3 h-full border-r border-gray-200 transition-all ${chatCollapsed ? "w-12" : "w-80"}`}>
          {!chatCollapsed && (
            <>
              <div className="flex items-center gap-1.5 min-w-0">
                <Link href="/" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-tr from-[#FEC403] via-[#2896FB] to-[#4BCF29]">
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12" />
                  </svg>
                </Link>
                <span className="text-[13px] font-semibold text-gray-800 truncate">{projectName}</span>
                <button className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-0.5">
                {/* Version history */}
                <button className="rounded-md p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Version history">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                {/* Collapse chat */}
                <button
                  onClick={() => setChatCollapsed(true)}
                  className="rounded-md p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  title="Collapse chat"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                  </svg>
                </button>
              </div>
            </>
          )}
          {chatCollapsed && (
            <button
              onClick={() => setChatCollapsed(false)}
              className="mx-auto rounded-md p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Expand chat"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
              </svg>
            </button>
          )}
        </div>

        {/* Right zone - Preview controls & actions */}
        <div className="flex flex-1 items-center justify-between px-3 h-full">
          {/* Preview / Code toggle */}
          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            <button
              onClick={() => setViewMode("preview")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === "preview"
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Preview
            </button>
            <button
              onClick={() => setViewMode("code")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === "code"
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
              Code
            </button>
          </div>

          {/* Center controls */}
          <div className="flex items-center gap-1.5">
            {isReady && funnel && viewMode === "code" ? (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                </svg>
                <span className="font-medium text-gray-700">{fileCount} files</span>
              </div>
            ) : isReady && funnel && viewMode === "preview" ? (
              <>
                {/* Device selector */}
                <div className="flex items-center gap-0.5 rounded-md border border-gray-200 bg-gray-50 p-0.5">
                  <button
                    onClick={() => setDevice("desktop")}
                    className={`rounded p-1 transition-colors ${device === "desktop" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                    title="Desktop"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" /></svg>
                  </button>
                  <div className="relative">
                    <select
                      value={device}
                      onChange={(e) => setDevice(e.target.value)}
                      className={`appearance-none rounded p-1 pr-5 text-xs cursor-pointer bg-transparent outline-none transition-colors ${device !== "desktop" ? "text-gray-800" : "text-gray-400"}`}
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' fill='%239CA3AF' viewBox='0 0 16 16'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 4px center",
                      }}
                    >
                      {DEVICES.map((d) => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Page selector dropdown */}
                {pageRoutes.length > 1 && (
                  <div className="relative">
                    <select
                      value={currentPage}
                      onChange={(e) => { setCurrentPage(e.target.value); setRefreshKey((k) => k + 1); }}
                      className="appearance-none rounded-md border border-gray-200 bg-gray-50 px-3 pr-7 py-1 text-xs font-medium text-gray-700 cursor-pointer outline-none hover:bg-gray-100 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 transition-colors"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' fill='%236B7280' viewBox='0 0 16 16'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 8px center",
                      }}
                    >
                      {pageRoutes.map((route) => (
                        <option key={route.path} value={route.path}>{route.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Refresh */}
                <button
                  onClick={() => setRefreshKey((k) => k + 1)}
                  className="rounded-md p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  title="Refresh preview"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                </button>

                {/* Open in new tab */}
                <button
                  onClick={() => {
                    if (funnel?.id) {
                      window.open(`/preview-react/${funnel.id}`, "_blank");
                    }
                  }}
                  className="rounded-md p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  title="Open in new tab"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </button>
              </>
            ) : isGenerating ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="h-2 w-2 rounded-full bg-[#2896FB] animate-pulse" />
                  Generating...
                </div>
                <button
                  onClick={handleAbortGeneration}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100 hover:border-red-300 transition-all"
                >
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  Stop
                </button>
              </div>
            ) : null}
          </div>

          {/* Right - Close (code mode) or Share/Publish (preview mode) */}
          <div className="flex items-center gap-2">
            {viewMode === "code" ? (
              <button
                onClick={() => setViewMode("preview")}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Close
              </button>
            ) : (
              <>
                <button className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                  </svg>
                  Share
                </button>
                <button className="inline-flex items-center rounded-md bg-blue-600 px-4 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-all">
                  Publish
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat panel (left) */}
        <div className={`flex shrink-0 flex-col border-r border-gray-200 bg-gray-50 transition-all duration-200 ${chatCollapsed ? "w-0 overflow-hidden border-r-0" : "w-80"}`}>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Show prompt for generating/aborted state */}
            {(isGenerating || isAborted) && pendingPrompt && (
              <>
                {pendingPromptImages.length > 0 && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%]">
                      <ImageUpload
                        images={pendingPromptImages.map((url) => ({ dataUrl: url, name: "image", loading: false }))}
                        readOnly
                      />
                    </div>
                  </div>
                )}
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-3.5 py-2.5 shadow-sm">
                    <p className="text-sm text-white">{pendingPrompt}</p>
                  </div>
                </div>
                {isGenerating && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white border border-gray-200 px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 animate-bounce rounded-full bg-[#FEC403] [animation-delay:0ms]" />
                        <div className="h-2 w-2 animate-bounce rounded-full bg-[#2896FB] [animation-delay:150ms]" />
                        <div className="h-2 w-2 animate-bounce rounded-full bg-[#4BCF29] [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}
                {isAborted && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white border border-amber-200 px-3.5 py-2.5 shadow-sm">
                      <p className="text-sm text-amber-700">Generation was cancelled. You can retry or go back.</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Show full chat for ready state */}
            {isReady && funnel && (
              <>
                {funnel.promptImages && funnel.promptImages.length > 0 && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%]">
                      <ImageUpload
                        images={funnel.promptImages.map((url) => ({ dataUrl: url, name: "image", loading: false }))}
                        readOnly
                      />
                    </div>
                  </div>
                )}
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-3.5 py-2.5 shadow-sm">
                    <p className="text-sm text-white">{funnel.prompt}</p>
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white border border-gray-200 px-3.5 py-2.5 shadow-sm">
                    <p className="text-sm text-gray-700">
                      I&apos;ve created your project with {fileCount} files. You can ask me to make changes — edit components, add pages, change the theme, or modify functionality.
                    </p>
                  </div>
                </div>
                {chatMessages.map((msg, idx) => (
                  <div key={idx}>
                    {msg.images && msg.images.length > 0 && (
                      <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} mb-1`}>
                        <div className="max-w-[85%]">
                          <ImageUpload
                            images={msg.images.map((url) => ({ dataUrl: url, name: "image", loading: false }))}
                            readOnly
                          />
                        </div>
                      </div>
                    )}
                    <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm ${msg.role === "user" ? "rounded-br-sm bg-blue-600" : "rounded-bl-sm bg-white border border-gray-200"}`}>
                        <p className={`text-sm ${msg.role === "user" ? "text-white" : "text-gray-700"}`}>{msg.content}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white border border-gray-200 px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:0ms]" />
                        <div className="h-2 w-2 animate-bounce rounded-full bg-[#2896FB] [animation-delay:150ms]" />
                        <div className="h-2 w-2 animate-bounce rounded-full bg-[#4BCF29] [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="border-t border-gray-200 bg-white p-3">
            {isGenerating ? (
              <button
                type="button"
                onClick={handleAbortGeneration}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 transition-all hover:bg-red-100 hover:border-red-300"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop generating
              </button>
            ) : isAborted ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRetryGeneration}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-medium text-white transition-all hover:bg-blue-700"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                  Retry
                </button>
                <Link
                  href="/"
                  className="flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all"
                >
                  Back
                </Link>
              </div>
            ) : isSending ? (
              <button
                type="button"
                onClick={handleStop}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 transition-all hover:bg-red-100 hover:border-red-300"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop generating
              </button>
            ) : (
              <div className="space-y-2">
                {chatPendingImages.length > 0 && (
                  <div className="px-1">
                    <ImageUpload
                      images={chatPendingImages}
                      onRemove={(idx) => setChatPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                    />
                  </div>
                )}
                <form
                  onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                  className="flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400/30 transition-all"
                >
                  <input
                    ref={chatFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handleChatImageSelect(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => chatFileInputRef.current?.click()}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </button>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Describe changes you want..."
                    className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-all hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Canvas (right) */}
        <div className="flex flex-1 flex-col items-center justify-center bg-gray-100 overflow-hidden" style={{ padding: viewMode === "code" ? 0 : "1rem" }}>
          {/* ── Generating animation in canvas ── */}
          {isGenerating && (
            <div className="relative w-full h-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
              {/* Animated gradient background */}
              <div className="absolute inset-0 vibe-animated-bg">
                <div className="absolute inset-0 vibe-gradient-sweep" />
                <div className="absolute w-[500px] h-[500px] rounded-full opacity-30 blur-[100px] vibe-blob-1" />
                <div className="absolute w-[400px] h-[400px] rounded-full opacity-25 blur-[80px] vibe-blob-2" />
                <div className="absolute w-[350px] h-[350px] rounded-full opacity-20 blur-[70px] vibe-blob-3" />
              </div>

              {/* Wireframe skeleton animation */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full max-w-2xl px-12 space-y-6 canvas-skeleton-fade">
                  <div className="flex items-center justify-between py-3">
                    <div className="h-4 w-24 rounded-full bg-gray-300/40 animate-pulse" />
                    <div className="flex gap-4">
                      <div className="h-3 w-16 rounded-full bg-gray-300/30 animate-pulse [animation-delay:100ms]" />
                      <div className="h-3 w-16 rounded-full bg-gray-300/30 animate-pulse [animation-delay:200ms]" />
                      <div className="h-3 w-16 rounded-full bg-gray-300/30 animate-pulse [animation-delay:300ms]" />
                      <div className="h-7 w-20 rounded-lg bg-gray-300/30 animate-pulse [animation-delay:400ms]" />
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-4 py-12">
                    <div className="h-8 w-80 rounded-full bg-gray-300/40 animate-pulse [animation-delay:500ms]" />
                    <div className="h-4 w-64 rounded-full bg-gray-300/30 animate-pulse [animation-delay:600ms]" />
                    <div className="h-4 w-48 rounded-full bg-gray-300/25 animate-pulse [animation-delay:700ms]" />
                    <div className="h-10 w-36 rounded-lg bg-gray-300/35 animate-pulse [animation-delay:800ms] mt-2" />
                  </div>
                  <div className="grid grid-cols-3 gap-6 py-4">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="space-y-3 rounded-xl bg-gray-300/15 p-5 animate-pulse" style={{ animationDelay: `${900 + i * 150}ms` }}>
                        <div className="h-10 w-10 rounded-lg bg-gray-300/30" />
                        <div className="h-4 w-24 rounded-full bg-gray-300/25" />
                        <div className="h-3 w-full rounded-full bg-gray-300/20" />
                        <div className="h-3 w-3/4 rounded-full bg-gray-300/15" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Centered progress overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px]">
                <div className="relative mb-8">
                  <div className="absolute -inset-4 rounded-full border-2 border-[#FEC403]/20 animate-ping" />
                  <div className="absolute -inset-2 rounded-full border-2 border-[#2896FB]/25 animate-ping [animation-delay:300ms]" />
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FEC403] via-[#2896FB] to-[#4BCF29] shadow-lg shadow-blue-500/20 animate-pulse">
                    <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                    </svg>
                  </div>
                </div>
                <p className="text-base font-semibold text-gray-800 mb-1 transition-all duration-500">
                  {currentStep.label}
                </p>
                <p className="text-sm text-gray-500 mb-6">
                  Building something amazing for you...
                </p>
                <div className="w-72 h-2 bg-gray-200 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-gradient-to-r from-[#FEC403] via-[#2896FB] to-[#4BCF29] rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${generationProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400">{Math.round(generationProgress)}% complete</p>
              </div>
            </div>
          )}

          {/* ── Aborted state in canvas ── */}
          {isAborted && (
            <div className="relative w-full h-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden flex items-center justify-center">
              <div className="flex flex-col items-center gap-5 text-center px-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50">
                  <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#F59E0B" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">Generation cancelled</h2>
                  <p className="mt-1 text-sm text-gray-500 max-w-sm">
                    The site generation was stopped. You can try again with the same prompt or go back to start fresh.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleRetryGeneration}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-all"
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                    </svg>
                    Try again
                  </button>
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    Go back
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* ── Ready state - Preview mode (Sandpack) ── */}
          {isReady && projectFiles && viewMode === "preview" && (
            <>
              <div
                className="relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg transition-all duration-300"
                style={{
                  width: selectedDevice.width,
                  height: selectedDevice.height,
                  maxWidth: "100%",
                  maxHeight: "100%",
                }}
              >
                <ReactProjectPreview files={projectFiles} refreshKey={refreshKey} startRoute={currentPage} />
              </div>
              {device !== "desktop" && (
                <p className="mt-3 text-xs text-gray-400">
                  {selectedDevice.label} — {selectedDevice.width} x {selectedDevice.height}
                </p>
              )}
            </>
          )}

          {/* ── Ready state - Code mode (view-only) ── */}
          {isReady && viewMode === "code" && (
            <div className="flex w-full h-full bg-[#1e1e2e] overflow-hidden">
              {/* File tree sidebar */}
              <div className="w-60 shrink-0 border-r border-[#2a2a3e] bg-[#1b1b2f] flex flex-col">
                {/* Search */}
                <div className="p-2 border-b border-[#2a2a3e]">
                  <div className="flex items-center gap-2 rounded-md bg-[#252540] px-2.5 py-1.5 border border-[#333355]">
                    <svg className="h-3.5 w-3.5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                      type="text"
                      value={fileSearchQuery}
                      onChange={(e) => setFileSearchQuery(e.target.value)}
                      placeholder="Search files..."
                      className="w-full bg-transparent text-xs text-gray-300 placeholder-gray-600 outline-none"
                    />
                  </div>
                </div>

                {/* File tree */}
                <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
                  {codeLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                    </div>
                  ) : (
                    fileTree.map((node) => renderFileTreeNode(node, 0))
                  )}
                </div>
              </div>

              {/* Code viewer */}
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* File tabs */}
                {openFiles.length > 0 && (
                  <div className="flex items-center border-b border-[#2a2a3e] bg-[#1b1b2f] overflow-x-auto scrollbar-none">
                    {openFiles.map((filePath) => {
                      const file = codeFiles.find((f) => f.path === filePath);
                      if (!file) return null;
                      const icon = getFileIcon(file.name);
                      return (
                        <div
                          key={filePath}
                          className={`group flex items-center gap-1.5 px-3 py-2 text-xs border-r border-[#2a2a3e] cursor-pointer shrink-0 transition-colors ${
                            activeFile === filePath
                              ? "bg-[#1e1e2e] text-white border-t-2 border-t-[#2896FB]"
                              : "bg-[#1b1b2f] text-gray-500 hover:text-gray-300 border-t-2 border-t-transparent"
                          }`}
                          onClick={() => setActiveFile(filePath)}
                        >
                          <svg className="h-3 w-3" style={{ color: icon.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25" />
                          </svg>
                          <span>{file.name}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCloseFile(filePath); }}
                            className="ml-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-[#333355] transition-all"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Code content */}
                <div className="flex-1 overflow-auto">
                  {activeFileData ? (
                    <div className="flex flex-col h-full">
                      {/* File action bar */}
                      <div className="flex items-center justify-between px-4 py-1.5 bg-[#1e1e2e] border-b border-[#2a2a3e] shrink-0">
                        <span className="text-xs text-gray-500">{activeFileData.path}</span>
                        <div className="flex items-center gap-1">
                          {/* Copy button */}
                          <button
                            onClick={() => handleCopyFile(currentFileContent, activeFileData.path)}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:text-gray-300 hover:bg-[#252540] transition-colors"
                          >
                            {copiedFile === activeFileData.path ? (
                              <>
                                <svg className="h-3.5 w-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                                Copied
                              </>
                            ) : (
                              <>
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                                </svg>
                                Copy
                              </>
                            )}
                          </button>
                          {/* Download dropdown */}
                          <div className="relative">
                            <button
                              onClick={() => setDownloadDropdownOpen(!downloadDropdownOpen)}
                              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:text-gray-300 hover:bg-[#252540] transition-colors"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                              </svg>
                              Download
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                              </svg>
                            </button>
                            {downloadDropdownOpen && (
                              <>
                                <div className="fixed inset-0 z-20" onClick={() => setDownloadDropdownOpen(false)} />
                                <div className="absolute right-0 top-full mt-1 z-30 w-48 rounded-lg border border-[#333355] bg-[#252540] shadow-xl overflow-hidden">
                                  <button
                                    onClick={() => { handleDownloadFile(currentFileContent, activeFileData.name); setDownloadDropdownOpen(false); }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-[#2a2a4a] transition-colors"
                                  >
                                    <svg className="h-3.5 w-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                    </svg>
                                    This file ({activeFileData.name})
                                  </button>
                                  <div className="border-t border-[#333355]" />
                                  <button
                                    onClick={() => { handleDownloadAll(); setDownloadDropdownOpen(false); }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-[#2a2a4a] transition-colors"
                                  >
                                    <svg className="h-3.5 w-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                                    </svg>
                                    All files as ZIP ({codeFiles.length} files)
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Read-only code with line numbers and syntax highlighting */}
                      <div className="flex flex-1 overflow-auto">
                        {/* Line numbers */}
                        <div className="select-none py-4 pl-4 pr-2 text-right text-xs leading-5 text-gray-600 font-mono overflow-hidden shrink-0"
                          style={{ minWidth: `${Math.max(3, String(currentFileContent.split("\n").length).length) * 0.6 + 1.5}rem` }}
                        >
                          {currentFileContent.split("\n").map((_, i) => (
                            <div key={i}>{i + 1}</div>
                          ))}
                        </div>
                        {/* Syntax-highlighted code */}
                        <pre
                          className="flex-1 py-4 pr-4 text-xs leading-5 font-mono hljs overflow-auto"
                          style={{ tabSize: 2, whiteSpace: "pre", wordWrap: "normal" }}
                        >
                          <code dangerouslySetInnerHTML={{ __html: highlightedCode + "\n" }} />
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-600">
                      <div className="flex flex-col items-center gap-3 text-center">
                        <svg className="h-12 w-12 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                        </svg>
                        <p className="text-sm">Select a file to view its code</p>
                        <p className="text-xs text-gray-700">Click a file in the sidebar</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
