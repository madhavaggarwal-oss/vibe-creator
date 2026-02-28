import { NextRequest, NextResponse } from "next/server";
import { getFunnel, saveFunnel, deleteSnapshot } from "@/lib/storage";
import { generateImagesForFiles } from "@/lib/image-gen";
import { getCurrentUserId } from "@/lib/supabase/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const funnel = await getFunnel(id, userId);

  if (!funnel) {
    return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
  }

  if (!funnel.pendingImages || funnel.pendingImages.length === 0) {
    return NextResponse.json({ updatedCount: 0, failedCount: 0 });
  }

  if (!funnel.files) {
    return NextResponse.json({ error: "No files in funnel" }, { status: 400 });
  }

  try {
    const { files: updatedFiles, failedCount } = await generateImagesForFiles(
      funnel.files,
      funnel.pendingImages
    );

    // Keep only failed pending images (ones whose placeholders are still in the files)
    const remainingPending = failedCount > 0
      ? funnel.pendingImages.filter((entry) =>
          Object.values(updatedFiles).some(
            (content) => typeof content === "string" && content.includes(entry.placeholder)
          )
        )
      : [];

    // Save updated funnel
    await saveFunnel({
      ...funnel,
      files: updatedFiles,
      pendingImages: remainingPending,
    }, userId);

    // Invalidate cached snapshot so it gets re-captured
    await deleteSnapshot(id);

    const updatedCount = funnel.pendingImages.length - failedCount;
    return NextResponse.json({ updatedCount, failedCount });
  } catch (error: unknown) {
    console.error("[generate-images] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to generate images";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
