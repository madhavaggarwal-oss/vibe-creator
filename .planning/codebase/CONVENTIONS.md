# Coding Conventions

**Analysis Date:** 2026-03-13

## Naming Patterns

**Files:**
- Components: PascalCase (e.g., `funnels-page.tsx`, `vibe-site-page.tsx`, `react-preview.tsx`)
- Utility/helper files: kebab-case (e.g., `image-gen.ts`, `stream-response.ts`, `syntax-repair.ts`, `pending-generation.ts`)
- Pages: PascalCase filename in Next.js app directory structure (e.g., `page.tsx`, `layout.tsx`, `route.ts`)
- API routes: Named via directory structure (e.g., `/app/api/chat/route.ts`, `/app/api/funnel/[id]/route.ts`)

**Functions:**
- Exported functions: camelCase (e.g., `generateFunnel`, `editFunnel`, `saveFunnel`, `isValidFunnelId`, `extractProjectName`)
- Private/internal functions: camelCase (e.g., `withRetry`, `imagesToParts`, `parseAIJson`, `compressImage`)
- React components: PascalCase with `default export` (e.g., `export default function VibeSitePage() {}`)
- Async functions: camelCase prefix with async modifier (e.g., `async function loadProjects() {}`, `export async function generateFunnel() {}`)

**Variables:**
- State variables: camelCase (e.g., `prompt`, `generating`, `projects`, `userMenuOpen`, `pendingImages`)
- Constants: UPPER_SNAKE_CASE for true constants (e.g., `RETRY_DELAYS`, `MAX_IMAGES`, `UUID_REGEX`)
- Interface/type instances: camelCase (e.g., `funnel`, `user`, `errorContext`)

**Types:**
- Interfaces: PascalCase with `I` prefix not used (e.g., `Funnel`, `ChatMessage`, `FunnelPage`, `GHLCalendar`)
- Type aliases: PascalCase (e.g., `ScrapeDataForGeneration`, `PendingImage`)
- Enums: Not observed in codebase; use union types instead
- Generics: Single letter or descriptive (e.g., `<T>`, `<R>`, used in `withRetry<T>()`, `mapWithConcurrency<T, R>()`)

## Code Style

**Formatting:**
- No explicit formatter configured (prettier not in package.json)
- TypeScript strict mode enabled (`strict: true` in `tsconfig.json`)
- Target: ES2017 (`target: "ES2017"`)
- JSX: React 19 with automatic transform enabled (`jsx: "react-jsx"`)

