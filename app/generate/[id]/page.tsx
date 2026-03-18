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
import type { ChatMessage } from "@/lib/storage";
import { readStreamResponse } from "@/lib/stream-response";
import { consumePendingGeneration } from "@/lib/pending-generation";
import ImageUpload from "@/components/image-upload";
import { DEFAULT_MODEL, DUAL_MODEL } from "@/components/model-data";

hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("json", json);

/** Play a short two-tone chime using Web Audio API to signal generation complete. */
function playChime() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Two-note chime: C5 then E5
    const notes = [
      { freq: 523.25, start: 0, dur: 0.15 },
      { freq: 659.25, start: 0.15, dur: 0.25 },
    ];

    for (const { freq, start, dur } of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.18, now + start);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
    }

    // Clean up context after notes finish
    setTimeout(() => ctx.close(), 600);
  } catch {
    // Audio not available — ignore silently
  }
}

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
  hasCalendar?: boolean;
  selectedCalendarId?: string | null;
  selectedCalendarName?: string | null;
  selectedCalendarSlotDuration?: number | null;
  calendarSlots?: Record<string, string[]> | null;
  companionFunnelId?: string;
  companionModel?: string;
}

interface GHLCalendarItem {
  id: string;
  name: string;
  calendarType: string;
  slotDuration: number;
  description?: string;
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

const IMAGE_CLONE_STEPS = [
  { label: "Analyzing screenshots", icon: "scan", duration: 3000 },
  { label: "Extracting colors & fonts", icon: "palette", duration: 4000 },
  { label: "Mapping layout structure", icon: "layout", duration: 5000 },
  { label: "Building React components", icon: "code", duration: 5000 },
  { label: "Recreating visual design", icon: "responsive", duration: 6000 },
  { label: "Matching pixel-perfect details", icon: "sparkle", duration: 4000 },
  { label: "Setting up routing", icon: "nav", duration: 3000 },
  { label: "Generating images", icon: "link", duration: 3000 },
  { label: "Finalizing clone", icon: "check", duration: 5000 },
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

interface ModelResult {
  funnelId: string | null;
  funnel: FunnelData | null;
  chatMessages: ChatMessage[];
  status: "idle" | "generating" | "success" | "error";
  error?: string;
}

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
  const dualAbortRef = useRef<AbortController | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Dual-model generation state
  const initModelResult = (): ModelResult => ({ funnelId: null, funnel: null, chatMessages: [], status: "idle" });
  const [geminiResult, setGeminiResult] = useState<ModelResult>(initModelResult);
  const [openaiResult, setOpenaiResult] = useState<ModelResult>(initModelResult);
  const [activeModel, setActiveModel] = useState<"gemini" | "openai">("gemini");
  const [isDualGeneration, setIsDualGeneration] = useState(false);

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
  const chatMaxWidth = 500;
  const chatDefaultWidth = 320;

  // Compute chatMinWidth dynamically based on window width
  const getChatMinWidth = useCallback(() => {
    return typeof window !== "undefined" ? Math.max(256, Math.round(window.innerWidth * 0.2)) : 256;
  }, []);
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
  const [isImageCloneMode, setIsImageCloneMode] = useState(false);

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

  // Calendar integration state
  const [hasCalendar, setHasCalendar] = useState(false);
  const [calendarList, setCalendarList] = useState<GHLCalendarItem[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [selectedCalendarName, setSelectedCalendarName] = useState<string | null>(null);
  const [selectedCalendarSlotDuration, setSelectedCalendarSlotDuration] = useState<number | null>(null);
  const [calendarSlots, setCalendarSlots] = useState<Record<string, string[]> | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarFromEdit, setCalendarFromEdit] = useState(false);
  const [deferredCalendarAiMsg, setDeferredCalendarAiMsg] = useState<ChatMessage | null>(null);

  // Publish state
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [publishSlug, setPublishSlug] = useState("");
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState(false);

  // Restore chat width from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("vibe-chat-width");
      if (saved) {
        const w = Math.max(getChatMinWidth(), Math.min(chatMaxWidth, Number(saved)));
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
      const newWidth = Math.max(getChatMinWidth(), Math.min(chatMaxWidth, e.clientX));
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

  // Auto-repair handler — called by ReactProjectPreview when Sandpack compilation
  // error is automatically fixed by the LLM repair API
  const handleAutoRepair = useCallback((repairedFiles: Record<string, string>) => {
    setFunnel((prev) => (prev ? { ...prev, files: repairedFiles } : prev));
    setRefreshKey((k) => k + 1);
  }, []);

  // GHL form submission handler — listens for form data from Sandpack iframe
  useEffect(() => {
    const handleGhlFormSubmit = async (e: MessageEvent) => {
      if (!e.data || e.data.type !== "ghl-form-submit") return;

      const { fields, customFieldKeys, customFieldLabels, bookingData } = e.data;
      if (!fields || Object.keys(fields).length === 0) return;

      console.log("[GHL] Received form submission from iframe:", fields);
      if (customFieldKeys?.length) console.log("[GHL] Custom field keys:", customFieldKeys);
      if (customFieldLabels && Object.keys(customFieldLabels).length) console.log("[GHL] Custom field labels:", customFieldLabels);
      if (bookingData) console.log("[GHL] Booking data:", bookingData);

      const iframe = document.querySelector('.sp-preview-iframe') as HTMLIFrameElement;

      try {
        // Step 0: Verify slot availability before creating contact
        if (bookingData?.selectedSlot && selectedCalendarId) {
          console.log("[Booking] Verifying slot availability — selected:", bookingData.selectedSlot, "calendarId:", selectedCalendarId);
          try {
            const slotsRes = await fetch(`/api/ghl/calendars/${selectedCalendarId}/slots`);
            const slotsData = await slotsRes.json();
            console.log("[Booking] Fresh slots response:", slotsRes.status, "days:", slotsRes.ok && slotsData.slots ? Object.keys(slotsData.slots).length : "N/A");
            if (slotsRes.ok && slotsData.slots) {
              const freshSlots = slotsData.slots as Record<string, string[]>;
              const dateKey = bookingData.selectedSlot.substring(0, 10);
              const time = bookingData.selectedSlot.substring(11, 16);
              const slotsForDate = freshSlots[dateKey];
              const isAvailable = slotsForDate?.includes(time);
              console.log("[Booking] Checking date:", dateKey, "time:", time, "— slots for date:", slotsForDate?.length ?? 0, "available:", isAvailable);

              if (!isAvailable) {
                console.warn("[Booking] Slot unavailable! Remaining slots for", dateKey + ":", slotsForDate ?? "no slots for this date");
                // Show error toast asking user to refresh availability
                iframe?.contentWindow?.postMessage({
                  type: "ghl-form-result",
                  success: false,
                  message: "The selected time slot is no longer available. Please refresh availability and choose another slot.",
                }, "*");
                console.log("[Booking] Aborting submission — slot no longer available");
                return;
              }

              console.log("[Booking] Slot verified available — proceeding with submission");
            }
          } catch (slotCheckErr) {
            console.warn("[Booking] Slot availability check failed, proceeding with submission anyway:", slotCheckErr);
          }
        }

        // Step 1: Create contact
        const res = await fetch("/api/ghl/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields, customFieldKeys, customFieldLabels }),
        });

        let data: Record<string, unknown> = {};
        try { data = await res.json(); } catch { /* non-JSON response */ }
        console.log("[GHL] Contact API response:", res.status, data);

        if (!res.ok) {
          iframe?.contentWindow?.postMessage({
            type: "ghl-form-result",
            success: false,
            message: typeof data.error === "string" ? data.error : "Submission failed",
          }, "*");
          return;
        }

        // Step 2: If booking data exists, create appointment
        if (bookingData?.selectedSlot && selectedCalendarId && data.contactId) {
          const appointmentRequest = {
            contactId: data.contactId,
            calendarId: selectedCalendarId,
            selectedSlot: bookingData.selectedSlot,
            slotDuration: selectedCalendarSlotDuration || 30,
          };
          console.log("[Booking] Creating appointment:", JSON.stringify(appointmentRequest, null, 2));
          try {
            const apptRes = await fetch("/api/ghl/book-appointment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(appointmentRequest),
            });

            let apptData: Record<string, unknown> = {};
            try { apptData = await apptRes.json(); } catch { /* non-JSON response */ }
            console.log("[Booking] Appointment API response:", apptRes.status, apptData);

            iframe?.contentWindow?.postMessage({
              type: "ghl-form-result",
              success: apptRes.ok,
              message: apptRes.ok
                ? "Appointment booked successfully!"
                : (typeof apptData.error === "string" ? apptData.error : "Failed to book appointment"),
            }, "*");
          } catch (apptErr) {
            console.error("[GHL] Appointment network error:", apptErr);
            iframe?.contentWindow?.postMessage({
              type: "ghl-form-result",
              success: false,
              message: "Contact saved but failed to book appointment. Please try again.",
            }, "*");
          }
        } else {
          // Regular form (no booking) — log why booking was skipped if any booking data was partially present
          if (bookingData || selectedCalendarId) {
            console.warn("[Booking] Skipped appointment creation — selectedSlot:", bookingData?.selectedSlot ?? "missing", "calendarId:", selectedCalendarId ?? "missing", "contactId:", data.contactId ?? "missing");
          }
          iframe?.contentWindow?.postMessage({
            type: "ghl-form-result",
            success: true,
            message: "Form submitted successfully!",
          }, "*");
        }
      } catch (err) {
        console.error("[GHL] Network error:", err);
        iframe?.contentWindow?.postMessage({
          type: "ghl-form-result",
          success: false,
          message: "Network error. Please try again.",
        }, "*");
      }
    };

    window.addEventListener("message", handleGhlFormSubmit);
    return () => window.removeEventListener("message", handleGhlFormSubmit);
  }, [selectedCalendarId, selectedCalendarSlotDuration]);

