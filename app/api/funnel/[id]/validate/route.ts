import { NextRequest, NextResponse } from "next/server";
import { getFunnel } from "@/lib/storage";

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
  for (const remaining of tagStack) {
    // Only report if it's a significant structural tag
    const structuralTags = new Set(["div", "section", "main", "header", "footer", "nav", "article", "aside", "form", "table", "ul", "ol", "span", "p", "a", "button"]);
    if (structuralTags.has(remaining.tag)) {
      errors.push({
        file: remaining.tag === "html" ? fileName : fileName,
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

  for (const page of funnel.pages) {
    const fileName = `pages/${page.slug}.html`;
    const pageErrors = validateHTML(page.html, fileName);
    allErrors.push(...pageErrors);
  }

  const errorCount = allErrors.filter((e) => e.severity === "error").length;
  const warningCount = allErrors.filter((e) => e.severity === "warning").length;

  return NextResponse.json({
    success: errorCount === 0,
    errors: allErrors,
    summary: {
      errorCount,
      warningCount,
      totalFiles: funnel.pages.length,
    },
  });
}