**Linting:**
- ESLint 9 with Next.js integration
- Config: `eslint.config.mjs` using flat config format
- Extends: `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
- Key ignored patterns: `.next/**`, `out/**`, `build/**`, `next-env.d.ts`

**Indentation/Spacing:**
- 2-space indentation (observed in source files)
- Blank lines between functions and sections
- Comments use `// ` prefix for single-line comments

## Import Organization

**Order:**
1. Built-in/external libraries (e.g., `import React from "react"`, `import { NextRequest } from "next/server"`)
2. Third-party packages (e.g., `import OpenAI from "openai"`, `import { GoogleGenerativeAI } from "@google/generative-ai"`)
3. Local/relative imports (e.g., `import { geminiEditFunnel } from "@/lib/gemini"`)
4. Type imports (e.g., `import type { ScrapeDataForGeneration } from "./gemini"`)

**Path Aliases:**
- Used: `@/*` maps to project root (configured in `tsconfig.json`)
- Pattern: `@/lib/...` for utilities, `@/app/...` for pages, `@/components/...` for components
- Relative imports used within same directory when appropriate (e.g., `import { processImageMarkers } from "./image-gen"`)

**Import Examples:**
```typescript
// Example from app/api/chat/route.ts
import { NextRequest } from "next/server";
import { editFunnel as geminiEditFunnel } from "@/lib/gemini";
import { getFunnel, saveFunnel, isReactProject, deleteSnapshot } from "@/lib/storage";
import { processImageMarkers } from "@/lib/image-gen";
import { createStreamingResponse } from "@/lib/stream-response";
import { getCurrentUserId } from "@/lib/supabase/server";
import { logGeneration } from "@/lib/generation-log";
```

## Error Handling

**Patterns:**
- Errors in async functions wrapped in try/catch blocks
- Functions throw `Error` or `new Error()` with descriptive messages
- Errors logged with context prefix (e.g., `console.error("[storage] Failed to save funnel:", error)`)
- API routes return `NextResponse.json({ error: "message" }, { status: 401 })` or similar
- No custom error classes observed; use built-in Error
- Empty catch blocks use `catch { /* ignore */ }` or `catch (err) { console.error(...) }`

**Example (from `lib/storage.ts`):**
```typescript
const { error } = await supabase.from("funnels").upsert(...);
if (error) {
  console.error("[storage] Failed to save funnel:", error);
  throw new Error(`Failed to save funnel: ${error.message}`);
}
```

**Example (from API route `app/api/chat/route.ts`):**
```typescript
if (!funnelId || typeof funnelId !== "string") {
  return Response.json({ error: "funnelId is required" }, { status: 400 });
}
```

## Logging

**Framework:** `console` (native)

**Patterns:**
- Context prefix in brackets: `[module-name]` or `[FunctionName]` (e.g., `[storage]`, `[Gemini]`, `[OpenAI]`, `[Chat API]`, `[admin/analytics]`)
- Log level used:
  - `console.log()`: Progress, state info, token counts, parse success
  - `console.warn()`: Retryable errors, quota exceeded, repair attempts, finish reason warnings
  - `console.error()`: Critical failures, unhandled errors, database errors

**Examples:**
```typescript
// Progress logging
console.log("[generateFunnel] Pipeline: gemini | Model: gemini-2.0-flash");
console.log("[generateFunnel] Tokens — input: 2000, output: 5000, total: 7000");

// Warning logging
console.warn("[pending-generation] sessionStorage write FAILED (quota exceeded)");
console.warn("[Gemini] Retryable error (attempt 1/3): Service Unavailable. Retrying in 3s...");

// Error logging
console.error("[storage] Failed to save funnel:", error);
console.error("[admin/analytics] Failed to fetch logs:", logsError);
```

## Comments

**When to Comment:**
- JSDoc/TSDoc for public functions and interfaces (extensive use observed)
- Inline comments for complex logic, non-obvious intent, or workarounds
- Section dividers using `// ---------------------------------------------------------------------------`
- Single-line TODO/FIXME comments (e.g., `// try index.html <title>`, `// ignore`)

**JSDoc/TSDoc:**
- Multi-line doc comments for all exported functions
- Format: `/** ... */` preceding function definition
- Include: Description, parameter descriptions, return type description
- Parameters documented with `@param` tags
- Return values documented with implicit type in `@returns` or inline

**Examples:**
```typescript
/**
 * Validate that an ID is a valid UUID to prevent injection attacks.
 * All funnel IDs are generated via uuidv4(), so this rejects any crafted input.
 */
export function isValidFunnelId(id: string): boolean { ... }

/**
 * Retrieve and clear the pending generation data.
 * Prefers the in-memory store (always available after client-side navigation),
 * falls back to sessionStorage (survives page refresh for small payloads).
 */
export function consumePendingGeneration(): PendingGeneration | null { ... }

/**
 * Fire-and-forget logging of generation/edit attempts to `generation_logs`.
 * Uses the admin client to bypass RLS. Never throws — errors are silently logged.
 */
export function logGeneration(params: LogGenerationParams): void { ... }
```

## Function Design

**Size:** Functions vary from ~5 lines (simple wrappers) to 200+ lines (complex generation pipelines)
- Utility functions: 10–30 lines
- API route handlers: 30–100+ lines
- Generation functions: 100–200+ lines (acceptable for complex pipeline steps)
- Complex functions broken into private helper functions within same file

