"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import type { PendingImage } from "@/lib/image-utils";

interface ImageUploadProps {
  images: PendingImage[];
  onRemove?: (index: number) => void;
  readOnly?: boolean;
}

export default function ImageUpload({
  images,
  onRemove,
  readOnly = false,
}: ImageUploadProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxName, setLightboxName] = useState<string>("");

  const openLightbox = useCallback((url: string, name: string) => {
    setLightboxUrl(url);
    setLightboxName(name);
  }, []);

  const handleDownload = useCallback(() => {
    if (!lightboxUrl) return;
    const a = document.createElement("a");
    a.href = lightboxUrl;
    a.download = lightboxName || "image.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [lightboxUrl, lightboxName]);

  const handleCopy = useCallback(async () => {
    if (!lightboxUrl) return;
    try {
      const res = await fetch(lightboxUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
    } catch {
      // Fallback: copy data URL as text
      try {
        await navigator.clipboard.writeText(lightboxUrl);
      } catch {
        // silent fail
      }
    }
  }, [lightboxUrl]);

  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  if (images.length === 0) return null;

  const lightboxContent = lightboxUrl && portalTarget ? createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black/70 backdrop-blur-sm"
      onClick={() => setLightboxUrl(null)}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-6 py-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-white text-sm font-medium truncate max-w-[300px]">
            {lightboxName || "Image"}
          </p>
          <p className="text-white/50 text-xs">Image</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 transition-colors"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 transition-colors"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy
          </button>
          <button
            onClick={() => setLightboxUrl(null)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Image */}
      <div
        className="flex-1 flex items-center justify-center px-6 pb-6"
        onClick={() => setLightboxUrl(null)}
      >
        <div onClick={(e) => e.stopPropagation()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Preview"
            className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
          />
        </div>
      </div>
    </div>,
    portalTarget
  ) : null;

  return (
    <>
      <div className="flex items-center gap-2 overflow-x-auto py-1 px-1">
        {images.map((img, idx) => (
          <div
            key={idx}
            className="relative shrink-0 h-14 w-14 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 group cursor-pointer"
            onClick={() => !img.loading && openLightbox(img.dataUrl, img.name)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.dataUrl}
              alt={img.name}
              className={`h-full w-full object-cover ${img.loading ? "opacity-40" : ""}`}
            />
            {img.loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              </div>
            )}
            {!readOnly && !img.loading && onRemove && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(idx);
                }}
                className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
      {lightboxContent}
    </>
  );
}
