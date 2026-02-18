import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const SNAPSHOTS_DIR = path.join(DATA_DIR, "snapshots");

interface FunnelSummary {
  id: string;
  name: string;
  prompt: string;
  model: string;
  pageCount: number;
  fileCount: number;
  isReactProject: boolean;
  firstPageTitle: string;
  createdAt: string;
  previewSlug: string;
  hasSnapshot: boolean;
}

export async function GET() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const files = await fs.readdir(DATA_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const funnels: FunnelSummary[] = [];

    for (const file of jsonFiles) {
      try {
        const data = await fs.readFile(path.join(DATA_DIR, file), "utf-8");
        const funnel = JSON.parse(data);
        const isReact = !!funnel.files && Object.keys(funnel.files).length > 0;
        let hasSnapshot = false;
        try {
          await fs.access(path.join(SNAPSHOTS_DIR, `${funnel.id}.html`));
          hasSnapshot = true;
        } catch {
          // no snapshot
        }
        funnels.push({
          id: funnel.id,
          name: funnel.name || funnel.pages?.[0]?.title || funnel.prompt?.slice(0, 60) || "Untitled",
          prompt: funnel.prompt,
          model: funnel.model,
          pageCount: funnel.pages?.length || 0,
          fileCount: isReact ? Object.keys(funnel.files).length : 0,
          isReactProject: isReact,
          firstPageTitle: funnel.pages?.[0]?.title || "Untitled",
          createdAt: funnel.createdAt,
          previewSlug: funnel.pages?.[0]?.slug || "home",
          hasSnapshot,
        });
      } catch {
        // skip malformed files
      }
    }

    funnels.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return Response.json(funnels);
  } catch {
    return Response.json([]);
  }
}
