import { GoogleGenerativeAI } from "@google/generative-ai";
import { parse as babelParse } from "@babel/parser";
import * as babel from "@babel/core";
// @ts-expect-error — no type declarations for Babel presets
import presetTypescript from "@babel/preset-typescript";
// @ts-expect-error — no type declarations for Babel presets
import presetReact from "@babel/preset-react";

// ---------------------------------------------------------------------------
// Tier 1.5 — AST parse validation (catches errors invisible to bracket analysis)
// ---------------------------------------------------------------------------

/**
 * Attempt to parse code as TSX/JSX using @babel/parser.
 * Returns `null` if the code parses successfully, or an error message string
 * (including line/column) if parsing fails.
 *
 * This catches the same errors Sandpack's bundler would catch (malformed JSX,
 * invalid operators, missing tokens, etc.) — errors that the bracket-counting
 * analyzer in Tier 1 cannot detect.
 */
export function tryParseTSX(code: string): string | null {
  try {
    babelParse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      errorRecovery: false,
    });

    return null; // parses cleanly
  } catch (err: unknown) {
    if (err && typeof err === "object" && "message" in err) {
      return (err as Error).message;
    }
    return "Unknown parse error";
  }
}

/**
 * Attempt to transpile code the same way Sandpack's bundler does:
 * using @babel/core with @babel/preset-typescript and @babel/preset-react.
 *
 * This catches errors that a parse-only check misses — the transformation
 * step applies additional validation (type stripping, JSX transforms).
 * Returns `null` on success, or the error message on failure.
 */
export function trySandpackTranspile(code: string): string | null {
  try {
    // Static imports above ensure the bundler traces all Babel packages.
    // Passing preset references directly (not string names) avoids Babel's
    // internal require() resolution, which fails in Vercel's serverless env.
    babel.transformSync(code, {
      filename: "file.tsx",
      presets: [
        [presetTypescript, { isTSX: true, allExtensions: true }],
        [presetReact, { runtime: "automatic" }],
      ],
      sourceType: "module",
      code: false,
      ast: false,
    });

    return null;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "message" in err) {
      return (err as Error).message;
    }
    return "Unknown transpilation error";
  }
}

/**
 * Locally fix "Adjacent JSX elements must be wrapped in an enclosing tag" errors.
 * Uses the error's line number to find the offending return statement and wraps
 * its body in a React fragment (<>...</>).
 *
 * Returns the fixed code, or the original code if the fix didn't work.
 */
