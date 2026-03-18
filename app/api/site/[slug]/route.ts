import { NextRequest, NextResponse } from "next/server";
import { getPublishedSite } from "@/lib/storage";

/**
 * Public endpoint — returns published site files for rendering.
 * No authentication required.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const site = await getPublishedSite(slug);

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  return NextResponse.json({
    slug: site.slug,
    siteName: site.site_name,
    files: site.files,
    publishedAt: site.published_at,
  });
}
