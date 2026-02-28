import { NextRequest, NextResponse } from "next/server";
import { getFunnel, saveFunnel, isReactProject } from "@/lib/storage";
import { getCurrentUserId } from "@/lib/supabase/server";
import {
  astValidateAndRepair,
  tryParseTSX,
  trySandpackTranspile,
  llmFixFile,
} from "@/lib/syntax-repair";

/**
 * Build a rich error context string that helps the LLM understand the error
 * by including the error message, the offending line(s), and surrounding context.
 */
function buildErrorContext(
  code: string,
  errorMessage: string,
  line: number | null,
  column: number | null
): string {
  const parts: string[] = [];
  parts.push(`Error: ${errorMessage}`);

  if (line !== null) {
    const lines = code.split("\n");
    const lineIdx = line - 1; // 1-based → 0-based

    if (lineIdx >= 0 && lineIdx < lines.length) {
      parts.push(
        `\nAt line ${line}${column !== null ? `, column ${column}` : ""}:`
      );

      // Show 3 lines of context before and after
      const contextStart = Math.max(0, lineIdx - 3);
      const contextEnd = Math.min(lines.length - 1, lineIdx + 3);

      for (let i = contextStart; i <= contextEnd; i++) {
        const marker = i === lineIdx ? " >>> " : "     ";
        parts.push(`${marker}${i + 1}: ${lines[i]}`);
      }
    }
  }

  return parts.join("\n");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: {
    filePath?: string;
    errorMessage?: string;
    line?: number;
    column?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { filePath, errorMessage, line, column } = body;
  if (!filePath || !errorMessage) {
    return NextResponse.json(
      { error: "filePath and errorMessage are required" },
      { status: 400 }
    );
  }

  const funnel = await getFunnel(id, userId);
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

  // Build rich error context from the Sandpack error + code location
  const errorContext = buildErrorContext(
    originalCode,
    errorMessage,
    line ?? null,
    column ?? null
  );

  console.log(
    `[repair] ${id} — attempting repair of ${filePath}: ${errorMessage} (line: ${line ?? "?"}, col: ${column ?? "?"})`
  );

  // Step 1: Try AST + transpile repair with the external error context
  const fixed = await astValidateAndRepair(
    originalCode,
    filePath,
    2,
    errorContext
  );

  if (fixed !== originalCode) {
    // Repair changed the code — save and return
    const updatedFiles = { ...funnel.files, [filePath]: fixed };
    await saveFunnel({ ...funnel, files: updatedFiles }, userId);
    console.log(`[repair] ${id} — ${filePath}: auto-repair saved`);
    return NextResponse.json({ fixed: true, files: updatedFiles });
  }

  // Step 2: Our parsers see no error but Sandpack disagrees.
  // Use the Sandpack error context directly for an LLM fix.
  console.log(
    `[repair] ${id} — ${filePath}: our parsers see no error, trying LLM with Sandpack error context`
  );

  const llmFixed = await llmFixFile(originalCode, filePath, errorContext);

  if (llmFixed !== originalCode) {
    // Verify the LLM fix doesn't break anything else
    const verifyParse = tryParseTSX(llmFixed);
    const verifyTranspile =
      verifyParse === null ? trySandpackTranspile(llmFixed) : verifyParse;

    if (verifyTranspile === null) {
      const updatedFiles = { ...funnel.files, [filePath]: llmFixed };
      await saveFunnel({ ...funnel, files: updatedFiles }, userId);
      console.log(
        `[repair] ${id} — ${filePath}: LLM repair (Sandpack error context) saved`
      );
      return NextResponse.json({ fixed: true, files: updatedFiles });
    }

    console.log(
      `[repair] ${id} — ${filePath}: LLM fix introduced new errors: ${verifyTranspile.slice(0, 120)}`
    );
  }

  console.log(
    `[repair] ${id} — ${filePath}: no change after all repair attempts`
  );
  return NextResponse.json({ fixed: false });
}