function repairAdjacentJSX(code: string, parseError: string): string {
  // Extract line number from error like "Adjacent JSX elements ... (68:12)"
  const lineMatch = parseError.match(/\((\d+):\d+\)\s*$/);
  if (!lineMatch) return code;

  const errorLine = parseInt(lineMatch[1], 10); // 1-based
  const lines = code.split("\n");
  if (errorLine < 1 || errorLine > lines.length) return code;

  // Scan backwards from the error line to find the `return` keyword or arrow `=> (`
  let returnLineIdx = -1;
  let isArrowImplicitReturn = false;
  for (let i = errorLine - 1; i >= 0; i--) {
    if (/\breturn\b/.test(lines[i])) {
      returnLineIdx = i;
      break;
    }
    // Arrow function implicit return: `=> (` or `=> <`
    if (/=>\s*\(/.test(lines[i])) {
      returnLineIdx = i;
      isArrowImplicitReturn = true;
      break;
    }
  }
  if (returnLineIdx === -1) return code;

  const returnLine = lines[returnLineIdx];

  // Case 1: return ( ... ) or => ( ... ) — insert <> after ( and </> before matching )
  const returnParenMatch = isArrowImplicitReturn
    ? returnLine.match(/^(.*=>\s*)\((.*)$/)
    : returnLine.match(/^(\s*return\s*)\((.*)$/);
  if (returnParenMatch) {
    // Find the matching closing paren by counting depth from returnLineIdx
    let depth = 0;
    let closeLineIdx = -1;
    let closeCharIdx = -1;

    for (let i = returnLineIdx; i < lines.length; i++) {
      const line = lines[i];
      const startCol = i === returnLineIdx ? returnLine.indexOf("(") : 0;
      for (let j = startCol; j < line.length; j++) {
        const ch = line[j];
        if (ch === "(") depth++;
        else if (ch === ")") {
          depth--;
          if (depth === 0) {
            closeLineIdx = i;
            closeCharIdx = j;
            break;
          }
        }
      }
      if (closeLineIdx !== -1) break;
    }

    if (closeLineIdx === -1) return code;

    // Insert </> before the closing )
    const closeLine = lines[closeLineIdx];
    lines[closeLineIdx] =
      closeLine.slice(0, closeCharIdx) + "</>" + closeLine.slice(closeCharIdx);

    // Insert <> after the opening (
    const afterParen = returnParenMatch[2].trim();
    if (afterParen.length === 0) {
      // return (\n  — insert <> on the next line's indentation
      if (returnLineIdx + 1 < lines.length) {
        const nextLine = lines[returnLineIdx + 1];
        const indent = nextLine.match(/^(\s*)/)?.[1] || "    ";
        lines.splice(returnLineIdx + 1, 0, indent + "<>");
        // Adjust closeLineIdx since we inserted a line
        // (closeLineIdx was already set, now it's shifted by 1)
      }
    } else {
      // return (<div>... — insert <> right after (
      lines[returnLineIdx] = returnParenMatch[1] + "(<>" + returnParenMatch[2];
    }

    const fixed = lines.join("\n");
    if (tryParseTSX(fixed) === null) {
      console.warn(`[syntax-repair] repairAdjacentJSX: fixed with fragment wrapper`);
      return fixed;
    }
    // If the simple approach failed, fall through
  }

  // Case 2: return <div>... (no parens) — wrap in return (<>...</>)
  const returnDirectMatch = returnLine.match(/^(\s*)return\s+(<.*)$/);
  if (returnDirectMatch) {
    const indent = returnDirectMatch[1];
    // Find the end: look for the line with the closing ; at the same or lower indent
    let endLineIdx = -1;
    for (let i = returnLineIdx; i < lines.length; i++) {
      if (lines[i].trimEnd().endsWith(";") || (i > returnLineIdx && /^\s*\)/.test(lines[i]))) {
        endLineIdx = i;
        break;
      }
    }
    if (endLineIdx === -1) endLineIdx = lines.length - 1;

    // Wrap: change `return <...` to `return (<><...` and append `</>);` after end
    lines[returnLineIdx] = indent + "return (<>" + returnDirectMatch[2];
    const endLine = lines[endLineIdx].replace(/;?\s*$/, "");
    lines[endLineIdx] = endLine + "</>);";

    const fixed = lines.join("\n");
    if (tryParseTSX(fixed) === null) {
      console.warn(`[syntax-repair] repairAdjacentJSX: fixed with fragment wrapper (direct return)`);
      return fixed;
    }
  }

  return code; // couldn't fix
}

/**
 * Detect the first error in code by running both parse and transpile checks.
 * Returns `null` if clean, or the error message string.
 */
function detectError(code: string): string | null {
  const parseError = tryParseTSX(code);
  if (parseError !== null) return parseError;
  return trySandpackTranspile(code);
}

/**
 * Run AST + transpile validation on a code string and, if it fails, use the
 * LLM to fix it. Allows up to `maxAttempts` LLM retries. Returns the best
 * version of the code.
 *
 * When `externalError` is provided (e.g. the Sandpack error message with
 * line/column context), it is used as the error description for the LLM if
 * our own parsers cannot reproduce the error.
 */
export async function astValidateAndRepair(
  code: string,
  filename: string,
  maxAttempts: number = 2,
  externalError?: string
): Promise<string> {
  let current = code;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const error = detectError(current);
    if (error === null) {
      if (attempt > 1) {
        console.warn(`[syntax-repair] ${filename} fixed on attempt ${attempt - 1}`);
      }
      return current;
    }

    console.warn(
      `[syntax-repair] ${filename} failed (attempt ${attempt}/${maxAttempts}): ${error}`
    );

    // Try fast local repairs before expensive LLM call
    if (error.includes("Adjacent JSX elements must be wrapped")) {
      const localFix = repairAdjacentJSX(current, error);
      if (localFix !== current) {
        current = localFix;
        continue; // re-check at top of loop
      }
    }

    const fixed = await llmFixFile(current, filename, error);

    // If the LLM returned the same code, no point retrying
    if (fixed === current) {
      console.warn(`[syntax-repair] ${filename} LLM returned identical code, stopping`);
      break;
    }

    current = fixed;
  }

  // Final check — if the last attempt still fails, log it
  const finalError = detectError(current);
  if (finalError !== null) {
    console.warn(
      `[syntax-repair] ${filename} still has errors after ${maxAttempts} attempt(s): ${finalError}`
    );

    // Last resort: if we have an external error and our parsers see the code as
    // fine (or can't fix it), try the LLM with the external error context
    if (externalError && current === code) {
      console.warn(`[syntax-repair] ${filename} trying LLM with external error context`);
      const fixed = await llmFixFile(current, filename, externalError);
      if (fixed !== current) {
        const verifyError = detectError(fixed);
        if (verifyError === null) {
          console.warn(`[syntax-repair] ${filename} fixed via external error context`);
          return fixed;
        }
        console.warn(`[syntax-repair] ${filename} LLM fix (external) introduced new errors: ${verifyError}`);
      }
    }
  } else {
    console.warn(`[syntax-repair] ${filename} fixed after LLM repair`);
  }

  return current;
}

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

    const prompt = `You are a syntax error fixer for React/TypeScript JSX code.

TASK: Fix ONLY the syntax error described below. Do NOT change any logic, variable names, styling, or functionality. Return ONLY the corrected complete file contents — no explanation, no markdown fences, no extra text.

RULES:
1. The code must be valid TypeScript JSX (.tsx) that can be transpiled by Babel with @babel/preset-typescript and @babel/preset-react.
2. Only fix the specific error — do not refactor or improve other parts of the code.
3. If the error mentions "Identifier directly after number", look for bare hex/numeric tokens that should be quoted strings.
4. If the error mentions "Unexpected token", look for missing brackets, mismatched delimiters, or invalid syntax near the indicated line.
5. All JSX must return a single root element (use fragments <></> if needed).
6. Ensure all imports are valid and all JSX tags are properly closed.

ERROR DETAILS:
${issues}

FILE (${filename}):
${code}`;

    const result = await model.generateContent(prompt);
    let fixed = result.response.text();

    // Strip markdown code fences if present
    fixed = fixed.trim();
    fixed = fixed.replace(/^```(?:tsx?|jsx?|typescript|javascript)?\s*\n?/, "");
    fixed = fixed.replace(/\n?```\s*$/, "");

    // Validate the LLM output: if it compiles cleanly, accept it regardless of size.
    // If it doesn't compile, only accept if it's better than the original (fewer errors).
    const llmError = detectError(fixed);
    if (llmError === null) {
      // LLM output compiles cleanly — accept it
      console.warn(`[llmFixFile] ${filename}: LLM fix compiles cleanly (${fixed.length} chars vs ${code.length} original)`);
      return fixed;
    }

    // LLM output doesn't compile either — check if the original also doesn't compile
    const origError = detectError(code);
    if (origError !== null) {
      // Both broken, but LLM might have fixed some issues.
      // Accept if the LLM output at least has valid bracket structure.
      const llmBracketIssues = analyzeSyntax(fixed);
      const origBracketIssues = analyzeSyntax(code);
      if (llmBracketIssues.length < origBracketIssues.length) {
        console.warn(`[llmFixFile] ${filename}: LLM fix has fewer bracket issues (${llmBracketIssues.length} vs ${origBracketIssues.length}), accepting`);
        return fixed;
      }
    }

    // LLM output is worse or no better — keep original
    console.warn(`[llmFixFile] ${filename}: LLM fix still has errors (${llmError}), keeping original`);
    return code;
  } catch (err) {
    console.warn(`[llmFixFile] ${filename}: LLM repair failed:`, err);
    return code;
  }
}

