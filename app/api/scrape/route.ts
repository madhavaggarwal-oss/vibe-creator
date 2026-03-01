import { NextRequest, NextResponse } from "next/server";
import { scrapeUrl } from "@/lib/firecrawl";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Basic URL validation
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    const result = await scrapeUrl(parsedUrl.toString());

    return NextResponse.json({
      screenshot: result.screenshot,
      markdown: result.markdown,
      branding: result.branding,
      metadata: result.metadata,
      html: result.html,
      links: result.links,
      images: result.images,
    });
  } catch (error: unknown) {
    console.error("Scrape error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to scrape URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
