import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 120;

export async function GET() {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? `set (${process.env.GEMINI_API_KEY.slice(0, 8)}...)` : "MISSING",
      BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN ? `set (${process.env.BLOB_READ_WRITE_TOKEN.slice(0, 8)}...)` : "MISSING",
    },
  };

  // Step 1: Test Gemini image generation
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not set");

    const ai = new GoogleGenAI({ apiKey });
    const t0 = Date.now();

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [{ role: "user", parts: [{ text: "Generate a simple test image: a red circle on white background. 200x200 pixels." }] }],
      config: { responseModalities: ["TEXT", "IMAGE"] },
    });

    const parts = response.candidates?.[0]?.content?.parts;
    const imagePart = parts?.find((p) => p.inlineData?.mimeType?.startsWith("image/"));

    results.gemini = {
      status: "OK",
      durationMs: Date.now() - t0,
      hasParts: !!parts,
      hasImageData: !!imagePart?.inlineData?.data,
      imageSizeKB: imagePart?.inlineData?.data
        ? Math.round(Buffer.from(imagePart.inlineData.data, "base64").length / 1024)
        : 0,
    };
  } catch (err) {
    results.gemini = { status: "FAILED", error: (err as Error).message };
  }

  // Step 2: Test Vercel Blob upload
  try {
    const t0 = Date.now();
    const testData = Buffer.from("test-image-data-" + Date.now());
    const blob = await put(`debug/test-${Date.now()}.txt`, testData, {
      access: "public",
      contentType: "text/plain",
    });

    results.blob = {
      status: "OK",
      durationMs: Date.now() - t0,
      url: blob.url,
    };
  } catch (err) {
    results.blob = { status: "FAILED", error: (err as Error).message };
  }

  // Step 3: Test full pipeline (generate + upload)
  if (results.gemini && (results.gemini as Record<string, unknown>).status === "OK" &&
      results.blob && (results.blob as Record<string, unknown>).status === "OK") {
    try {
      const apiKey = process.env.GEMINI_API_KEY!;
      const ai = new GoogleGenAI({ apiKey });
      const t0 = Date.now();

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{ role: "user", parts: [{ text: "Generate a test image: a blue square on white background. 200x200 pixels." }] }],
        config: { responseModalities: ["TEXT", "IMAGE"] },
      });

      const parts = response.candidates?.[0]?.content?.parts;
      const imagePart = parts?.find((p) => p.inlineData?.mimeType?.startsWith("image/"));

      if (!imagePart?.inlineData?.data) throw new Error("No image data");

      const buffer = Buffer.from(imagePart.inlineData.data, "base64");
      const blob = await put(`debug/test-image-${Date.now()}.jpg`, buffer, {
        access: "public",
        contentType: "image/jpeg",
      });

      results.fullPipeline = {
        status: "OK",
        durationMs: Date.now() - t0,
        imageSizeKB: Math.round(buffer.length / 1024),
        blobUrl: blob.url,
      };
    } catch (err) {
      results.fullPipeline = { status: "FAILED", error: (err as Error).message };
    }
  }

  return NextResponse.json(results, { status: 200 });
}
