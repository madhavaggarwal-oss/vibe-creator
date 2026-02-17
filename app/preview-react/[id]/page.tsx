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
