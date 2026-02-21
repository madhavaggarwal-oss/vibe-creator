"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";

const ReactProjectPreview = dynamic(
  () => import("@/components/react-preview"),
  { ssr: false, loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <p className="text-sm text-gray-500">Loading preview...</p>
      </div>
    </div>
  )}
);

export default function PreviewReactPage() {
  const params = useParams();
  const id = params.id as string;
  const [files, setFiles] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // GHL form submission handler — listens for form data from Sandpack iframe
  useEffect(() => {
    const handleGhlFormSubmit = async (e: MessageEvent) => {
      if (!e.data || e.data.type !== "ghl-form-submit") return;

      const { fields, customFieldKeys, customFieldLabels } = e.data;
      if (!fields || Object.keys(fields).length === 0) return;

      console.log("[GHL] Received form submission from preview iframe:", fields);
      if (customFieldKeys?.length) console.log("[GHL] Custom field keys:", customFieldKeys);
      if (customFieldLabels && Object.keys(customFieldLabels).length) console.log("[GHL] Custom field labels:", customFieldLabels);

      const iframe = document.querySelector('.sp-preview-iframe') as HTMLIFrameElement;

      try {
        const res = await fetch("/api/ghl/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields, customFieldKeys, customFieldLabels }),
        });

        let data: Record<string, unknown> = {};
        try { data = await res.json(); } catch { /* non-JSON response */ }
        console.log("[GHL] API response:", res.status, data);

        iframe?.contentWindow?.postMessage({
          type: "ghl-form-result",
          success: res.ok,
          message: res.ok
            ? "Form submitted successfully!"
            : (typeof data.error === "string" ? data.error : "Submission failed"),
        }, "*");
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
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/funnel/${id}`);
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        if (data.files) {
          setFiles(data.files);
        } else {
          setError("This project does not support React preview.");
        }
      } catch {
        setError("Failed to load project.");
      }
    }
    load();
  }, [id]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">{error}</p>
      </div>
    );
  }

  if (!files) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <ReactProjectPreview files={files} />
    </div>
  );
}