**Parameters:**
- Named parameters using object destructuring for complex functions (e.g., `export function logGeneration(params: LogGenerationParams)`)
- Positional parameters for simple cases (e.g., `isValidFunnelId(id: string)`)
- Type annotations always present (TypeScript strict mode)
- Optional parameters use `?` (e.g., `images?: string[]`, `signal?: AbortSignal`)
- Generic types used for reusable patterns (e.g., `withRetry<T>()`, `createStreamingResponse<T>()`)

**Return Values:**
- Explicit return types on all exported functions
- Async functions return `Promise<T>`
- Null used for "not found" cases (e.g., `Promise<Funnel | null>`)
- Tuple returns for multiple values (e.g., `[files, metadata]`)
- Void for side-effect-only functions (e.g., `logGeneration()`, `saveSnapshot()`)

## Module Design

**Exports:**
- Default exports used for React components only (e.g., `export default function VibeSitePage() {}`)
- Named exports for utilities, types, functions (e.g., `export { saveFunnel, getFunnel, deleteFunnel }`)
- Type exports prefixed with `type` keyword: `export type { Funnel, ChatMessage }`
- Barrel files observed (`/lib/system-prompts.ts`, `/lib/generation-utils.ts` use re-exports)

**Example Barrel File Pattern:**
```typescript
// lib/system-prompts.ts
export { SYSTEM_PROMPT, CLONE_SYSTEM_PROMPT, IMAGE_CLONE_SYSTEM_PROMPT, EDIT_SYSTEM_PROMPT };

// Other files import:
import { SYSTEM_PROMPT } from "./system-prompts";
```

**Barrel Files:**
- Used selectively for grouping related constants or utility exports
- Location: `lib/system-prompts.ts`, `lib/generation-utils.ts`
- Not overused; most files have direct imports

## Component Conventions (React)

**Client Components:**
- Top-level directive: `"use client"` at top of file
- Hooks used: `useState`, `useEffect`, `useRef`, `useRouter`, `useCallback`
- Default export with component name matching filename (PascalCase)

**Example:**
```typescript
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function VibeSitePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  // ... rest of component
}
```

## API Route Conventions

**File Location:** `app/api/[endpoint]/route.ts`
**Handlers:** Named exports `GET`, `POST`, `PUT`, `DELETE`, etc.
**Max Duration:** Set at top of file for long-running routes (e.g., `export const maxDuration = 300;` for 5 minutes)
**Response Format:** `NextResponse.json()` or `Response.json()`
**Error Responses:**
```typescript
// Unauthorized
return Response.json({ error: "Unauthorized" }, { status: 401 });
// Not found
return Response.json({ error: "Funnel not found" }, { status: 404 });
// Bad request
return Response.json({ error: "funnelId is required" }, { status: 400 });
// Server error
return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
```

## TypeScript

**Strict Mode:** Enabled in `tsconfig.json`
- Null checks enforced
- Implicit any rejected
- Function parameter types required

**Type Safety Patterns:**
- Discriminated unions for variant types (e.g., `role: "user" | "assistant" | "calendar-connected"`)
- Interfaces for object shapes, no use of `any`
- Generic constraints used (e.g., `<T extends Record<string, string>>`)
- Type guards for runtime checks (e.g., `typeof x === "string"`)

## Code Quality Principles

**Consistency First:**
- Uniform patterns across similar functionality (e.g., all storage functions follow same query/error pattern)
- Consistent error logging with `[context]` prefix in all modules
- Consistent retry logic with `withRetry<T>()` utility reused across Gemini and OpenAI providers

**Production-Quality Standards:**
- No hardcoded values (magic numbers parameterized, e.g., `RETRY_DELAYS`, `MAX_IMAGES`)
- Input validation on all public API endpoints
- Error messages are descriptive and contextual
- Comments explain "why" not "what" (code is self-documenting)
- Proper TypeScript types eliminate entire classes of bugs

---

*Convention analysis: 2026-03-13*
