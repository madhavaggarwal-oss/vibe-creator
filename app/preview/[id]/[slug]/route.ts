import { NextRequest, NextResponse } from "next/server";
import { getFunnel } from "@/lib/storage";

const CANVAS_SCRIPT = `<script>
document.addEventListener('click', function(e) {
  var el = e.target;
  while (el && el.tagName !== 'A') el = el.parentElement;
  if (el && el.tagName === 'A') {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);
document.addEventListener('submit', function(e) {
  e.preventDefault();
  e.stopPropagation();
}, true);
</script>`;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slug: string }> }
) {
  const { id, slug } = await params;
  const isCanvas = request.nextUrl.searchParams.get("canvas") === "true";

  const funnel = await getFunnel(id);
  if (!funnel) {
    return new NextResponse("Funnel not found", { status: 404 });
  }

  const page = funnel.pages.find((p) => p.slug === slug);
  if (!page) {
    return new NextResponse("Page not found", { status: 404 });
  }

  let html = page.html;

  if (isCanvas) {
    html = html.replace("</body>", `${CANVAS_SCRIPT}</body>`);
  }

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
