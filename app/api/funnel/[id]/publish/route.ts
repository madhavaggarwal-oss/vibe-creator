import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/supabase/server";
import { getFunnel, publishSite, getPublishedSlugForFunnel, extractProjectName } from "@/lib/storage";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { slug } = await request.json();

  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "Slug is required" }, { status: 400 });
  }

  const funnel = await getFunnel(id, userId);
  if (!funnel) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!funnel.files || Object.keys(funnel.files).length === 0) {
    return NextResponse.json({ error: "No files to publish" }, { status: 400 });
  }

  const siteName = funnel.name || extractProjectName(funnel.files) || "Untitled";

  try {
    const publishedSlug = await publishSite(slug, id, userId, siteName, funnel.files);
    return NextResponse.json({
      slug: publishedSlug,
      url: `https://vibe-creator.com/s/${publishedSlug}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to publish";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * GET — check if this funnel has a published slug
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const slug = await getPublishedSlugForFunnel(id);

  return NextResponse.json({ slug });
}
