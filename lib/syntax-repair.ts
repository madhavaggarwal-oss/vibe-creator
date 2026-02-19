import { GoogleGenerativeAI } from "@google/generative-ai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IssueKind =
  | "unterminated-template"
  | "unterminated-string-single"
  | "unterminated-string-double"
  | "unterminated-block-comment"
  | "unbalanced-braces"
  | "unbalanced-parens"
  | "unbalanced-brackets";

export interface SyntaxIssue {
  kind: IssueKind;
  /** "unclosed" = missing closer, "extra" = too many closers */
  direction: "unclosed" | "extra";
  /** How many are missing / extra */
  count: number;
}

// ---------------------------------------------------------------------------
// Tier 1 — Fast local analysis & repair (sync, no API calls)
// ---------------------------------------------------------------------------

type Mode =
  | "code"
  | "string-single"
  | "string-double"
  | "template"
  | "line-comment"
  | "block-comment";

/**
 * State-machine syntax analyser.
 * Tracks strings, template literals (with nested `${}`), comments,
 * and bracket depths to detect structural issues.
 */
export function analyzeSyntax(code: string): SyntaxIssue[] {
  let mode: Mode = "code";
  let escaped = false;

  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;

  // Stack for nested template literal expressions.
  // Each entry is the braceDepth at the point we entered a `${…}` expression.
  const templateStack: number[] = [];

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = i + 1 < code.length ? code[i + 1] : "";

    // ── escaped character ──────────────────────────────────────────────
    if (escaped) {
      escaped = false;
      continue;
    }

    // ── line comment ───────────────────────────────────────────────────
    if (mode === "line-comment") {
      if (ch === "\n") mode = "code";
      continue;
    }

    // ── block comment ──────────────────────────────────────────────────
    if (mode === "block-comment") {
      if (ch === "*" && next === "/") {
        mode = "code";
        i++; // skip /
      }
      continue;
    }

    // ── single-quoted string ───────────────────────────────────────────
    if (mode === "string-single") {
      if (ch === "\\") { escaped = true; continue; }
      if (ch === "'") mode = "code";
      // Newline inside single-quoted string means it was never closed
      if (ch === "\n") mode = "code";
      continue;
    }

    // ── double-quoted string ───────────────────────────────────────────
    if (mode === "string-double") {
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') mode = "code";
      if (ch === "\n") mode = "code";
      continue;
    }

    // ── template literal ───────────────────────────────────────────────
    if (mode === "template") {
      if (ch === "\\") { escaped = true; continue; }
      if (ch === "`") {
        mode = "code";
        continue;
      }
      if (ch === "$" && next === "{") {
        // Enter template expression — push current braceDepth
        templateStack.push(braceDepth);
        braceDepth++;
        mode = "code";
        i++; // skip {
        continue;
      }
      continue;
    }

    // ── code mode ──────────────────────────────────────────────────────
    if (ch === "\\") { escaped = true; continue; }

    // Comments
    if (ch === "/" && next === "/") { mode = "line-comment"; i++; continue; }
    if (ch === "/" && next === "*") { mode = "block-comment"; i++; continue; }

    // Strings
    if (ch === "'") { mode = "string-single"; continue; }
    if (ch === '"') { mode = "string-double"; continue; }
    if (ch === "`") { mode = "template"; continue; }

    // Brackets
    if (ch === "{") {
      braceDepth++;
      continue;
    }
    if (ch === "}") {
      // Check if we're closing a template expression
      if (templateStack.length > 0 && braceDepth - 1 === templateStack[templateStack.length - 1]) {
        templateStack.pop();
        braceDepth--;
        mode = "template";
        continue;
      }
      braceDepth--;
      continue;
    }
    if (ch === "(") { parenDepth++; continue; }
    if (ch === ")") { parenDepth--; continue; }
    if (ch === "[") { bracketDepth++; continue; }
    if (ch === "]") { bracketDepth--; continue; }
  }

  // ── Collect issues ───────────────────────────────────────────────────
  const issues: SyntaxIssue[] = [];

  // Unterminated strings / templates / comments
  if (mode === "template" || templateStack.length > 0) {
    issues.push({ kind: "unterminated-template", direction: "unclosed", count: 1 + templateStack.length });
  }
  if (mode === "string-single") {
    issues.push({ kind: "unterminated-string-single", direction: "unclosed", count: 1 });
  }
  if (mode === "string-double") {
    issues.push({ kind: "unterminated-string-double", direction: "unclosed", count: 1 });
  }
  if (mode === "block-comment") {
    issues.push({ kind: "unterminated-block-comment", direction: "unclosed", count: 1 });
  }

  // Bracket imbalances
  if (braceDepth > 0) {
    issues.push({ kind: "unbalanced-braces", direction: "unclosed", count: braceDepth });
  } else if (braceDepth < 0) {
    issues.push({ kind: "unbalanced-braces", direction: "extra", count: -braceDepth });
  }

  if (parenDepth > 0) {
    issues.push({ kind: "unbalanced-parens", direction: "unclosed", count: parenDepth });
  } else if (parenDepth < 0) {
    issues.push({ kind: "unbalanced-parens", direction: "extra", count: -parenDepth });
  }

  if (bracketDepth > 0) {
    issues.push({ kind: "unbalanced-brackets", direction: "unclosed", count: bracketDepth });
  } else if (bracketDepth < 0) {
    issues.push({ kind: "unbalanced-brackets", direction: "extra", count: -bracketDepth });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// attemptLocalRepair
// ---------------------------------------------------------------------------

/**
 * Try to fix syntax issues locally without an LLM call.
 *
 * Phase 1: Close unterminated strings / templates / block comments.
 * Phase 2: Re-analyse, then fix bracket imbalances (append closers or
 *          remove trailing extras).
 */
export function attemptLocalRepair(code: string): {
  code: string;
  remainingIssues: SyntaxIssue[];
} {
  let fixed = code;

  // ── Phase 1: close unterminated strings / templates / comments ───────
  const phase1 = analyzeSyntax(fixed);
  for (const issue of phase1) {
    if (issue.kind === "unterminated-string-single") {
      fixed = fixed + "'";
    } else if (issue.kind === "unterminated-string-double") {
      fixed = fixed + '"';
    } else if (issue.kind === "unterminated-template") {
      // Close template expressions first, then close the template literal
      // For nested ${}, we need to close inner expressions before the backtick
      for (let n = 0; n < issue.count - 1; n++) {
        fixed = fixed + "}";
      }
      fixed = fixed + "`";
    } else if (issue.kind === "unterminated-block-comment") {
      fixed = fixed + " */";
    }
  }

  // ── Phase 2: fix bracket imbalances ──────────────────────────────────
  const phase2 = analyzeSyntax(fixed);
  for (const issue of phase2) {
    if (issue.direction === "unclosed") {
      const closer =
        issue.kind === "unbalanced-braces"
          ? "}"
          : issue.kind === "unbalanced-parens"
            ? ")"
            : issue.kind === "unbalanced-brackets"
              ? "]"
              : null;
      if (closer) {
        fixed = fixed + "\n" + closer.repeat(issue.count) + "\n";
      }
    } else if (issue.direction === "extra") {
      // Remove trailing extra closers
      const closerChar =
        issue.kind === "unbalanced-braces"
          ? "}"
          : issue.kind === "unbalanced-parens"
            ? ")"
            : issue.kind === "unbalanced-brackets"
              ? "]"
              : null;
      if (closerChar) {
        let toRemove = issue.count;
        // Walk backwards and remove trailing extra closers
        const chars = fixed.split("");
        for (let j = chars.length - 1; j >= 0 && toRemove > 0; j--) {
          if (chars[j] === closerChar) {
            chars.splice(j, 1);
            toRemove--;
          }
        }
        fixed = chars.join("");
      }
    }
  }

  // ── Phase 3: strip stray trailing characters (from repairBraces) ─────
  const trimmed = fixed.trimEnd();
  const lastChar = trimmed[trimmed.length - 1];
  if (lastChar === "'" || lastChar === '"' || lastChar === ",") {
    const lastNewline = trimmed.lastIndexOf("\n");
    const lastLine = trimmed.slice(lastNewline + 1).trim();
    if (lastLine.length === 1) {
      fixed = trimmed.slice(0, -1) + "\n";
    }
  }

  // ── Final analysis ───────────────────────────────────────────────────
  const remaining = analyzeSyntax(fixed);
  return { code: fixed, remainingIssues: remaining };
}

// ---------------------------------------------------------------------------
// Tier 2 — LLM fallback (async, only when Tier 1 fails)
// ---------------------------------------------------------------------------

/**
 * Send a broken file to gemini-2.0-flash for an intelligent fix.
 * Only called when local repair still has remaining issues.
 * No-ops if GEMINI_API_KEY is missing.
 */
export async function llmFixFile(
  code: string,
  filename: string,
  issues: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return code;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 65536,
      },
    });

    const prompt = `Fix ONLY the syntax errors in this ${filename} file. Do NOT change any logic, variable names, or functionality. Return ONLY the corrected file contents — no explanation, no markdown fences, no extra text.

Detected issues:
${issues}

File contents:
${code}`;

    const result = await model.generateContent(prompt);
    let fixed = result.response.text();

    // Strip markdown code fences if present
    fixed = fixed.trim();
    fixed = fixed.replace(/^```(?:tsx?|jsx?|typescript|javascript)?\s*\n?/, "");
    fixed = fixed.replace(/\n?```\s*$/, "");

    // Sanity check: the fix should be roughly the same size (not a partial rewrite)
    if (fixed.length < code.length * 0.5 || fixed.length > code.length * 2) {
      console.warn(`[llmFixFile] ${filename}: LLM response size suspicious (${fixed.length} vs ${code.length}), keeping original`);
      return code;
    }

    return fixed;
  } catch (err) {
    console.warn(`[llmFixFile] ${filename}: LLM repair failed:`, err);
    return code;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Validate and repair all code files in a files record.
 * Non-code files (CSS, JSON, HTML, etc.) are passed through unchanged.
 *
 * For each .ts/.tsx/.js/.jsx file:
 *   1. Analyse syntax
 *   2. If issues found → attempt local repair
 *   3. If local repair has remaining issues → call LLM fallback
 */
export async function validateAndRepairFiles(
  files: Record<string, string>
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const llmTasks: Array<{
    path: string;
    code: string;
    issues: string;
  }> = [];

  for (const [path, content] of Object.entries(files)) {
    // Only validate code files
    if (typeof content !== "string" || !/\.(tsx?|jsx?)$/.test(path)) {
      result[path] = content;
      continue;
    }

    const issues = analyzeSyntax(content);
    if (issues.length === 0) {
      result[path] = content;
      continue;
    }

    console.warn(
      `[syntax-repair] ${path}: detected ${issues.length} issue(s): ${issues.map((i) => `${i.kind}(${i.direction}:${i.count})`).join(", ")}`
    );

    // Tier 1: local repair
    const { code: repaired, remainingIssues } = attemptLocalRepair(content);

    if (remainingIssues.length === 0) {
      console.warn(`[syntax-repair] ${path}: local repair fixed all issues`);
      result[path] = repaired;
      continue;
    }

    console.warn(
      `[syntax-repair] ${path}: ${remainingIssues.length} issue(s) remain after local repair: ${remainingIssues.map((i) => `${i.kind}(${i.direction}:${i.count})`).join(", ")}`
    );

    // Queue for Tier 2 LLM repair
    result[path] = repaired; // use local repair as starting point
    llmTasks.push({
      path,
      code: repaired,
      issues: remainingIssues
        .map((i) => `${i.kind}: ${i.count} ${i.direction}`)
        .join("\n"),
    });
  }

  // Tier 2: run LLM repairs in parallel
  if (llmTasks.length > 0) {
    console.warn(`[syntax-repair] Running LLM repair on ${llmTasks.length} file(s)...`);
    const llmResults = await Promise.all(
      llmTasks.map(async ({ path, code, issues }) => {
        const fixed = await llmFixFile(code, path, issues);
        // Verify the LLM fix actually resolved the issues
        const postFixIssues = analyzeSyntax(fixed);
        if (postFixIssues.length < analyzeSyntax(code).length) {
          console.warn(`[syntax-repair] ${path}: LLM repair improved file (${postFixIssues.length} issues remaining)`);
          return { path, code: fixed };
        }
        console.warn(`[syntax-repair] ${path}: LLM repair did not improve, keeping local repair`);
        return { path, code };
      })
    );

    for (const { path, code } of llmResults) {
      result[path] = code;
    }
  }

  return result;
}
