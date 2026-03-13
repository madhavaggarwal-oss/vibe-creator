# Testing Patterns

**Analysis Date:** 2026-03-13

## Test Framework

**Status:** No automated testing framework configured or detected.

**Runner:**
- Not detected: No Jest, Vitest, Playwright, or Cypress configuration files found
- No test files (*.test.ts, *.test.tsx, *.spec.ts, *.spec.tsx) present in codebase
- No testing dependencies in package.json

**Build Verification:**
- Linting: `npm run lint` (ESLint with Next.js rules)
- Type checking: `npx tsc` (TypeScript strict mode via tsconfig.json)
- Build: `npm run build` (Next.js production build)

**Development Approach:**
- Manual testing via `npm run dev` and browser
- Type safety provided by TypeScript strict mode
- Linting enforced via ESLint

## Test File Organization

**Location:**
- Not applicable — no automated tests exist

**Naming Convention:**
- Not applicable — no test files

**Structure:**
- Not applicable — no test framework configured

## Manual Testing Patterns Observed

Since automated tests are not present, the codebase relies on:

**Integration Testing via API Routes:**
- API routes in `app/api/*` are tested by making actual HTTP requests
- Example: Chat API (`app/api/chat/route.ts`) processes real data from database, calls AI models, returns streaming response
- Streaming response handling tested via `readStreamResponse()` client utility in real usage

**Type Safety Testing:**
- TypeScript strict mode enforces type correctness at compile time
- No null/undefined values pass through without explicit handling
- Generic types catch API contract violations (e.g., `readStreamResponse<T>()` ensures correct return type)

**Error Handling Validation:**
- Functions validate input before processing (e.g., `isValidFunnelId()` checks UUID format)
- API routes check authorization and return specific error codes
- Streaming responses catch errors and send error events without crashing

**Example — Input Validation in `lib/storage.ts`:**
```typescript
export async function getFunnel(id: string, userId: string): Promise<Funnel | null> {
  if (!isValidFunnelId(id)) {
    return null;  // Type-safe null return
  }
  // ... rest of function
}

// Usage validates result:
const funnel = await getFunnel(funnelId, userId);
if (!funnel) {
  return Response.json({ error: "Funnel not found" }, { status: 404 });
}
```

## Mocking

**Framework:**
- Not applicable — no test framework present

**What Would Be Mocked (if tests existed):**

**API/External Services:**
- Supabase client (`@supabase/supabase-js`)
  - Would mock: `.from("funnels").select()`, `.from("snapshots").upsert()`, etc.
  - Currently: Called directly in `lib/storage.ts` server functions
- Google Generative AI (`@google/generative-ai`)
  - Would mock: Model.generateContent() calls
  - Currently: Called directly in `lib/gemini.ts` with retry logic
- OpenAI API (`openai` package)
  - Would mock: Chat completions and Responses API calls
  - Currently: Called directly in `lib/openai.ts` with retry logic

**Fixtures/Test Data:**
- Not implemented in codebase
- Would need: Sample funnel data, chat history, file contents for generation tests

## Retry and Error Handling Testing

**Retry Logic Pattern (Production):**
```typescript
// lib/gemini.ts and lib/openai.ts
async function withRetry<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRetryable = error instanceof Error &&
        (error.message.includes("503") ||
         error.message.includes("overloaded"));

      if (!isRetryable || attempt >= RETRY_DELAYS.length || signal?.aborted) {
        throw error;
      }

      console.warn(`[Gemini] Retryable error (attempt ${attempt + 1}/${RETRY_DELAYS.length}): ...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }
}
```

**Abort Signal Handling:**
```typescript
// app/api/chat/route.ts
if (request.signal.aborted) {
  logGeneration({ ... errorMessage: "Aborted by user" ... });
  send({ type: "error", message: "Edit cancelled" });
  return;
}
```

**Testing This (Manual):**
- Streaming API calls can be cancelled via AbortController
- User-initiated cancellations logged via `logGeneration()`
- Error events sent to client before closing stream

## Streaming Response Testing

**Streaming Pattern (Production):**
```typescript
// lib/stream-response.ts
export function createStreamingResponse(
  executor: (send: (event: StreamEvent) => void) => Promise<void>,
  signal?: AbortSignal
): Response {
  // Heartbeats sent every 15 seconds
  const heartbeatInterval = setInterval(() => {
    send({ type: "heartbeat" });
  }, 15000);

  // Events sent as NDJSON lines
  const send = (event: StreamEvent) => {
    controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
  };
}