// ---------------------------------------------------------------------------
// Tier 0 — Fix bare hex-like tokens (e.g. MongoDB ObjectIds without quotes)
// ---------------------------------------------------------------------------

/**
 * Gemini sometimes emits bare hex identifiers like `691736397635bd8559f7f96f`
 * (e.g. in arrays or JSX attributes) instead of wrapping them in quotes.
 * JS cannot parse these — "Identifier directly after number".
 *
 * This uses a state machine to only replace tokens in code mode,
 * leaving strings, template literals, and comments untouched.
 */
function repairBareHexTokens(code: string): string {
  // Quick bail: check if any candidate pattern exists
  if (!/[0-9][0-9a-fA-F]{11,}/.test(code)) return code;

  // Regex for a bare hex-like token: starts with digit, contains at least one
  // letter (a-f), and is 12+ chars total — clearly not a valid JS number.
  const hexTokenRe = /\b([0-9][0-9a-fA-F]*[a-fA-F][0-9a-fA-F]*)\b/g;
  const isHexId = (m: string) => m.length >= 12 && /[a-fA-F]/.test(m);

  // Walk the code, tracking mode to isolate code-only regions
  let mode: Mode = "code";
  let escaped = false;
  let braceDepth = 0;
  const tplStack: number[] = [];

  // Collect [start, end) ranges that are in code mode
  const codeRanges: [number, number][] = [];
  let rangeStart = 0;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = i + 1 < code.length ? code[i + 1] : "";

    if (escaped) { escaped = false; continue; }

    const prev = mode;

    if (mode === "line-comment") {
      if (ch === "\n") mode = "code";
    } else if (mode === "block-comment") {
      if (ch === "*" && next === "/") { mode = "code"; i++; }
    } else if (mode === "string-single") {
      if (ch === "\\") escaped = true;
      else if (ch === "'" || ch === "\n") mode = "code";
    } else if (mode === "string-double") {
      if (ch === "\\") escaped = true;
      else if (ch === '"' || ch === "\n") mode = "code";
    } else if (mode === "template") {
      if (ch === "\\") escaped = true;
      else if (ch === "`") mode = "code";
      else if (ch === "$" && next === "{") {
        tplStack.push(braceDepth);
        braceDepth++;
        mode = "code";
        i++;
      }
    } else {
      // code mode
      if (ch === "/" && next === "/") { mode = "line-comment"; i++; }
      else if (ch === "/" && next === "*") { mode = "block-comment"; i++; }
      else if (ch === "'") mode = "string-single";
      else if (ch === '"') mode = "string-double";
      else if (ch === "`") mode = "template";
      else if (ch === "{") braceDepth++;
      else if (ch === "}") {
        if (tplStack.length > 0 && braceDepth - 1 === tplStack[tplStack.length - 1]) {
          tplStack.pop();
          braceDepth--;
          mode = "template";
        } else {
          braceDepth--;
        }
      }
    }

    // Track transitions between code and non-code
    if (prev === "code" && mode !== "code") {
      codeRanges.push([rangeStart, i]);
      rangeStart = i;
    } else if (prev !== "code" && mode === "code") {
      rangeStart = i;
    }
  }
  // Flush final segment
  if (mode === "code") {
    codeRanges.push([rangeStart, code.length]);
  }

  // Build a set of replacement spans [matchStart, matchEnd, replacement]
  const replacements: [number, number, string][] = [];
  for (const [start, end] of codeRanges) {
    const segment = code.slice(start, end);
    let m: RegExpExecArray | null;
    hexTokenRe.lastIndex = 0;
    while ((m = hexTokenRe.exec(segment)) !== null) {
      if (isHexId(m[1])) {
        replacements.push([start + m.index, start + m.index + m[0].length, `"${m[1]}"`]);
      }
    }
  }

  if (replacements.length === 0) return code;

  console.warn(`[syntax-repair] repairBareHexTokens: quoting ${replacements.length} bare hex token(s)`);

  // Apply replacements in reverse order so indices stay valid
  let result = code;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const [s, e, rep] = replacements[i];
    result = result.slice(0, s) + rep + result.slice(e);
  }
  return result;
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
    /** true when queued from Tier 1.5 (AST error only, no bracket issues) */
    astOnly?: boolean;
  }> = [];

  for (const [path, content] of Object.entries(files)) {
    // Only validate code files
    if (typeof content !== "string" || !/\.(tsx?|jsx?)$/.test(path)) {
      result[path] = content;
      continue;
    }

    // Tier 0: fix bare hex tokens before syntax analysis
    const preFixed = repairBareHexTokens(content);

    const issues = analyzeSyntax(preFixed);
    if (issues.length === 0) {
      // Tier 1.5: bracket analysis says clean — verify with AST parse + transpile
      const codeError = detectError(preFixed);
      if (codeError !== null) {
        console.warn(`[syntax-repair] ${path} has error despite clean bracket analysis: ${codeError}`);
        // Queue for AST-guided LLM repair
        llmTasks.push({ path, code: preFixed, issues: codeError, astOnly: true });
        result[path] = preFixed; // placeholder; will be overwritten by LLM result
      } else {
        result[path] = preFixed;
      }
      continue;
    }

    const issueDesc = issues.map((i) => `${i.kind}(${i.direction}:${i.count})`).join(", ");
    console.warn(`[syntax-repair] ${path}: detected ${issues.length} issue(s): ${issueDesc}`);

    // Check if there's an unterminated template/string — local bracket repair is
    // unreliable in this case because the bracket counts are thrown off by the
    // unterminated literal (everything after it is misinterpreted). Skip straight
    // to LLM repair which can understand the semantic intent.
    const hasUnterminatedLiteral = issues.some(
      (i) =>
        i.kind === "unterminated-template" ||
        i.kind === "unterminated-string-single" ||
        i.kind === "unterminated-string-double" ||
        i.kind === "unterminated-block-comment"
    );

    if (hasUnterminatedLiteral) {
      console.warn(`[syntax-repair] ${path}: unterminated literal detected, skipping local repair → LLM`);
      result[path] = preFixed;
      llmTasks.push({
        path,
        code: preFixed,
        issues: issueDesc,
        astOnly: true,
      });
      continue;
    }

    // Tier 1: local repair (only for bracket imbalances, not unterminated literals)
    const { code: repaired, remainingIssues } = attemptLocalRepair(preFixed);

    if (remainingIssues.length === 0) {
      console.warn(`[syntax-repair] ${path}: local repair fixed all bracket issues`);
      // Tier 1.5+1.75: verify with AST parse + transpile
      const codeError = detectError(repaired);
      if (codeError !== null) {
        console.warn(`[syntax-repair] ${path} still has error after local repair: ${codeError}`);
        // Send ORIGINAL code to LLM, not the locally-repaired version.
        // Local repair can corrupt code (e.g. appending }}} to balance brackets
        // when the real issue is an unterminated template literal).
        llmTasks.push({ path, code: preFixed, issues: codeError, astOnly: true });
        result[path] = preFixed;
      } else {
        result[path] = repaired;
      }
      continue;
    }

    console.warn(
      `[syntax-repair] ${path}: ${remainingIssues.length} issue(s) remain after local repair: ${remainingIssues.map((i) => `${i.kind}(${i.direction}:${i.count})`).join(", ")}`
    );

    // Queue for Tier 2 LLM repair — send ORIGINAL code, not the locally-repaired
    // version which may have been corrupted by naive bracket-closing.
    result[path] = preFixed;
    llmTasks.push({
      path,
      code: preFixed,
      issues: remainingIssues
        .map((i) => `${i.kind}: ${i.count} ${i.direction}`)
        .join("\n"),
    });
  }

  // Tier 2 / Tier 1.5: run LLM repairs in parallel
  if (llmTasks.length > 0) {
    console.warn(`[syntax-repair] Running LLM repair on ${llmTasks.length} file(s)...`);
    const llmResults = await Promise.all(
      llmTasks.map(async ({ path, code, issues, astOnly }) => {
        if (astOnly) {
          // Tier 1.5 path: AST-guided LLM repair with retry loop
          const fixed = await astValidateAndRepair(code, path);
          return { path, code: fixed };
        }

        // Tier 2 path: bracket-based LLM repair, then AST validation
        const fixed = await llmFixFile(code, path, issues);
        // Verify the LLM fix resolved bracket issues
        const postFixIssues = analyzeSyntax(fixed);
        if (postFixIssues.length < analyzeSyntax(code).length) {
          console.warn(`[syntax-repair] ${path}: LLM repair improved file (${postFixIssues.length} bracket issues remaining)`);
          // Also run AST validation on the LLM-fixed code
          const astFixed = await astValidateAndRepair(fixed, path);
          return { path, code: astFixed };
        }
        console.warn(`[syntax-repair] ${path}: LLM repair did not improve brackets, trying AST repair on local version`);
        // Even if bracket repair didn't help, try AST validation
        const astFixed = await astValidateAndRepair(code, path);
        return { path, code: astFixed };
      })
    );

    for (const { path, code } of llmResults) {
      result[path] = code;
    }
  }

  // Final safety gate: log which files still have errors after all repair attempts.
  // This gives clear visibility into what the user will see.
  const stillBroken: string[] = [];
  for (const [path, content] of Object.entries(result)) {
    if (typeof content !== "string" || !/\.(tsx?|jsx?)$/.test(path)) continue;
    const error = detectError(content);
    if (error !== null) {
      stillBroken.push(`  ${path}: ${error}`);
    }
  }
  if (stillBroken.length > 0) {
    console.error(
      `[syntax-repair] WARNING: ${stillBroken.length} file(s) still have errors after all repair attempts:\n${stillBroken.join("\n")}`
    );
  } else {
    console.log(`[syntax-repair] All ${Object.keys(result).length} files validated successfully`);
  }

  return result;
}
