import { NextRequest, NextResponse } from "next/server";
import { getFunnel, saveFunnel, isReactProject } from "@/lib/storage";
import { astValidateAndRepair } from "@/lib/syntax-repair";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: { filePath?: string; errorMessage?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { filePath, errorMessage } = body;
  if (!filePath || !errorMessage) {
    return NextResponse.json(
      { error: "filePath and errorMessage are required" },
      { status: 400 }
    );
  }

  const funnel = await getFunnel(id);
  if (!funnel || !isReactProject(funnel) || !funnel.files) {
    return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
  }

  const originalCode = funnel.files[filePath];
  if (typeof originalCode !== "string") {
    return NextResponse.json(
      { error: `File not found: ${filePath}` },
      { status: 404 }
    );
  }

  console.log(
    `[repair] ${id} — attempting auto-repair of ${filePath}: ${errorMessage.slice(0, 120)}`
  );

  const fixed = await astValidateAndRepair(originalCode, filePath);

  // If AST repair didn't change anything, the error is unfixable by this path
  if (fixed === originalCode) {
    console.log(`[repair] ${id} — ${filePath}: no change after repair attempt`);
    return NextResponse.json({ fixed: false });
  }

  // Save repaired files
  const updatedFiles = { ...funnel.files, [filePath]: fixed };
  await saveFunnel({ ...funnel, files: updatedFiles });

  console.log(`[repair] ${id} — ${filePath}: auto-repair saved`);

  return NextResponse.json({ fixed: true, files: updatedFiles });
}