  // Project files for Sandpack preview
  const projectFiles = funnel?.files || null;

  // Page route state (must be declared here with all other hooks)
  const [currentPage, setCurrentPage] = useState("/");
  const [pageSelectorOpen, setPageSelectorOpen] = useState(false);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

  // Derived calendar blocking states
  const isCalendarBlocking = hasCalendar && !selectedCalendarId;
  const isCalendarSlotsLoading = hasCalendar && !!selectedCalendarId && !calendarSlots;

  // Calendar helper functions
  const fetchCalendars = useCallback(async () => {
    console.log("[Calendar] Fetching calendar list...");
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const res = await fetch("/api/ghl/calendars");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch calendars");
      console.log("[Calendar] Loaded", data.calendars?.length, "calendars");
      setCalendarList(data.calendars || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load calendars";
      console.error("[Calendar] Error:", msg);
      setCalendarError(msg);
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  const fetchSlots = useCallback(async (calendarId: string, funnelId: string) => {
    console.log(`[Calendar] Fetching slots for calendar ${calendarId}...`);
    setSlotsLoading(true);
    try {
      const res = await fetch(`/api/ghl/calendars/${calendarId}/slots`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch slots");
      console.log("[Calendar] Loaded slots:", typeof data.slots === "object" ? Object.keys(data.slots).length + " days" : data.slots);
      setCalendarSlots(data.slots);

      // Persist to funnel
      await fetch(`/api/funnel/${funnelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarSlots: data.slots }),
      });
      console.log("[Calendar] Slots persisted to funnel");
    } catch (err) {
      console.error("[Calendar] Slots error:", err);
      setCalendarSlots(null);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  const handleCalendarSelect = useCallback(async (calendarId: string, calendarName: string) => {
    if (!funnel) return;
    console.log(`[Calendar] Selected calendar: ${calendarName} (${calendarId})`);

    const selectedCal = calendarList.find(c => c.id === calendarId);
    const slotDur = selectedCal?.slotDuration || 30;

    setSelectedCalendarId(calendarId);
    setSelectedCalendarName(calendarName);
    setSelectedCalendarSlotDuration(slotDur);
    console.log("[Calendar] Selection set — persisting to funnel and fetching slots...");

    // Persist calendar selection to funnel
    await fetch(`/api/funnel/${funnel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedCalendarId: calendarId,
        selectedCalendarName: calendarName,
        selectedCalendarSlotDuration: slotDur,
      }),
    });
    console.log("[Calendar] Selection persisted to funnel");

    // Fetch slots (loading state shown as transient UI in calendar section)
    await fetchSlots(calendarId, funnel.id);
    console.log("[Calendar] Slots fetched successfully");

    // Persist the "Connected to calendar" badge as a chat message
    const calendarMsg: ChatMessage = {
      role: "calendar-connected",
      content: calendarName,
      timestamp: new Date().toISOString(),
    };

    // Build updated chatHistory with the calendar-connected message
    const currentHistory = [...(funnel.chatHistory || [])];

    if (deferredCalendarAiMsg) {
      // Edit flow: AI msg is already the last entry in chatHistory (persisted by /api/chat).
      // Insert calendarMsg before it so order is: userMsg → calendarMsg → aiMsg
      currentHistory.splice(currentHistory.length - 1, 0, calendarMsg);
      setChatMessages((prev) => [...prev, calendarMsg, deferredCalendarAiMsg]);
      setDeferredCalendarAiMsg(null);
      console.log("[Calendar] Edit flow — inserted calendar badge and flushed deferred AI message");
    } else {
      // Initial generation flow: just append calendarMsg
      currentHistory.push(calendarMsg);
      setChatMessages((prev) => [...prev, calendarMsg]);
      console.log("[Calendar] Initial gen flow — appended calendar badge to chat");
    }

    // Persist updated chatHistory
    console.log("[Calendar] Persisting chatHistory — length:", currentHistory.length,
      "roles:", currentHistory.map(m => m.role));
    const patchRes = await fetch(`/api/funnel/${funnel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatHistory: currentHistory }),
    });
    console.log("[Calendar] PATCH response:", patchRes.status, patchRes.ok ? "OK" : "FAILED");
    console.log("[Calendar] Calendar flow complete — badge persisted to chatHistory");
  }, [funnel, fetchSlots, calendarList, deferredCalendarAiMsg]);

  // Helper: initialize calendar flow after generation/load
  const initCalendarFlow = useCallback((funnelData: FunnelData, funnelId: string) => {
    if (funnelData.hasCalendar) {
      console.log("[Calendar] Calendar detected in funnel");
      setHasCalendar(true);

      if (funnelData.selectedCalendarId) {
        console.log("[Calendar] Restoring previous calendar selection:", funnelData.selectedCalendarId);
        setSelectedCalendarId(funnelData.selectedCalendarId);
        setSelectedCalendarName(funnelData.selectedCalendarName || null);
        setSelectedCalendarSlotDuration(funnelData.selectedCalendarSlotDuration || null);
        if (funnelData.calendarSlots) {
          setCalendarSlots(funnelData.calendarSlots);
        } else {
          fetchSlots(funnelData.selectedCalendarId, funnelId);
        }
      } else {
        fetchCalendars();
      }
    } else {
      setHasCalendar(false);
    }
  }, [fetchCalendars, fetchSlots]);

  // Helper: run a single model generation and return result
  const runSingleModelGeneration = useCallback(
    async (
      prompt: string,
      modelId: string,
      controller: AbortController,
      images?: string[],
      scrapeData?: Record<string, unknown>,
      isImageClone?: boolean,
      scrapeUrl?: string,
    ): Promise<{ id: string; funnelData: FunnelData }> => {
      const t0 = performance.now();
      console.log(`[DualGen:${modelId}] Starting API call...`);

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model: modelId, images, scrapeData, isImageClone, scrapeUrl }),
        signal: controller.signal,
      });

      console.log(`[DualGen:${modelId}] API response status: ${res.status} (${Math.round(performance.now() - t0)}ms)`);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to generate" }));
        console.error(`[DualGen:${modelId}] API error:`, errData);
        throw new Error(errData.error || "Failed to generate");
      }

      const data = await readStreamResponse<{ id: string; fileCount: number; hasCalendar: boolean }>(
        res,
        (_msg: string, eventData?: unknown) => {
          console.log(`[DualGen:${modelId}] Stream progress: ${_msg}`);
          if (_msg === "scrape-complete" && eventData && typeof eventData === "object" && "screenshot" in eventData) {
            const screenshot = (eventData as { screenshot: string }).screenshot;
            if (screenshot) setPendingPromptImages([screenshot]);
          }
        }
      );

      const elapsed = Math.round(performance.now() - t0);
      console.log(`[DualGen:${modelId}] Generation complete in ${elapsed}ms — funnelId: ${data.id}, fileCount: ${data.fileCount}, hasCalendar: ${data.hasCalendar}`);

      const funnelRes = await fetch(`/api/funnel/${data.id}`);
      if (!funnelRes.ok) throw new Error("Failed to load funnel");
      const funnelData = await funnelRes.json();
      console.log(`[DualGen:${modelId}] Funnel loaded — ${Object.keys(funnelData.files || {}).length} files`);
      return { id: data.id, funnelData };
    },
    []
  );

  const startGeneration = useCallback(
    async (prompt: string, model: string, images?: string[], scrapeData?: Record<string, unknown>, isImageClone?: boolean, scrapeUrl?: string) => {
      console.log("[startGeneration] Called with:", {
        prompt: prompt?.slice(0, 50),
        model,
        imageCount: images?.length ?? 0,
        isImageClone,
        scrapeUrl,
      });
      setGeneratingState("generating");
      setGenerationStep(0);
      setGenerationProgress(0);
      setIsImageCloneMode(!!isImageClone);

      // Reset dual-model state
      console.log("[DualGen] Resetting dual-model state, firing parallel generation for Gemini + OpenAI");
      setGeminiResult(initModelResult());
      setOpenaiResult(initModelResult());
      setActiveModel("gemini");
      setIsDualGeneration(true);

      const steps = isImageClone ? IMAGE_CLONE_STEPS : GENERATION_STEPS;

      let step = 0;
      stepTimerRef.current = setInterval(() => {
        step = (step + 1) % steps.length;
        setGenerationStep(step);
      }, 3500);

      let progress = 0;
      progressTimerRef.current = setInterval(() => {
        progress += 0.3 + Math.random() * 0.4;
        if (progress > 85) progress = 85;
        setGenerationProgress(progress);
      }, 200);

      const geminiController = new AbortController();
      const openaiController = new AbortController();
      generateAbortRef.current = geminiController;
      dualAbortRef.current = openaiController;

      // Mark both as generating
      setGeminiResult(prev => ({ ...prev, status: "generating" }));
      setOpenaiResult(prev => ({ ...prev, status: "generating" }));

      let firstCompleted = false;

      // Helper: handle when a model completes successfully
      const handleModelSuccess = (
        which: "gemini" | "openai",
        result: { id: string; funnelData: FunnelData },
        setResult: React.Dispatch<React.SetStateAction<ModelResult>>
      ) => {
        console.log(`[DualGen] ${which} SUCCESS — funnelId: ${result.id}, files: ${Object.keys(result.funnelData.files || {}).length}, isFirst: ${!firstCompleted}`);
        setResult({
          funnelId: result.id,
          funnel: result.funnelData,
          chatMessages: result.funnelData.chatHistory || [],
          status: "success",
        });

        if (!firstCompleted) {
          firstCompleted = true;
          console.log(`[DualGen] 🏆 First model completed: ${which} — showing this result, other model still running`);

          if (progressTimerRef.current) clearInterval(progressTimerRef.current);
          if (stepTimerRef.current) clearInterval(stepTimerRef.current);
          setGenerationProgress(100);

          // Show the first completed model
          setActiveModel(which);
          setFunnel(result.funnelData);
          setChatMessages(result.funnelData.chatHistory || []);
          setEditModel(result.funnelData.model);
          setLoading(false);

          setTimeout(() => {
            window.history.replaceState(null, "", `/generate/${result.id}`);
            setGeneratingState("idle");
            playChime();
            initCalendarFlow(result.funnelData, result.id);

            if (preGenMessagesRef.current.length > 0) {
              fetch(`/api/funnel/${result.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ preGenHistory: preGenMessagesRef.current }),
              }).catch(() => {});
            }

            captureSnapshot(result.id);
          }, 600);
        }
      };

      // Helper: handle when a model fails
      const handleModelError = (
        which: "gemini" | "openai",
        err: unknown,
        setResult: React.Dispatch<React.SetStateAction<ModelResult>>
      ) => {
        const isAbort = err instanceof DOMException && err.name === "AbortError";
        const message = isAbort ? "Cancelled" : err instanceof Error ? err.message : "Something went wrong";
        console.error(`[DualGen] ${which} FAILED — ${isAbort ? "aborted by user" : message}`, isAbort ? "" : err);
        setResult(prev => ({ ...prev, status: "error", error: message }));
      };

      // Fire both in parallel
      console.log(`[DualGen] Firing parallel requests — Gemini: ${DEFAULT_MODEL.id}, OpenAI: ${DUAL_MODEL.id}`);
      const geminiPromise = runSingleModelGeneration(
        prompt, DEFAULT_MODEL.id, geminiController, images, scrapeData, isImageClone, scrapeUrl
      ).then(
        (result) => handleModelSuccess("gemini", result, setGeminiResult),
        (err) => handleModelError("gemini", err, setGeminiResult)
      );

      const openaiPromise = runSingleModelGeneration(
        prompt, DUAL_MODEL.id, openaiController, images, scrapeData, isImageClone, scrapeUrl
      ).then(
        (result) => handleModelSuccess("openai", result, setOpenaiResult),
        (err) => handleModelError("openai", err, setOpenaiResult)
      );

      // Wait for both to settle
      console.log("[DualGen] Waiting for both models to settle...");
      await Promise.allSettled([geminiPromise, openaiPromise]);
      console.log("[DualGen] Both models settled");

      // Post-settle: check for failures and link companion funnels
      setTimeout(() => {
        setGeminiResult(prev => {
          setOpenaiResult(oPrev => {
            console.log(`[DualGen] Post-settle check — gemini: ${prev.status}${prev.error ? ` (${prev.error})` : ""}, openai: ${oPrev.status}${oPrev.error ? ` (${oPrev.error})` : ""}`);
            if (prev.status === "error" && oPrev.status === "error") {
              console.error("[DualGen] Both models FAILED — showing error state");
              setError(prev.error || oPrev.error || "Both models failed");
              setGeneratingState("error");
              if (progressTimerRef.current) clearInterval(progressTimerRef.current);
              if (stepTimerRef.current) clearInterval(stepTimerRef.current);
            }
            // Check if both aborted
            if (prev.status === "error" && prev.error === "Cancelled" &&
                oPrev.status === "error" && oPrev.error === "Cancelled") {
              console.log("[DualGen] Both models aborted by user");
              setGeneratingState("aborted");
              setHasCalendar(false);
              setCalendarList([]);
              setSelectedCalendarId(null);
              setSelectedCalendarName(null);
              setSelectedCalendarSlotDuration(null);
              setCalendarSlots(null);
              if (progressTimerRef.current) clearInterval(progressTimerRef.current);
              if (stepTimerRef.current) clearInterval(stepTimerRef.current);
            }

            // Link companion funnels so the switcher persists on reload
            if (prev.status === "success" && oPrev.status === "success" && prev.funnelId && oPrev.funnelId) {
              console.log(`[DualGen] Linking companions: gemini=${prev.funnelId} ↔ openai=${oPrev.funnelId}`);
              fetch(`/api/funnel/${prev.funnelId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companionFunnelId: oPrev.funnelId, companionModel: DUAL_MODEL.id }),
              }).then(r => console.log(`[DualGen] Linked gemini → openai: ${r.status}`))
                .catch(e => console.error("[DualGen] Failed to link gemini companion:", e));
              fetch(`/api/funnel/${oPrev.funnelId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companionFunnelId: prev.funnelId, companionModel: DEFAULT_MODEL.id }),
              }).then(r => console.log(`[DualGen] Linked openai → gemini: ${r.status}`))
                .catch(e => console.error("[DualGen] Failed to link openai companion:", e));
            }

            return oPrev;
          });
          return prev;
        });
      }, 100);

      generateAbortRef.current = null;
      dualAbortRef.current = null;
    },
    [captureSnapshot, initCalendarFlow, runSingleModelGeneration]
  );

  useEffect(() => {
    if (rawId === "new") {
      // New generation flow — consumePendingGeneration checks in-memory first, then sessionStorage
      const pendingData = consumePendingGeneration();
      console.log("[Generate] consumePendingGeneration:", pendingData ? {
        prompt: pendingData.prompt?.slice(0, 50),
        model: pendingData.model,
        imageCount: pendingData.images?.length ?? 0,
        imageSizes: pendingData.images?.map((img) => `${Math.round(img.length / 1024)}KB`),
        scrapeUrl: pendingData.scrapeUrl,
        isImageClone: pendingData.isImageClone,
        hasScrapeData: !!pendingData.scrapeData,
      } : "NULL — no pending data");
      if (pendingData) {
        const { prompt, model, images, scrapeData, scrapeUrl, isImageClone } = pendingData;
        setPendingPrompt(prompt);
        setPendingTimestamp(new Date().toISOString());
        setPendingModel(model);
        if (Array.isArray(images) && images.length > 0) {
          console.log("[Generate] Setting pendingPromptImages:", images.length, "images");
          setPendingPromptImages(images);
        }
        setLoading(false);

        if (scrapeUrl) {
          console.log("[Generate] Starting URL clone flow with scrapeUrl:", scrapeUrl);
          startGeneration(prompt, model, undefined, undefined, false, scrapeUrl);
        } else if (isImageClone) {
          console.log("[Generate] Starting IMAGE CLONE flow with", images?.length, "images");
          startGeneration(prompt, model, images, undefined, true);
        } else {
          console.log("[Generate] Starting NORMAL generation flow with", images?.length ?? 0, "images");
          startGeneration(prompt, model, images, scrapeData || undefined);
        }
      } else {
        console.warn("[Generate] No pending data found — redirecting to home");
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
        console.log("[Load] chatHistory length:", (data.chatHistory || []).length,
          "roles:", (data.chatHistory || []).map((m: ChatMessage) => m.role));
        setChatMessages(data.chatHistory || []);
        if (data.preGenHistory && data.preGenHistory.length > 0) {
          setPreGenMessages(data.preGenHistory);
        }
        setEditModel(data.model);

        // Restore calendar state
        initCalendarFlow(data, rawId);

        // Restore dual-gen state if this funnel has a companion
        if (data.companionFunnelId) {
          console.log(`[Load] Companion found: ${data.companionFunnelId} (model: ${data.companionModel})`);
          try {
            const companionRes = await fetch(`/api/funnel/${data.companionFunnelId}`);
            if (companionRes.ok) {
              const companionData = await companionRes.json();
              console.log(`[Load] Companion loaded — ${Object.keys(companionData.files || {}).length} files`);

              // Determine which is gemini and which is openai
              const thisIsGemini = data.model.startsWith("gemini");
              const thisResult: ModelResult = {
                funnelId: rawId,
                funnel: data,
                chatMessages: data.chatHistory || [],
                status: "success",
              };
              const companionResult: ModelResult = {
                funnelId: data.companionFunnelId,
                funnel: companionData,
                chatMessages: companionData.chatHistory || [],
                status: "success",
              };

              if (thisIsGemini) {
                setGeminiResult(thisResult);
                setOpenaiResult(companionResult);
                setActiveModel("gemini");
              } else {
                setOpenaiResult(thisResult);
                setGeminiResult(companionResult);
                setActiveModel("openai");
              }
              setIsDualGeneration(true);
            }
          } catch {
            console.warn("[Load] Failed to load companion funnel — switcher won't show");
          }
        }

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
  }, [rawId, router, startGeneration, captureSnapshot, initCalendarFlow]);

  // Check if this funnel has been published
  useEffect(() => {
    if (!funnel?.id) return;
    fetch(`/api/funnel/${funnel.id}/publish`)
      .then((res) => res.json())
      .then((data) => {
        if (data.slug) {
          setPublishedSlug(data.slug);
          setPublishSlug(data.slug);
        }
      })
      .catch(() => {});
  }, [funnel?.id]);

  // Publish handler
  const handlePublish = useCallback(async () => {
    if (!funnel?.id || !publishSlug.trim()) return;
    setIsPublishing(true);
    setPublishError(null);
    setPublishSuccess(false);
    try {
      const res = await fetch(`/api/funnel/${funnel.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: publishSlug.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPublishError(data.error || "Failed to publish");
        return;
      }
      setPublishedSlug(data.slug);
      setPublishSuccess(true);
    } catch {
      setPublishError("Network error. Please try again.");
    } finally {
      setIsPublishing(false);
    }
  }, [funnel?.id, publishSlug]);

  // Re-fetch slots when preview refreshes and calendar is selected
  useEffect(() => {
    if (hasCalendar && selectedCalendarId && funnel?.id && refreshKey > 0) {
      console.log("[Calendar] Preview refreshed, re-fetching slots...");
      fetchSlots(selectedCalendarId, funnel.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

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
    console.log("[DualGen] User abort — cancelling both controllers");
    if (generateAbortRef.current) {
      generateAbortRef.current.abort();
    }
    if (dualAbortRef.current) {
      dualAbortRef.current.abort();
    }
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    setGeneratingState("aborted");
  };

  const handleRetryGeneration = () => {
    if (pendingPrompt) {
      startGeneration(pendingPrompt, DEFAULT_MODEL.id);
    }
  };

  // Switch between Gemini and OpenAI results in dual-generation mode
  const handleModelSwitch = useCallback((target: "gemini" | "openai") => {
    if (target === activeModel) return;
    const result = target === "gemini" ? geminiResult : openaiResult;
    if (result.status !== "success" || !result.funnel || !result.funnelId) {
      console.warn(`[DualGen] Cannot switch to ${target} — status: ${result.status}, hasFunnel: ${!!result.funnel}`);
      return;
    }

    console.log(`[DualGen] Switching model: ${activeModel} → ${target} (funnelId: ${result.funnelId}, files: ${Object.keys(result.funnel.files || {}).length})`);

    // Save current chat messages to the model we're leaving
    const setCurrentResult = activeModel === "gemini" ? setGeminiResult : setOpenaiResult;
    setChatMessages(currentMsgs => {
      setCurrentResult(prev => ({ ...prev, chatMessages: currentMsgs }));
      return result.chatMessages;
    });

    setActiveModel(target);
    setFunnel(result.funnel);
    setEditModel(result.funnel.model);
    setCodeFiles([]);
    setRefreshKey(k => k + 1);
    window.history.replaceState(null, "", `/generate/${result.funnelId}`);
    initCalendarFlow(result.funnel, result.funnelId);
  }, [activeModel, geminiResult, openaiResult, initCalendarFlow]);

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

    // Move deferred calendar AI message into chat history before adding new messages
    if (deferredCalendarAiMsg) {
      setChatMessages((prev) => [...prev, deferredCalendarAiMsg]);
      setDeferredCalendarAiMsg(null);
    }

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

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to process edit" }));
        throw new Error(errData.error || "Failed to process edit");
      }

      const data = await readStreamResponse<{ message: string; changedFiles: string[]; hasCalendar: boolean }>(res);

      console.log("[Edit] API response received — hasCalendar:", data.hasCalendar, "prevHasCalendar:", hasCalendar, "message length:", data.message?.length);

      const aiMsg: ChatMessage = {
        role: "assistant",
        content: data.message,
        timestamp: new Date().toISOString(),
      };

      // Reload the funnel to get updated files
      const funnelRes = await fetch(`/api/funnel/${funnel.id}`);
      if (funnelRes.ok) {
        const updatedFunnel = await funnelRes.json();
        setFunnel(updatedFunnel);
        console.log("[Edit] Funnel reloaded — file count:", Object.keys(updatedFunnel.files || {}).length);

        // Keep dual-model result in sync
        if (isDualGeneration) {
          const setResult = activeModel === "gemini" ? setGeminiResult : setOpenaiResult;
          setResult(prev => ({ ...prev, funnel: updatedFunnel }));
        }
      }

      // Handle calendar detection from edit
      const calendarJustAdded = data.hasCalendar !== undefined && data.hasCalendar && !hasCalendar;

      if (calendarJustAdded) {
        // Calendar was just added — defer AI message until calendar selection + slots complete
        console.log("[Calendar] Calendar detected in edit response — deferring AI message until calendar selected");
        setDeferredCalendarAiMsg(aiMsg);
        setCalendarFromEdit(true);
        setHasCalendar(true);
        setSelectedCalendarId(null);
        setSelectedCalendarName(null);
        setSelectedCalendarSlotDuration(null);
        setCalendarSlots(null);
        fetchCalendars();
      } else {
        // No calendar added — show AI message immediately
        console.log("[Edit] No calendar change — showing AI message immediately");
        setChatMessages((prev) => {
          const updated = [...prev, aiMsg];
          // Keep dual-model chat in sync
          if (isDualGeneration) {
            const setResult = activeModel === "gemini" ? setGeminiResult : setOpenaiResult;
            setResult(r => ({ ...r, chatMessages: updated }));
          }
          return updated;
        });
      }

      if (data.hasCalendar !== undefined && !data.hasCalendar && hasCalendar) {
        // Calendar was removed by the edit
        console.log("[Calendar] Calendar removed by edit — clearing calendar state");
        setHasCalendar(false);
        setSelectedCalendarId(null);
        setSelectedCalendarName(null);
        setSelectedCalendarSlotDuration(null);
        setCalendarSlots(null);
        setCalendarList([]);
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
    // Delay revocation to ensure the download has started
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  const activeSteps = isImageCloneMode ? IMAGE_CLONE_STEPS : GENERATION_STEPS;
  const currentStep = activeSteps[generationStep] || activeSteps[0];

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

                {/* Model switcher dropdown — only visible for dual-generated funnels */}
                {isDualGeneration && (
                    <div className="relative">
                      <button
                        onClick={() => setModelSelectorOpen((v) => !v)}
                        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                        title={activeModel === "gemini" ? "Gemini 3 Pro" : "GPT 5.4"}
                      >
                        {/* Active model icon */}
                        {activeModel === "gemini" ? (
                          <img src="/gemini-logo.png" alt="Gemini" className="h-4 w-4 object-contain" />
                        ) : (
                          <img src="/openai-logo.png" alt="OpenAI" className="h-4 w-4 object-contain" />
                        )}
                        {/* Status indicator for the OTHER model */}
                        {(() => {
                          const other = activeModel === "gemini" ? openaiResult : geminiResult;
                          if (other.status === "generating") return (
                            <div className="h-2.5 w-2.5 animate-spin rounded-full border border-gray-400 border-t-transparent" />
                          );
                          if (other.status === "error") return (
                            <div className="h-2 w-2 rounded-full bg-amber-400" title={`Other model failed: ${other.error}`} />
                          );
                          return null;
                        })()}
                      </button>
                      {modelSelectorOpen && (
                        <>
                          <div className="fixed inset-0 z-20" onClick={() => setModelSelectorOpen(false)} />
                          <div className="absolute left-0 top-full mt-1 z-30 w-48 rounded-lg border border-gray-200 bg-white shadow-lg py-1">
                            {/* Gemini option */}
                            <button
                              onClick={() => {
                                if (geminiResult.status === "success") {
                                  handleModelSwitch("gemini");
                                }
                                setModelSelectorOpen(false);
                              }}
                              disabled={geminiResult.status !== "success"}
                              className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                                activeModel === "gemini"
                                  ? "text-blue-600 bg-blue-50 font-medium"
                                  : geminiResult.status === "success"
                                    ? "text-gray-700 hover:bg-gray-50"
                                    : "text-gray-400 cursor-not-allowed"
                              }`}
                            >
                              <img src="/gemini-logo.png" alt="Gemini" className="h-4 w-4 shrink-0 object-contain" />
                              <span className="flex-1 text-left">Gemini 3 Pro</span>
                              {geminiResult.status === "generating" && (
                                <div className="h-3 w-3 animate-spin rounded-full border border-gray-400 border-t-transparent" />
                              )}
                              {geminiResult.status === "error" && (
                                <svg className="h-3.5 w-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                </svg>
                              )}
                              {activeModel === "gemini" && geminiResult.status === "success" && (
                                <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              )}
                            </button>
                            {/* GPT option */}
                            <button
                              onClick={() => {
                                if (openaiResult.status === "success") {
                                  handleModelSwitch("openai");
                                }
                                setModelSelectorOpen(false);
                              }}
                              disabled={openaiResult.status !== "success"}
                              className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                                activeModel === "openai"
                                  ? "text-blue-600 bg-blue-50 font-medium"
                                  : openaiResult.status === "success"
                                    ? "text-gray-700 hover:bg-gray-50"
                                    : "text-gray-400 cursor-not-allowed"
                              }`}
                            >
                              <img src="/openai-logo.png" alt="OpenAI" className="h-4 w-4 shrink-0 object-contain" />
                              <span className="flex-1 text-left">GPT 5.4</span>
                              {openaiResult.status === "generating" && (
                                <div className="h-3 w-3 animate-spin rounded-full border border-gray-400 border-t-transparent" />
                              )}
                              {openaiResult.status === "error" && (
                                <svg className="h-3.5 w-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                </svg>
                              )}
                              {activeModel === "openai" && openaiResult.status === "success" && (
                                <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                )}

                {/* Page selector — dropdown always available, click area extends to fill bar */}
                <div className="relative flex-1 flex items-center">
                  <button
                    onClick={() => setPageSelectorOpen((v) => !v)}
                    className="flex items-center w-full h-full px-2 py-0.5 rounded-md text-sm text-gray-600 font-medium hover:text-gray-900 transition-colors cursor-pointer"
                  >
                    {currentPage || "/"}
                  </button>
                  {pageSelectorOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setPageSelectorOpen(false)} />
                      <div className="absolute left-0 right-0 top-full mt-1 z-30 min-w-[140px] rounded-lg border border-gray-200 bg-white shadow-lg py-1">
                        {pageRoutes.map((route) => (
                          <button
                            key={route.path}
                            onClick={() => {
                              setCurrentPage(route.path);
                              setRefreshKey((k) => k + 1);
                              setPageSelectorOpen(false);
                            }}
                            className={`flex w-full items-center justify-between px-3 py-1.5 text-sm transition-colors ${
                              currentPage === route.path
                                ? "text-blue-600 bg-blue-50 font-medium"
                                : "text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            <span>{route.path || "/"}</span>
                            {currentPage === route.path && (
                              <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

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
                {publishedSlug && (
                  <a
                    href={`/s/${publishedSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 h-8 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    title={`Live at vibe-creator.com/s/${publishedSlug}`}
                  >
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    Live
                  </a>
                )}
                <button
                  disabled={isGenerating || isAborted}
                  onClick={() => {
                    setPublishError(null);
                    setPublishSuccess(false);
                    if (!publishedSlug && !publishSlug) {
                      const name = funnel?.name || "";
                      const slug = name
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, "")
                        .slice(0, 63);
                      setPublishSlug(slug);
                    }
                    setShowPublishDialog(true);
                  }}
                  title={isGenerating || isAborted ? "Creation in Progress" : undefined}
                  className={`inline-flex items-center rounded-lg bg-blue-600 px-5 h-8 text-sm font-semibold text-white shadow-sm transition-all ${isGenerating || isAborted ? "opacity-50 cursor-not-allowed" : "hover:bg-blue-700"}`}
                >
                  {publishedSlug ? "Republish" : "Publish"}
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

                {/* Calendar detection + selection — for initial generation (before chat messages) */}
                {hasCalendar && !calendarFromEdit && (
                  <div className="py-2">
                    <p className="text-[14.5px] font-sans text-gray-700 mb-3">
                      I detected a calendar/booking component in your project. Please select a calendar to connect:
                    </p>
                    {!selectedCalendarId ? (
                      calendarLoading ? (
                        <div className="flex items-center gap-2 py-2">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                          <span className="text-sm text-gray-500">Loading calendars...</span>
                        </div>
                      ) : calendarError ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                          <p className="text-sm text-red-600">{calendarError}</p>
                          <button
                            onClick={fetchCalendars}
                            className="mt-1 text-xs text-red-500 underline hover:text-red-700"
                          >
                            Retry
                          </button>
                        </div>
                      ) : calendarList.length === 0 ? (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                          <p className="text-sm text-gray-500">No calendars found in your GHL account.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {calendarList.map((cal) => (
                            <button
                              key={cal.id}
                              onClick={() => handleCalendarSelect(cal.id, cal.name)}
                              className="w-full text-left rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">{cal.name}</p>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                                      {cal.calendarType}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                      {cal.slotDuration} min slots
                                    </span>
                                  </div>
                                </div>
                                <svg className="h-5 w-5 text-gray-300 group-hover:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                </svg>
                              </div>
                            </button>
                          ))}
                        </div>
                      )
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                        <svg className="h-4 w-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-green-700">
                          Connected to calendar: <span className="font-medium">{selectedCalendarName}</span>
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Transient "fetching slots" indicator — for initial generation */}
                {hasCalendar && selectedCalendarId && slotsLoading && !calendarFromEdit && (
                  <div className="py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                      <p className="text-[14.5px] font-sans text-gray-500">Fetching available time slots...</p>
                    </div>
                  </div>
                )}

                {/* "Project created" message — shown only after calendar flow completes, or immediately if no calendar */}
                {(!hasCalendar || calendarFromEdit || (hasCalendar && selectedCalendarId && calendarSlots)) && (
                  <div className="py-1.5">
                    <p className="text-[14.5px] font-sans text-gray-700">
                      I&apos;ve created your project with {fileCount} files. You can ask me to make changes — edit components, add pages, change the theme, or modify functionality.
                    </p>
                  </div>
                )}

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
                    {msg.role === "calendar-connected" ? (
                      null /* Rendered inline in the calendar detection block above */
                    ) : msg.role === "user" ? (
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

                {/* Calendar detection + selection — for edit flow (after chat messages) */}
                {hasCalendar && calendarFromEdit && (
                  <div className="py-2">
                    <p className="text-[14.5px] font-sans text-gray-700 mb-3">
                      I detected a calendar/booking component in your project. Please select a calendar to connect:
                    </p>
                    {!selectedCalendarId ? (
                      calendarLoading ? (
                        <div className="flex items-center gap-2 py-2">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                          <span className="text-sm text-gray-500">Loading calendars...</span>
                        </div>
                      ) : calendarError ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                          <p className="text-sm text-red-600">{calendarError}</p>
                          <button
                            onClick={fetchCalendars}
                            className="mt-1 text-xs text-red-500 underline hover:text-red-700"
                          >
                            Retry
                          </button>
                        </div>
                      ) : calendarList.length === 0 ? (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                          <p className="text-sm text-gray-500">No calendars found in your GHL account.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {calendarList.map((cal) => (
                            <button
                              key={cal.id}
                              onClick={() => handleCalendarSelect(cal.id, cal.name)}
                              className="w-full text-left rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">{cal.name}</p>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                                      {cal.calendarType}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                      {cal.slotDuration} min slots
                                    </span>
                                  </div>
                                </div>
                                <svg className="h-5 w-5 text-gray-300 group-hover:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                </svg>
                              </div>
                            </button>
                          ))}
                        </div>
                      )
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                        <svg className="h-4 w-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-green-700">
                          Connected to calendar: <span className="font-medium">{selectedCalendarName}</span>
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Transient "fetching slots" indicator — for edit flow */}
                {hasCalendar && selectedCalendarId && slotsLoading && calendarFromEdit && (
                  <div className="py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                      <p className="text-[14.5px] font-sans text-gray-500">Fetching available time slots...</p>
                    </div>
                  </div>
                )}

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
            {chatPendingImages.length > 0 && !isGenerating && !isSending && (
              <div className="px-1 mb-2">
                <ImageUpload
                  images={chatPendingImages}
                  onRemove={(idx) => setChatPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                />
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (isGenerating) return;
                if (isSending) return;
                if (isAborted) {
                  if (chatInput.trim()) {
                    if (pendingPrompt) {
                      setPreGenMessages((prev) => [
                        ...prev,
                        { role: "user" as const, content: pendingPrompt, timestamp: pendingTimestamp || new Date().toISOString() },
                        { role: "assistant" as const, content: "This message was cancelled.", timestamp: new Date().toISOString() },
                      ]);
                    }
                    setPendingPrompt(chatInput.trim());
                    setPendingTimestamp(new Date().toISOString());
                    startGeneration(chatInput.trim(), DEFAULT_MODEL.id);
                    setChatInput("");
                  } else {
                    handleRetryGeneration();
                  }
                  return;
                }
                handleSendMessage();
              }}
              className="rounded-2xl bg-white border border-gray-200 transition-all focus-within:border-gray-300"
            >
              {/* Textarea area */}
              <div className="px-4 pt-3 pb-1">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Describe changes you want..."
                  disabled={isGenerating || isSending}
                  rows={1}
                  className="w-full resize-none bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ minHeight: "24px", maxHeight: "120px" }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "24px";
                    el.style.height = Math.min(el.scrollHeight, 120) + "px";
                  }}
                />
              </div>

              {/* Bottom toolbar */}
              <div className="flex items-center justify-between px-3 pb-2.5">
                <div className="flex items-center gap-1">
                  {/* Attach image */}
                  <button
                    type="button"
                    onClick={() => chatFileInputRef.current?.click()}
                    disabled={isGenerating || isSending}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-black/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Attach image"
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </button>
                </div>

                {/* Send / Stop button */}
                {isGenerating ? (
                  <button
                    type="button"
                    onClick={handleAbortGeneration}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-800 text-white transition-all hover:bg-black"
                    title="Stop generation"
                  >
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="4" y="4" width="16" height="16" rx="2" />
                    </svg>
                  </button>
                ) : isSending ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-800 text-white transition-all hover:bg-black"
                    title="Stop editing"
                  >
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="4" y="4" width="16" height="16" rx="2" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!chatInput.trim() && !isAborted}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-800 text-white transition-all hover:bg-black disabled:bg-gray-300 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                    </svg>
                  </button>
                )}
              </div>
            </form>
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

          {/* ── Calendar blocking overlay — waiting for calendar selection ── */}
          {isReady && projectFiles && viewMode === "preview" && (isCalendarBlocking || isCalendarSlotsLoading) && (
            <div className="relative w-full h-full rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden flex items-center justify-center">
              <div className="flex flex-col items-center gap-4 text-center px-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
                  <svg className="h-7 w-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                </div>
                {slotsLoading ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                      <p className="text-base font-medium text-gray-700">Fetching available time slots...</p>
                    </div>
                    <p className="text-sm text-gray-400">This will just take a moment</p>
                  </>
                ) : (
                  <>
                    <p className="text-base font-medium text-gray-700">Select a calendar</p>
                    <p className="text-sm text-gray-400">
                      Your project includes a booking component. Select a calendar from the chat panel to continue.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Ready state - Preview mode (Sandpack) ── */}
          {isReady && projectFiles && viewMode === "preview" && !isCalendarBlocking && !isCalendarSlotsLoading && (
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
                <ReactProjectPreview
                  files={projectFiles}
                  refreshKey={refreshKey}
                  startRoute={currentPage}
                  calendarData={calendarSlots && selectedCalendarId ? {
                    slots: calendarSlots,
                    slotDuration: selectedCalendarSlotDuration || 30,
                    calendarId: selectedCalendarId,
                  } : null}
                  funnelId={funnel?.id}
                  onRepair={handleAutoRepair}
                />
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

      {/* Publish dialog */}
      {showPublishDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPublishDialog(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <button
              onClick={() => setShowPublishDialog(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {publishedSlug ? "Republish Site" : "Publish Site"}
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              {publishedSlug
                ? "Update your live site with the latest changes."
                : "Choose a name for your public URL."}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Site URL</label>
                <div className="flex items-center rounded-lg border border-gray-300 bg-gray-50 overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                  <span className="pl-3 text-sm text-gray-400 whitespace-nowrap">vibe-creator.com/s/</span>
                  <input
                    type="text"
                    value={publishSlug}
                    onChange={(e) => {
                      const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                      setPublishSlug(val);
                      setPublishError(null);
                      setPublishSuccess(false);
                    }}
                    placeholder="my-awesome-site"
                    disabled={!!publishedSlug}
                    className="flex-1 bg-transparent px-3 py-2.5 text-sm text-gray-900 outline-none disabled:text-gray-500"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && publishSlug.trim()) handlePublish();
                    }}
                  />
                </div>
                {publishError && (
                  <p className="mt-1.5 text-sm text-red-600">{publishError}</p>
                )}
                {publishSuccess && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                    <svg className="h-4 w-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span className="text-sm text-green-700">
                      Published! Your site is live at{" "}
                      <a
                        href={`/s/${publishedSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium underline"
                      >
                        vibe-creator.com/s/{publishedSlug}
                      </a>
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowPublishDialog(false)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {publishSuccess ? "Close" : "Cancel"}
                </button>
                {!publishSuccess && (
                  <button
                    onClick={handlePublish}
                    disabled={isPublishing || !publishSlug.trim()}
                    className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isPublishing ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Publishing...
                      </span>
                    ) : publishedSlug ? (
                      "Update Site"
                    ) : (
                      "Publish"
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
