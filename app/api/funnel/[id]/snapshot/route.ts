import { NextRequest, NextResponse } from "next/server";
import { isValidFunnelId } from "@/lib/storage";
import fs from "fs/promises";
import path from "path";

const SNAPSHOTS_DIR = path.join(process.cwd(), "data", "snapshots");

async function ensureSnapshotsDir() {
  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function placeholderHtml(name?: string): string {
  return `<!DOCTYPE html>
<html><head><style>
body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
font-family:system-ui,sans-serif;color:#fff;text-align:center}
h2{font-size:1.5rem;font-weight:600;opacity:0.9}
</style></head><body><h2>${name ? escapeHtml(name) : "Preview"}</h2></body></html>`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidFunnelId(id)) {
    return new NextResponse("Invalid ID", { status: 400 });
  }
  const filePath = path.join(SNAPSHOTS_DIR, `${id}.html`);

  try {
    const html = await fs.readFile(filePath, "utf-8");
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    // No snapshot yet — return placeholder
    return new NextResponse(placeholderHtml(), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidFunnelId(id)) {
    return NextResponse.json({ error: "Invalid funnel ID" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const html = body.html;
    if (typeof html !== "string" || !html.trim()) {
      return NextResponse.json({ error: "Missing html" }, { status: 400 });
    }

    await ensureSnapshotsDir();
    const filePath = path.join(SNAPSHOTS_DIR, `${id}.html`);
    await fs.writeFile(filePath, html, "utf-8");

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to save snapshot" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidFunnelId(id)) {
    return NextResponse.json({ error: "Invalid funnel ID" }, { status: 400 });
  }
  const filePath = path.join(SNAPSHOTS_DIR, `${id}.html`);

  try {
    await fs.unlink(filePath);
  } catch {
    // File didn't exist — that's fine
  }

  return NextResponse.json({ ok: true });
}
