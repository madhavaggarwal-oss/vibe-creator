# Architecture

**Analysis Date:** 2026-03-13

## Pattern Overview

**Overall:** Next.js App Router serverless architecture with multi-model AI generation (Gemini and OpenAI), streaming responses, and file-based project management.

**Key Characteristics:**
- Full-stack TypeScript with React 19 server and client components
- Streaming API responses with heartbeat pings for long-running operations
- Multi-model AI provider routing (Gemini 3.0 Pro Preview and GPT-4)
- Project file management stored in Supabase with JSON serialization
- Real-time React preview using Sandpack iframe with error boundaries
- Server-side content scraping to avoid 413 payload limits on Vercel

## Layers

**Presentation Layer (React/UI):**
- Purpose: User-facing pages, components, and interactive elements
- Location: `app/` (pages) and `components/` (reusable UI)
- Contains: Client components with form inputs, previews, settings, project listings
- Depends on: `lib/` utility functions, Supabase auth, stream readers
- Used by: Browser clients only

**API Layer (Route Handlers):**
- Purpose: HTTP endpoints for generation, editing, scraping, auth, and data management
- Location: `app/api/` organized by feature (generate, chat, ghl, auth, admin, scrape, settings)
- Contains: POST/GET handlers with authentication checks, input validation, streaming responses
- Depends on: AI providers (Gemini, OpenAI), storage layer, Supabase auth, external APIs (GHL, Firecrawl)
- Used by: Client pages, external webhooks

**Generation & AI Layer:**
- Purpose: LLM API interaction, prompt management, response parsing, retry logic
- Location: `lib/gemini.ts`, `lib/openai.ts`, `lib/system-prompts.ts`
- Contains: Model-specific generation functions for new projects, edits, clones; prompt templates; retry-with-backoff
- Depends on: Google GenAI and OpenAI SDKs, image processing, syntax repair
- Used by: API routes for POST generate and chat endpoints

**Storage & Persistence Layer:**
- Purpose: Funnel CRUD operations, snapshot management, multi-model file storage
- Location: `lib/storage.ts`
- Contains: Supabase client initialization, funnel save/read/delete, listings with metadata optimization
- Depends on: Supabase service role client, UUID validation
- Used by: All API routes that need project persistence

