import { NextRequest, NextResponse } from "next/server";
import { getFunnel, isReactProject } from "@/lib/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const funnel = await getFunnel(id);

  if (!funnel) {
    return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
  }

  if (isReactProject(funnel)) {
    // React project: return files from the files map
    const files = Object.entries(funnel.files!).map(([path, content]) => ({
      name: path.split("/").pop() || path,
      path,
      content,
      size: Buffer.byteLength(content, "utf-8"),
    }));

    return NextResponse.json({ files });
  }

  // Legacy HTML funnels: return pages as before
  const files = funnel.pages.map((page) => ({
    name: `${page.slug}.html`,
    path: `pages/${page.slug}.html`,
    title: page.title,
    content: page.html,
    size: Buffer.byteLength(page.html, "utf-8"),
  }));

  return NextResponse.json({ files });
}
