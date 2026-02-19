import { NextRequest, NextResponse } from "next/server";
import { getFunnel, isReactProject } from "@/lib/storage";

interface ValidationError {
  file: string;
  line: number;
  message: string;
  severity: "error" | "warning";
}

function validateHTML(html: string, fileName: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const lines = html.split("\n");

  // Track open tags for matching
  const tagStack: { tag: string; line: number }[] = [];
  const selfClosingTags = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
  ]);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for unclosed strings in attributes
    const attrMatches = line.match(/=\s*"[^"]*$/);
    if (attrMatches && !line.includes("<!--")) {
      errors.push({
        file: fileName,
        line: lineNum,
        message: "Unclosed attribute value (missing closing quote)",
        severity: "error",
      });
    }

    // Check for opening/closing tags
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g;
    let match;
    while ((match = tagRegex.exec(line)) !== null) {
      const fullMatch = match[0];
      const tagName = match[1].toLowerCase();

      if (fullMatch.startsWith("</")) {
        // Closing tag
        if (tagStack.length === 0) {
          errors.push({
            file: fileName,
            line: lineNum,
            message: `Unexpected closing tag </${tagName}>`,
            severity: "error",
          });
        } else {
          const last = tagStack[tagStack.length - 1];
          if (last.tag === tagName) {
            tagStack.pop();
          } else {
            errors.push({
              file: fileName,
              line: lineNum,
              message: `Mismatched closing tag: expected </${last.tag}> (opened at line ${last.line}) but found </${tagName}>`,
              severity: "error",
            });
          }
        }
      } else if (!selfClosingTags.has(tagName) && !fullMatch.endsWith("/>")) {
        // Opening tag (non-self-closing)
        tagStack.push({ tag: tagName, line: lineNum });
      }
    }

    // Check for broken CSS syntax in style tags/attributes
    if (line.includes("style=") && !line.includes('style="') && !line.includes("style='") && !line.includes("style={")) {
      errors.push({
        file: fileName,
        line: lineNum,
        message: "Style attribute may be missing quotes",
        severity: "warning",
      });
    }
  }

  // Check for unclosed tags remaining
  const structuralTags = new Set(["div", "section", "main", "header", "footer", "nav", "article", "aside", "form", "table", "ul", "ol", "span", "p", "a", "button"]);
  for (const remaining of tagStack) {
    if (structuralTags.has(remaining.tag)) {
      errors.push({
        file: fileName,
        line: remaining.line,
        message: `Unclosed <${remaining.tag}> tag`,
        severity: "error",
      });
    }
  }

  // Check for missing DOCTYPE
  if (!html.trim().toLowerCase().startsWith("<!doctype")) {
    errors.push({
      file: fileName,
      line: 1,
      message: "Missing <!DOCTYPE html> declaration",
      severity: "warning",
    });
  }

  return errors;
}

/**
 * Validate React project files for common issues.
 */
function validateReactFiles(files: Record<string, string>): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check essential files exist
  const essentialFiles = ["/src/App.tsx", "/src/main.tsx", "/package.json"];
  for (const filePath of essentialFiles) {
    if (!files[filePath]) {
      errors.push({
        file: filePath,
        line: 1,
        message: `Missing essential file: ${filePath}`,
        severity: "error",
      });
    }
  }

  // Check for common issues in each file
  for (const [filePath, content] of Object.entries(files)) {
    if (typeof content !== "string") continue;

    // Check for unbalanced braces in TSX/TS files
    if (/\.(tsx?|jsx?)$/.test(filePath)) {
      let braceDepth = 0;
      let inString: string | null = null;
      let escaped = false;

      for (const ch of content) {
        if (escaped) { escaped = false; continue; }
        if (ch === "\\") { escaped = true; continue; }
        if (inString) { if (ch === inString) inString = null; continue; }
        if (ch === '"' || ch === "'" || ch === "`") { inString = ch; continue; }
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }

      if (braceDepth !== 0) {
        errors.push({
          file: filePath,
          line: 1,
          message: `Unbalanced braces (${braceDepth > 0 ? `${braceDepth} unclosed` : `${Math.abs(braceDepth)} extra closing`})`,
          severity: "warning",
        });
      }
    }

    // Check for forbidden CSS directives
    if (filePath.endsWith(".css")) {
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/@tailwind\s+(base|components|utilities)/.test(lines[i])) {
          errors.push({
            file: filePath,
            line: i + 1,
            message: "@tailwind directives break Sandpack preview",
            severity: "warning",
          });
        }
        if (/@import\s+['"]tailwindcss\//.test(lines[i])) {
          errors.push({
            file: filePath,
            line: i + 1,
            message: "@import tailwindcss directives break Sandpack preview",
            severity: "warning",
          });
        }
      }
    }
  }

  return errors;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const funnel = await getFunnel(id);

  if (!funnel) {
    return NextResponse.json({ error: "Funnel not found" }, { status: 404 });
  }

  const allErrors: ValidationError[] = [];

  if (isReactProject(funnel) && funnel.files) {
    // Validate React project files
    const reactErrors = validateReactFiles(funnel.files);
    allErrors.push(...reactErrors);
  } else {
    // Validate legacy HTML pages
    for (const page of funnel.pages) {
      const fileName = `pages/${page.slug}.html`;
      const pageErrors = validateHTML(page.html, fileName);
      allErrors.push(...pageErrors);
    }
  }

  const errorCount = allErrors.filter((e) => e.severity === "error").length;
  const warningCount = allErrors.filter((e) => e.severity === "warning").length;
  const totalFiles = isReactProject(funnel)
    ? Object.keys(funnel.files!).length
    : funnel.pages.length;

  return NextResponse.json({
    success: errorCount === 0,
    errors: allErrors,
    summary: {
      errorCount,
      warningCount,
      totalFiles,
    },
  });
}