// Client-side reading:
export async function readStreamResponse<T = unknown>(
  response: Response,
  onProgress?: (message: string, data?: unknown) => void
): Promise<T> {
  // Processes NDJSON events
  const lines = buffer.split("\n");
  for (const line of lines) {
    const event = JSON.parse(line);
    switch (event.type) {
      case "progress": onProgress?.(event.message); break;
      case "result": result = event.data; break;
      case "error": throw new Error(event.message); break;
      case "heartbeat": break;
    }
  }
}
```

**Testing This (Manual):**
- Long-running generation API calls (`/api/chat`, `/api/generate`)
- Client-side consumption via `readStreamResponse()` in React components
- Progress updates displayed in UI during generation
- Heartbeats prevent Vercel serverless timeout (connection kept alive for 5+ minutes)

## Database Testing Pattern

**Database Operations (Production):**
```typescript
// lib/storage.ts — all database calls follow this pattern:
const { data, error } = await supabase.from("funnels").select(...);

if (error || !data) {
  console.error("[storage] Error reading funnel:", error);
  return null;  // Safe fallback
}

// Type assertion after validation
const funnel = data.chat_history as Funnel;
return funnel;
```

**Testing This (Manual):**
- Create/Read/Update/Delete operations via API endpoints
- Verify data persists in Supabase
- Test authorization (user can only read own funnels)
- Test edge cases: invalid IDs, missing records, concurrent updates

## Type Safety as a Testing Strategy

**Example — Type-driven API Contract:**
```typescript
// lib/stream-response.ts
export interface StreamEvent {
  type: "heartbeat" | "progress" | "result" | "error";
  message?: string;
  data?: unknown;
}

// Must match this type or won't compile
const event: StreamEvent = { type: "progress", message: "..." };  // OK
const bad: StreamEvent = { type: "invalid" };  // TS error
```

**Type Guards:**
```typescript
// app/api/chat/route.ts
if (!funnelId || typeof funnelId !== "string") {
  return Response.json({ error: "funnelId is required" }, { status: 400 });
}
// After this check, funnelId is guaranteed string type
```

## Build and Deployment Testing

**Pre-deployment Checks:**

1. **Build Command:**
   ```bash
   npm run build
   ```
   - Compiles TypeScript strictly (no errors, no implicit any)
   - Bundles Next.js app and API routes
   - Creates production-optimized output in `.next/`

2. **Linting:**
   ```bash
   npm run lint
   ```
   - Runs ESLint with Next.js rules
   - Checks for React best practices (hooks rules, missing dependencies)
   - Type checks enforced

3. **Type Checking:**
   ```bash
   npx tsc --noEmit
   ```
   - Full TypeScript compilation check (included in build)

**Vercel Deployment Validation:**
- Environment variables must be set in Vercel dashboard (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.)
- API routes must be stateless (no reliance on server memory)
- Max function duration set to 300 seconds for generation/chat endpoints
- Streaming responses keep connection alive during long operations

## Coverage

**Requirements:** None enforced

**Current State:** Not tracked

**If Testing Framework Added:**
- Recommend: Vitest (lighter than Jest, faster) + Playwright for E2E
- Target: 80%+ coverage for critical paths (storage, AI generation, API routes)
- Priority areas:
  - `lib/storage.ts` — CRUD operations with user isolation
  - `lib/gemini.ts`, `lib/openai.ts` — AI generation pipeline
  - API routes in `app/api/funnel/*` — Core business logic

## Common Testing Gaps

**Areas Currently Not Tested:**

1. **Complex Generation Logic:**
   - `lib/gemini.ts` (1800+ lines) — No unit tests for parsing, repair, image processing
   - `lib/openai.ts` (600+ lines) — No unit tests for response handling
   - `lib/image-gen.ts` (800+ lines) — No unit tests for compression, marker extraction

2. **Multi-step Workflows:**
   - Full funnel generation: clone → edit → publish
   - Calendar integration: fetch slots → book appointment
   - No E2E tests for user flows

3. **Error Recovery:**
   - Retry logic never tested with actual rate limits
   - Streaming abort handling not tested
   - SessionStorage quota errors not tested in real scenarios

4. **Component Integration:**
   - Sandpack preview rendering not tested
   - Image upload processing not tested
   - Stream event consumption not tested end-to-end

5. **Supabase Interactions:**
   - User isolation not tested programmatically
   - Concurrent updates not tested
   - RLS policies not tested

## Recommended Testing Strategy

**Phase 1: API Route Testing**
- Use Vitest + MSW (Mock Service Worker) for API mocking
- Test `app/api/*` handlers with mocked Supabase and AI providers
- Focus: Authorization, input validation, error responses

**Phase 2: Core Business Logic**
- Unit tests for `lib/storage.ts` (with mocked Supabase)
- Unit tests for `lib/gemini.ts` and `lib/openai.ts` (with mocked AI APIs)
- Test retry logic with controlled failures

**Phase 3: E2E Testing**
- Use Playwright for full user flows
- Test generation, editing, publishing in staging environment
- Test calendar integration, image uploads

---

*Testing analysis: 2026-03-13*
