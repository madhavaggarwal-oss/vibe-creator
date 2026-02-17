export interface ScrapeResult {
  screenshot: string;
  markdown: string;
  html: string;
  links: string[];
  images: string[];
  branding: {
    colors: string[];
    fonts: string[];
    typography: Record<string, unknown>;
    spacing: Record<string, unknown>;
    components: unknown[];
  } | null;
  metadata: {
    title: string;
    description: string;
  };
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY environment variable is not set");
  }

  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown", "screenshot@fullPage", "html", "links"],
      onlyMainContent: false,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Firecrawl API error (${res.status}): ${errBody}`);
  }

  const json = await res.json();

  if (!json.success) {
    throw new Error(`Firecrawl scrape failed: ${json.error || "Unknown error"}`);
  }

  const data = json.data || {};

  // Download screenshot and convert to base64 data URL
  let screenshotDataUrl = "";
  if (data.screenshot) {
    try {
      const imgRes = await fetch(data.screenshot);
      if (imgRes.ok) {
        const buffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const contentType = imgRes.headers.get("content-type") || "image/png";
        screenshotDataUrl = `data:${contentType};base64,${base64}`;
      }
    } catch {
      // If screenshot download fails, continue without it
      console.warn("Failed to download Firecrawl screenshot");
    }
  }

  return {
    screenshot: screenshotDataUrl,
    markdown: data.markdown || "",
    html: data.html || "",
    links: data.links || [],
    images: data.images || [],
    branding: data.branding || null,
    metadata: {
      title: data.metadata?.title || "",
      description: data.metadata?.description || "",
    },
  };
}
