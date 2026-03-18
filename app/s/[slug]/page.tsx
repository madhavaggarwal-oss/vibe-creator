"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";

const ReactProjectPreview = dynamic(
  () => import("@/components/react-preview"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading site...</p>
        </div>
      </div>
    ),
  }
);

export default function PublishedSitePage() {
  const params = useParams();
  const slug = params.slug as string;
  const [files, setFiles] = useState<Record<string, string> | null>(null);
  const [siteName, setSiteName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/site/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          setError(res.status === 404 ? "Site not found" : "Failed to load site");
          return;
        }
        const data = await res.json();
        setFiles(data.files);
        setSiteName(data.siteName || slug);
      } catch {
        setError("Failed to load site");
      }
    }
    load();
  }, [slug]);

  // Update document title
  useEffect(() => {
    if (siteName) {
      document.title = siteName;
    }
  }, [siteName]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">404</h1>
          <p className="text-gray-500">{error}</p>
        </div>
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
