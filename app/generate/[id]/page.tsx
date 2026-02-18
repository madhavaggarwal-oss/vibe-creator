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
  preGenHistory?: ChatMessage[];
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

const SIMULATED_CODE_FILES = [
  { path: "/index.html", name: "index.html", code: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>Project</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/index.tsx"></script>\n</body>\n</html>` },
  { path: "/src/index.tsx", name: "index.tsx", code: `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport { HashRouter } from "react-router-dom";\nimport App from "./App";\nimport "./index.css";\n\nReactDOM.createRoot(\n  document.getElementById("root")!\n).render(\n  <React.StrictMode>\n    <HashRouter>\n      <App />\n    </HashRouter>\n  </React.StrictMode>\n);` },
  { path: "/src/App.tsx", name: "App.tsx", code: `import React from "react";\nimport { Routes, Route } from "react-router-dom";\nimport Header from "./components/Header";\nimport Footer from "./components/Footer";\nimport Home from "./pages/Home";\n\nexport default function App() {\n  return (\n    <div className="min-h-screen flex flex-col">\n      <Header />\n      <main className="flex-1">\n        <Routes>\n          <Route path="/" element={<Home />} />\n        </Routes>\n      </main>\n      <Footer />\n    </div>\n  );\n}` },
  { path: "/src/index.css", name: "index.css", code: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n:root {\n  --primary: #3b82f6;\n  --secondary: #10b981;\n}\n\nbody {\n  margin: 0;\n  font-family: system-ui, sans-serif;\n  -webkit-font-smoothing: antialiased;\n}\n\n.gradient-bg {\n  background: linear-gradient(\n    135deg,\n    var(--primary),\n    var(--secondary)\n  );\n}` },
  { path: "/src/pages/Home.tsx", name: "Home.tsx", code: `import React from "react";\nimport Hero from "../components/Hero";\n\nexport default function Home() {\n  return (\n    <div>\n      <Hero />\n      <section className="py-16 px-6">\n        <div className="max-w-6xl mx-auto">\n          <h2 className="text-3xl font-bold\n            text-center mb-12">\n            Featured Content\n          </h2>\n          <div className="grid grid-cols-1\n            md:grid-cols-3 gap-8">\n            {/* Cards */}\n          </div>\n        </div>\n      </section>\n    </div>\n  );\n}` },
  { path: "/src/components/Header.tsx", name: "Header.tsx", code: `import React, { useState } from "react";\nimport { Link } from "react-router-dom";\n\nexport default function Header() {\n  const [isOpen, setIsOpen] = useState(false);\n\n  return (\n    <header className="bg-white shadow-sm\n      sticky top-0 z-50">\n      <nav className="max-w-6xl mx-auto\n        px-6 py-4 flex items-center\n        justify-between">\n        <Link to="/" className="text-xl\n          font-bold text-gray-900">\n          Brand\n        </Link>\n        <div className="hidden md:flex\n          items-center gap-6">\n          <Link to="/" className="text-gray-600\n            hover:text-gray-900">Home</Link>\n          <Link to="/about" className="text-gray-600\n            hover:text-gray-900">About</Link>\n        </div>\n      </nav>\n    </header>\n  );\n}` },
  { path: "/src/components/Hero.tsx", name: "Hero.tsx", code: `import React from "react";\n\nexport default function Hero() {\n  return (\n    <section className="gradient-bg\n      text-white py-24 px-6">\n      <div className="max-w-4xl mx-auto\n        text-center">\n        <h1 className="text-5xl font-bold\n          mb-6 leading-tight">\n          Welcome to Your\n          New Website\n        </h1>\n        <p className="text-xl opacity-90\n          mb-8 max-w-2xl mx-auto">\n          Built with React and\n          Tailwind CSS\n        </p>\n        <button className="bg-white\n          text-blue-600 px-8 py-3\n          rounded-full font-semibold\n          hover:shadow-lg transition">\n          Get Started\n        </button>\n      </div>\n    </section>\n  );\n}` },
  { path: "/src/components/Footer.tsx", name: "Footer.tsx", code: `import React from "react";\n\nexport default function Footer() {\n  return (\n    <footer className="bg-gray-900\n      text-gray-400 py-12 px-6">\n      <div className="max-w-6xl mx-auto\n        flex flex-col md:flex-row\n        justify-between items-center\n        gap-4">\n        <p className="text-sm">\n          &copy; {new Date().getFullYear()}\n          All rights reserved.\n        </p>\n        <div className="flex gap-6\n          text-sm">\n          <a href="#" className="hover:text-white\n            transition">Privacy</a>\n          <a href="#" className="hover:text-white\n            transition">Terms</a>\n        </div>\n      </div>\n    </footer>\n  );\n}` },
];

const WAITING_MESSAGES = [
  "Waiting for new requirements",
  "Ready when you are",
  "Describe what you'd like to build",
  "Type a prompt to get started",
  "Standing by for your next idea",
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
  const [pendingTimestamp, setPendingTimestamp] = useState<string>("");
  const [pendingModel, setPendingModel] = useState<string>("");
  const generateAbortRef = useRef<AbortController | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Chat state
  const [preGenMessages, setPreGenMessages] = useState<ChatMessage[]>([]); // messages from aborted generations (shown before current prompt)
  const preGenMessagesRef = useRef<ChatMessage[]>([]);
  preGenMessagesRef.current = preGenMessages;
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [editModel, setEditModel] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const [chatWidth, setChatWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const chatWidthRef = useRef(320);
  const chatMinWidth = typeof window !== "undefined" ? Math.round(window.innerWidth * 0.2) : 256;
  const chatMaxWidth = 500;
  const chatDefaultWidth = 320;
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Waiting message rotation for aborted state
  const [waitingMsgIndex, setWaitingMsgIndex] = useState(0);

  // Simulated code animation state
  const [simFileIndex, setSimFileIndex] = useState(0);
  const [simTypedChars, setSimTypedChars] = useState(0);
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

  // Restore chat width from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("vibe-chat-width");
      if (saved) {
        const w = Math.max(chatMinWidth, Math.min(chatMaxWidth, Number(saved)));
        setChatWidth(w);
        chatWidthRef.current = w;
      }
    } catch {}
  }, []);

  // Simulated code-writing animation during generation
  const isSimGenerating = generatingState === "generating";
  useEffect(() => {
    if (!isSimGenerating || viewMode !== "code") return;
    const currentFile = SIMULATED_CODE_FILES[simFileIndex];
    if (!currentFile) return;
    if (simTypedChars < currentFile.code.length) {
      const typeTimer = setTimeout(() => {
        setSimTypedChars((c) => Math.min(c + 2, currentFile.code.length));
      }, 25);
      return () => clearTimeout(typeTimer);
    } else {
      const nextTimer = setTimeout(() => {
        if (simFileIndex < SIMULATED_CODE_FILES.length - 1) {
          setSimFileIndex((i) => i + 1);
          setSimTypedChars(0);
        }
      }, 800);
      return () => clearTimeout(nextTimer);
    }
  }, [isSimGenerating, viewMode, simFileIndex, simTypedChars]);

  // Reset simulation when generation completes
  useEffect(() => {
    if (!isSimGenerating) {
      setSimFileIndex(0);
      setSimTypedChars(0);
    }
  }, [isSimGenerating]);

  // Rotate waiting messages when aborted
  const isAbortedForWaiting = generatingState === "aborted";
  useEffect(() => {
    if (!isAbortedForWaiting) {
      setWaitingMsgIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setWaitingMsgIndex((i) => (i + 1) % WAITING_MESSAGES.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [isAbortedForWaiting]);

  // Close project menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setShowProjectMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Resize drag handler — uses refs to avoid stale closures
  const isResizingRef = useRef(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      e.preventDefault();
      const newWidth = Math.max(chatMinWidth, Math.min(chatMaxWidth, e.clientX));
      setChatWidth(newWidth);
      chatWidthRef.current = newWidth;
    };

    const onMouseUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = "";
      try { localStorage.setItem("vibe-chat-width", String(chatWidthRef.current)); } catch {}
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
  }, []);

  // Double-click divider to reset width
  const handleResizeDoubleClick = useCallback(() => {
    setChatWidth(chatDefaultWidth);
    chatWidthRef.current = chatDefaultWidth;
    try { localStorage.setItem("vibe-chat-width", String(chatDefaultWidth)); } catch {}
  }, []);

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

        // Persist pre-generation messages (cancelled exchanges) to the funnel
        if (preGenMessagesRef.current.length > 0) {
          fetch(`/api/funnel/${data.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ preGenHistory: preGenMessagesRef.current }),
          }).catch(() => { /* silent — best effort persistence */ });
        }

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
        setPendingTimestamp(new Date().toISOString());
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
        if (data.preGenHistory && data.preGenHistory.length > 0) {
          setPreGenMessages(data.preGenHistory);
        }
        setEditModel(data.model);

        // Capture snapshot for existing projects (populates cache over time)
        if (data.files && Object.keys(data.files).length > 0) {
          captureSnapshot(rawId);
        }
      } catch {
        setError("Failed to load funnel");
      } finally {
        setLoading(false);
      }
    }
    loadFunnel();
  }, [rawId, router, startGeneration, captureSnapshot]);

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

        // Persist the user prompt + stopped message to server so they survive refresh
        if (funnel) {
          fetch(`/api/funnel/${funnel.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appendChatHistory: [userMsg, stopMsg] }),
          }).catch(() => { /* best effort */ });
        }
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
    <div className={`flex h-screen flex-col bg-white overflow-hidden ${isResizing ? "select-none" : ""}`}>
      {/* Top bar */}
      <header className="flex items-center bg-[#F9FAFB] shrink-0 h-14">
        {/* Left zone - Project name (above chat panel) */}
        <div className="flex items-center shrink-0 pl-6 pr-3 h-full gap-2" style={{ width: chatCollapsed ? undefined : chatWidth }}>
          {/* Sparkle logo + project name — always visible */}
          <div className="relative flex items-center gap-2 min-w-0" ref={projectMenuRef}>
            <button
              onClick={() => setShowProjectMenu((v) => !v)}
              className="flex items-center gap-2 min-w-0 cursor-pointer"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-[#FEC403] via-[#2896FB] to-[#4BCF29]">
                <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-gray-800 truncate">{projectName}</span>
              <svg className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform ${showProjectMenu ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {showProjectMenu && (
              <div className="absolute top-full left-0 mt-1.5 w-52 rounded-xl border border-gray-200 bg-white shadow-lg py-1.5 z-50">
                <Link
                  href="/"
                  className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  onClick={() => setShowProjectMenu(false)}
                >
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                  Go to Dashboard
                </Link>
              </div>
            )}
          </div>
          {/* Version history + Collapse/Expand — always visible */}
          <div className="flex items-center gap-0.5 ml-auto shrink-0">
            <button className="rounded-md p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="Version history">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              onClick={() => setChatCollapsed((v) => !v)}
              className="rounded-md p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title={chatCollapsed ? "Expand chat" : "Collapse chat"}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <line x1="10" y1="3" x2="10" y2="21" />
              </svg>
            </button>
          </div>
        </div>

        {/* Right zone - Preview controls & actions */}
        <div className="flex flex-1 items-center justify-between px-3 h-full">
          {/* Preview / Code toggle */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setViewMode("preview")}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border h-8 text-sm font-medium transition-all ${
                viewMode === "preview"
                  ? "bg-blue-50 text-blue-700 border-blue-200 px-4"
                  : "border-gray-200 bg-white text-gray-500 hover:text-gray-700 hover:border-gray-300 px-2.5"
              }`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {viewMode === "preview" && "Preview"}
            </button>
            <button
              onClick={() => setViewMode("code")}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg border h-8 text-sm font-medium transition-all ${
                viewMode === "code"
                  ? "bg-blue-50 text-blue-700 border-blue-200 px-4"
                  : "border-gray-200 bg-white text-gray-500 hover:text-gray-700 hover:border-gray-300 px-2.5"
              }`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
              {viewMode === "code" && "Code"}
            </button>
          </div>

          {/* Center controls — pill bar */}
          <div className="flex items-center">
            {viewMode === "code" ? (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                </svg>
                <span className="font-medium text-gray-700">{isGenerating ? "Building..." : `${fileCount} files`}</span>
              </div>
            ) : viewMode === "preview" ? (
              <div className="flex items-center rounded-full border border-gray-200 bg-white px-1.5 py-1 gap-1 min-w-[280px]">
                {/* Device toggle — click to cycle */}
                <button
                  onClick={() => {
                    const order = ["desktop", "tablet", "mobile"] as const;
                    const idx = order.indexOf(device as typeof order[number]);
                    setDevice(order[(idx + 1) % order.length]);
                  }}
                  className="rounded-full p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  title={`Switch device (${device})`}
                >
                  {device === "desktop" ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" /></svg>
                  ) : device === "tablet" ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5h3m-6.75 2.25h10.5a2.25 2.25 0 002.25-2.25V4.5a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 4.5v15a2.25 2.25 0 002.25 2.25z" /></svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>
                  )}
                </button>

                {/* Page selector */}
                <div className="relative">
                  <select
                    value={currentPage}
                    onChange={(e) => { setCurrentPage(e.target.value); setRefreshKey((k) => k + 1); }}
                    className="appearance-none bg-transparent text-sm text-gray-600 font-medium cursor-pointer outline-none pl-2 pr-5 py-0.5 hover:text-gray-900 transition-colors"
                    style={{
                      backgroundImage: pageRoutes.length > 1 ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' fill='%239CA3AF' viewBox='0 0 16 16'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E")` : "none",
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "right 2px center",
                    }}
                  >
                    {pageRoutes.length > 0 ? (
                      pageRoutes.map((route) => (
                        <option key={route.path} value={route.path}>{route.path || "/"}</option>
                      ))
                    ) : (
                      <option value="/">/</option>
                    )}
                  </select>
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Open in new tab */}
                <button
                  onClick={() => {
                    if (funnel?.id) {
                      window.open(`/preview-react/${funnel.id}`, "_blank");
                    }
                  }}
                  className="rounded-full p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  title="Open in new tab"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </button>

                {/* Refresh */}
                <button
                  onClick={() => setRefreshKey((k) => k + 1)}
                  className="rounded-full p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  title="Refresh preview"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                </button>
              </div>
            ) : null}
          </div>

          {/* Right - Close (code mode) or Share/Publish (preview mode) */}
          <div className="flex items-center gap-2">
            {viewMode === "code" ? (
              <button
                onClick={() => setViewMode("preview")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Close
              </button>
            ) : (
              <>
                <button
                  disabled={isGenerating || isAborted}
                  title={isGenerating || isAborted ? "Creation in Progress" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 h-8 text-sm font-medium text-gray-700 transition-colors ${isGenerating || isAborted ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"}`}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                  </svg>
                  Share
                </button>
                <button
                  disabled={isGenerating || isAborted}
                  title={isGenerating || isAborted ? "Creation in Progress" : undefined}
                  className={`inline-flex items-center rounded-lg bg-blue-600 px-5 h-8 text-sm font-semibold text-white shadow-sm transition-all ${isGenerating || isAborted ? "opacity-50 cursor-not-allowed" : "hover:bg-blue-700"}`}
                >
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
        <div id="chat-panel" className={`shrink-0 bg-[#F9FAFB] overflow-hidden ${isResizing ? "" : "transition-all duration-150 ease-in-out"}`} style={{ width: chatCollapsed ? 0 : chatWidth }}>
          <div className="flex flex-col h-full" style={{ width: chatWidth }}>

          <div className="flex-1 overflow-y-auto pl-6 pr-3 py-4 space-y-3 scrollbar-thin">
            {/* Pre-generation messages (from aborted attempts in this session) */}
            {preGenMessages.map((msg, idx) => (
              <div key={`pre-${idx}`}>
                {msg.role === "user" && msg.timestamp && (
                  <p className="text-center text-[12.5px] text-gray-400 font-sans mt-3 mb-1.5">
                    {new Date(msg.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at {new Date(msg.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm bg-white border border-gray-200">
                      <p className="text-[14.5px] font-sans text-gray-700">{msg.content}</p>
                    </div>
                  </div>
                ) : (
                  <div className="py-1.5">
                    <p className="text-[14.5px] font-sans text-gray-700">{msg.content}</p>
                  </div>
                )}
              </div>
            ))}

            {/* Show prompt for generating/aborted state */}
            {(isGenerating || isAborted) && pendingPrompt && (
              <>
                {pendingTimestamp && (
                  <p className="text-center text-[12.5px] text-gray-400 font-sans mt-3 mb-1.5">
                    {new Date(pendingTimestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at {new Date(pendingTimestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
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
                  <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm bg-white border border-gray-200">
                    <p className="text-[14.5px] font-sans text-gray-700">{pendingPrompt}</p>
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
                  <div className="py-1.5">
                    <p className="text-[14.5px] font-sans text-gray-700">This message was cancelled.</p>
                  </div>
                )}
              </>
            )}

            {/* Show full chat for ready state */}
            {isReady && funnel && (
              <>
                {/* Pre-generation messages are already rendered above */}
                {funnel.createdAt && (
                  <p className="text-center text-[12.5px] text-gray-400 font-sans mt-3 mb-1.5">
                    {new Date(funnel.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at {new Date(funnel.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
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
                  <div className="max-w-[85%] rounded-2xl bg-white border border-gray-200 px-3.5 py-2.5 shadow-sm">
                    <p className="text-[14.5px] font-sans text-gray-700">{funnel.prompt}</p>
                  </div>
                </div>
                <div className="py-1.5">
                  <p className="text-[14.5px] font-sans text-gray-700">
                    I&apos;ve created your project with {fileCount} files. You can ask me to make changes — edit components, add pages, change the theme, or modify functionality.
                  </p>
                </div>
                {chatMessages.map((msg, idx) => (
                  <div key={idx}>
                    {msg.role === "user" && msg.timestamp && (
                      <p className="text-center text-[12.5px] text-gray-400 font-sans mt-3 mb-1.5">
                        {new Date(msg.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at {new Date(msg.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
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
                    {msg.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm bg-white border border-gray-200">
                          <p className="text-[14.5px] font-sans text-gray-700">{msg.content}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="py-1.5">
                        <p className="text-[14.5px] font-sans text-gray-700">{msg.content}</p>
                      </div>
                    )}
                  </div>
                ))}
                {isSending && (
                  <div className="py-1.5">
                    <div>
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
          <div className="bg-[#F9FAFB] pl-6 pr-3 py-3">
            {isGenerating ? (
              <form className="flex items-center gap-2 rounded-xl bg-white border border-gray-200 px-3 py-2.5 transition-all" onSubmit={(e) => e.preventDefault()}>
                <input
                  ref={chatFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                />
                <button
                  type="button"
                  disabled
                  title="Creation in Progress"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 opacity-50 cursor-not-allowed"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
                <input
                  type="text"
                  disabled
                  placeholder="Describe changes you want..."
                  className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={handleAbortGeneration}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white transition-all hover:bg-black"
                  title="Stop generation"
                >
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                </button>
              </form>
            ) : isAborted ? (
              <div className="space-y-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (chatInput.trim()) {
                      // Save the cancelled exchange to pre-generation messages
                      if (pendingPrompt) {
                        setPreGenMessages((prev) => [
                          ...prev,
                          { role: "user" as const, content: pendingPrompt, timestamp: pendingTimestamp || new Date().toISOString() },
                          { role: "assistant" as const, content: "This message was cancelled.", timestamp: new Date().toISOString() },
                        ]);
                      }
                      setPendingPrompt(chatInput.trim());
                      setPendingTimestamp(new Date().toISOString());
                      startGeneration(chatInput.trim(), pendingModel);
                      setChatInput("");
                    } else {
                      handleRetryGeneration();
                    }
                  }}
                  className="flex items-center gap-2 rounded-xl bg-white border border-gray-200 px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400/30 transition-all"
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
                    placeholder="Describe what you want to build..."
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
            ) : isSending ? (
              <form className="flex items-center gap-2 rounded-xl bg-white border border-gray-200 px-3 py-2.5 transition-all" onSubmit={(e) => e.preventDefault()}>
                <button
                  type="button"
                  disabled
                  title="Generation in progress"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 opacity-50 cursor-not-allowed"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
                <input
                  type="text"
                  disabled
                  placeholder="Describe changes you want..."
                  className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={handleStop}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white transition-all hover:bg-black"
                  title="Stop generation"
                >
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                </button>
              </form>
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
                  className="flex items-center gap-2 rounded-xl bg-white border border-gray-200 px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400/30 transition-all"
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
        </div>

        {/* Resize handle — overlaps canvas left edge, invisible */}
        {!chatCollapsed && (
          <div
            className="shrink-0 w-0 relative z-20"
          >
            <div
              className="absolute top-0 bottom-0 w-4 cursor-col-resize"
              style={{ left: 10 }}
              onMouseDown={handleResizeStart}
              onDoubleClick={handleResizeDoubleClick}
            />
          </div>
        )}

        {/* Canvas (right) */}
        <div className={`flex flex-1 flex-col items-center justify-center bg-[#F9FAFB] overflow-hidden pt-1 px-3 pb-3 ${isResizing ? "pointer-events-none" : ""}`}>
          {/* ── Generating animation in canvas (preview mode only) ── */}
          {isGenerating && viewMode === "preview" && (
            <div className="relative w-full h-full rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
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

          {/* ── Aborted state in canvas — waiting for new prompt ── */}
          {isAborted && (
            <div className="relative w-full h-full rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 vibe-animated-bg">
                <div className="absolute inset-0 vibe-gradient-sweep" />
                <div className="absolute w-[500px] h-[500px] rounded-full opacity-20 blur-[100px] vibe-blob-1" />
                <div className="absolute w-[400px] h-[400px] rounded-full opacity-15 blur-[80px] vibe-blob-2" />
                <div className="absolute w-[350px] h-[350px] rounded-full opacity-10 blur-[70px] vibe-blob-3" />
              </div>
              <div className="relative flex flex-col items-center gap-4 text-center px-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FEC403] via-[#2896FB] to-[#4BCF29]">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12" />
                  </svg>
                </div>
                <p className="text-base font-medium text-gray-700 transition-all duration-500">
                  {WAITING_MESSAGES[waitingMsgIndex]}
                </p>
                <p className="text-sm text-gray-400">Enter a prompt in the chat to start building</p>
              </div>
            </div>
          )}

          {/* ── Ready state - Preview mode (Sandpack) ── */}
          {isReady && projectFiles && viewMode === "preview" && (
            <>
              <div
                className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg transition-all duration-300"
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

          {/* ── Generating state - Code mode (simulated) ── */}
          {isGenerating && viewMode === "code" && (
            <div className="flex w-full h-full bg-[#1e1e2e] overflow-hidden rounded-2xl">
              {/* Simulated file tree */}
              <div className="w-60 shrink-0 border-r border-[#2a2a3e] bg-[#1b1b2f] flex flex-col">
                <div className="p-2 border-b border-[#2a2a3e]">
                  <div className="flex items-center gap-2 rounded-md bg-[#252540] px-2.5 py-1.5 border border-[#333355]">
                    <svg className="h-3.5 w-3.5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <span className="text-xs text-gray-600">Search files...</span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto py-1">
                  {SIMULATED_CODE_FILES.slice(0, simFileIndex + 1).map((f, i) => (
                    <div
                      key={f.path}
                      className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer ${i === simFileIndex ? "bg-[#252540] text-white" : "text-gray-400 hover:text-gray-300"}`}
                    >
                      <svg className="h-3 w-3 shrink-0" style={{ color: f.name.endsWith(".tsx") ? "#3b82f6" : f.name.endsWith(".css") ? "#a855f7" : f.name.endsWith(".html") ? "#ef4444" : "#eab308" }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span className="truncate">{f.path}</span>
                      {i === simFileIndex && simTypedChars < f.code.length && (
                        <div className="ml-auto h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {/* Simulated code content */}
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* Tab */}
                <div className="flex items-center border-b border-[#2a2a3e] bg-[#1b1b2f]">
                  <div className="flex items-center gap-1.5 px-3 py-2 text-xs bg-[#1e1e2e] text-white border-r border-[#2a2a3e] border-t-2 border-t-[#2896FB]">
                    <svg className="h-3 w-3" style={{ color: SIMULATED_CODE_FILES[simFileIndex]?.name.endsWith(".tsx") ? "#3b82f6" : SIMULATED_CODE_FILES[simFileIndex]?.name.endsWith(".css") ? "#a855f7" : SIMULATED_CODE_FILES[simFileIndex]?.name.endsWith(".html") ? "#ef4444" : "#eab308" }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <span>{SIMULATED_CODE_FILES[simFileIndex]?.name}</span>
                  </div>
                </div>
                {/* File path */}
                <div className="flex items-center px-4 py-1.5 bg-[#1e1e2e] border-b border-[#2a2a3e] shrink-0">
                  <span className="text-xs text-gray-500">{SIMULATED_CODE_FILES[simFileIndex]?.path}</span>
                </div>
                {/* Code with typing effect */}
                <div className="flex flex-1 overflow-auto">
                  <div className="select-none py-4 pl-4 pr-2 text-right text-xs leading-5 text-gray-600 font-mono overflow-hidden shrink-0">
                    {(SIMULATED_CODE_FILES[simFileIndex]?.code.slice(0, simTypedChars) || "").split("\n").map((_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>
                  <pre className="flex-1 py-4 pr-4 text-xs leading-5 font-mono overflow-auto text-gray-300" style={{ tabSize: 2, whiteSpace: "pre", wordWrap: "normal" }}>
                    <code>{SIMULATED_CODE_FILES[simFileIndex]?.code.slice(0, simTypedChars)}</code>
                    <span className="inline-block w-[2px] h-[14px] bg-white animate-pulse ml-[1px] align-middle" />
                  </pre>
                </div>
              </div>
            </div>
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