**Authentication & Authorization:**
- Purpose: Session management, user identification, admin role checks
- Location: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/middleware.ts`, `middleware.ts`
- Contains: Server-side user retrieval, admin checks via allowed_emails table, cookie-based session persistence
- Depends on: Supabase Auth with OAuth, cookies
- Used by: All protected routes via `getCurrentUserId()` check

**Utility & Support Layer:**
- Purpose: Image generation, scraping, streaming, syntax repair, type definitions
- Location: `lib/image-*.ts`, `lib/firecrawl.ts`, `lib/stream-response.ts`, `lib/syntax-repair.ts`, `lib/pending-generation.ts`
- Contains: Image marker processing, URL scraping, NDJSON stream creation, JSON/CSS repair, transient generation state
- Depends on: Sharp, Google GenAI (images), Firecrawl API, highlight.js
- Used by: Generation pipelines and page load handlers

## Data Flow

**Generation Flow (New Project):**

1. User submits prompt + optional images on home page (`app/page.tsx` → `components/vibe-site-page.tsx`)
2. Data stored in `lib/pending-generation.ts` (in-memory + sessionStorage fallback)
3. Full-page navigation to `/generate/[id]` with new UUID
4. Page load calls `POST /api/generate` with prompt, model, images
5. Streaming response via `lib/stream-response.ts` sends progress events
6. Gemini/OpenAI generates JSON with `files` object (React project files) and `hasCalendar` flag
7. Image markers (`__IMG:description__`) identified, sent to image generation
8. Completed project `Funnel` object saved to Supabase via `lib/storage.ts`
9. Chat history in `funnel.chatHistory` array initialized with generation metadata
10. React preview populated via Sandpack iframe with generated files

**Editing Flow (Existing Project):**

1. User on `/generate/[id]` page edits existing funnel
2. Sends message + optional images to `POST /api/chat`
3. `lib/gemini.ts` or `lib/openai.ts` (routed by model prefix) receives existing files + chat history
4. AI generates partial file updates as JSON
5. New files merged into existing `funnel.files` object
6. Updated funnel saved to Supabase
7. Chat message added to `funnel.chatHistory`
8. React preview hot-reloaded with new files
9. Sandpack error boundary catches syntax errors and displays user-friendly message

**Scraping Flow (URL to Design):**

1. User provides website URL on home page
2. Client-side scrape attempt → if large, falls back to server
3. `POST /api/generate` with `scrapeUrl` triggers server-side `lib/firecrawl.ts` call
4. Firecrawl returns HTML + screenshot (screenshot converted to base64)
5. Screenshot sent to client via progress event (for UI preview)
6. HTML + screenshot sent to Gemini/OpenAI for generation
7. Generated project saved as normal flow

**State Management:**

- **Transient:** `lib/pending-generation.ts` holds generation data between page navigations (in-memory + sessionStorage)
- **Persistent:** Supabase stores complete `Funnel` object in `funnels.chat_history` JSONB column
- **Snapshot:** Rendered HTML saved separately in `snapshots` table for fast playback
- **User Isolation:** All reads/writes filtered by `user_id` at storage layer, enforced by Supabase RLS

## Key Abstractions

**Funnel Object:**
- Purpose: Single source of truth for a project's state, history, and generated files
- Examples: `lib/storage.ts` defines `Funnel` interface (lines 42-62)
- Pattern: Complete object serialization in Supabase; no partial updates at DB level
- Contains: `id`, `name`, `prompt`, `files` (Record<string, string>), `chatHistory`, `pendingImages`, calendar metadata

**Chat Message History:**
- Purpose: Track user edits and system responses across session
- Pattern: Array of `ChatMessage` objects with role, content, timestamp, optional images
- Used by: AI models receive history as context for coherent multi-turn editing

**Streaming Response Pattern:**
- Purpose: Keep Vercel serverless functions alive during long AI operations
- Examples: `lib/stream-response.ts`, used by `/api/generate` and `/api/chat`
- Pattern: NDJSON format with heartbeat pings every 15 seconds
- Events: `progress`, `result`, `error`, `heartbeat`

**Model Routing:**
- Purpose: Flexible multi-model support without refactoring endpoints
- Pattern: Route based on model ID prefix (`gpt-` → OpenAI, else → Gemini)
- Used by: `/api/chat` and `/api/generate` to select provider at runtime
- Example: `app/api/chat/route.ts` lines 50-54

**Image Marker System:**
- Purpose: Embed generation instructions directly in generated code
- Pattern: `__IMG:description__` or legacy `__IMG[W:H]:description__` in CSS/HTML
- Processed by: `lib/image-gen.ts` extracts context, calls Google's Imagen API, replaces markers
- Flow: Generated files → identify markers → generate images → upload to Vercel Blob → replace URLs

**Error Boundary Wrapper:**
- Purpose: Catch Sandpack runtime errors gracefully in iframe
- Examples: `components/react-preview.tsx` implements `SandpackErrorBoundary`
- Pattern: Class component intercepts errors, displays fallback UI, preserves file editor

## Entry Points

**Home Page:**
- Location: `app/page.tsx`
- Triggers: User lands on `/` (public, no auth required)
- Responsibilities: Delegates to `VibeSitePage` component for prompt input and model selection

**VibeSitePage Component:**
- Location: `components/vibe-site-page.tsx`
- Triggers: Home page render
- Responsibilities: Prompt form, image upload, URL scraping input, model picker, calls `/api/generate` and navigates to `/generate/[id]`

**Generate Page:**
- Location: `app/generate/[id]/page.tsx`
- Triggers: After generation or direct URL navigation
- Responsibilities: Load existing funnel, display React preview via Sandpack, chat input for edits, code file browser with syntax highlighting

**API Route: POST /api/generate:**
- Location: `app/api/generate/route.ts`
- Triggers: Form submission from home page
- Responsibilities: Validate user, scrape URL if provided, call AI model, save new funnel, return streaming response

**API Route: POST /api/chat:**
- Location: `app/api/chat/route.ts`
- Triggers: Edit prompt submission on generate page
- Responsibilities: Validate user and funnel access, route to Gemini or OpenAI, merge file updates, save to Supabase, stream response

**Middleware:**
- Location: `middleware.ts`
- Triggers: Every request (except static assets)
- Responsibilities: Refresh Supabase session from cookies via `lib/supabase/middleware.ts`

## Error Handling

**Strategy:** Multi-layer defensive approach with graceful degradation

**Patterns:**

1. **Authentication Errors:** All API routes check `getCurrentUserId()`, return 401 Unauthorized if missing
2. **Validation Errors:** Input checks (non-empty strings, valid UUIDs) return 400 Bad Request with message
3. **Storage Errors:** Supabase errors logged but return empty data (list endpoints) or null (single reads) to avoid 500s
4. **AI Generation Errors:** Wrapped in `withRetry()` with exponential backoff; if all retries exhausted, error sent via stream
5. **Syntax Errors in Generated Code:** Caught by Sandpack error boundary, displayed in preview as readable message
6. **Streaming Errors:** If executor throws, `createStreamingResponse` catches and sends error event before closing stream
7. **Request Abort:** Client disconnect detected via `signal.aborted`, logged as "Aborted by user", no error response sent

## Cross-Cutting Concerns

**Logging:** Console-based with prefixes per module (`[storage]`, `[Gemini]`, `[OpenAI]`, `[Chat API]`) for grep-friendly debugging

**Validation:**
- UUID validation via regex in `lib/storage.ts` to prevent injection attacks
- Model IDs validated against known prefixes (gpt-, gemini-)
- Image array length capped at 10 to prevent payload bloat

**Authentication:**
- Supabase Auth with email/OAuth provider
- Session stored in secure HTTP-only cookies
- Server middleware refreshes session on each request
- Admin role stored in `allowed_emails` table with `is_admin` flag

**Rate Limiting:** None at app level; relies on AI provider rate limits and Vercel timeout (300s for `/api/generate` and `/api/chat`)

**Observability:**
- Langfuse integration in `lib/langfuse.ts` for optional AI monitoring
- Generation logging via `lib/generation-log.ts` to track usage and errors
- Detailed console logs for debugging streaming and state transitions

---

*Architecture analysis: 2026-03-13*
