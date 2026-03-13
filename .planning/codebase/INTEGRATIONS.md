# External Integrations

**Analysis Date:** 2026-03-13

## APIs & External Services

**AI & LLMs:**
- Google Generative AI (Gemini) - Primary AI for website generation and image processing
  - SDK/Client: `@google/generative-ai` 0.24.1
  - API Key env var: `GEMINI_API_KEY`
  - Used in: `lib/gemini.ts`, `lib/image-gen.ts`, `lib/syntax-repair.ts`
  - Features: Multi-modal generation (text + images), chat streaming, image generation, retry logic for rate limits

- OpenAI - Secondary AI model for website generation and code refinement
  - SDK/Client: `openai` 6.25.0
  - API Key env var: `OPENAI_API_KEY`
  - Used in: `lib/openai.ts`
  - Features: Model flexibility (gpt-4, gpt-4o, gpt-3.5-turbo), streaming responses, fallback to Gemini

**Web Scraping:**
- Firecrawl - Website scraping with screenshot, markdown extraction, and branding detection
  - SDK/Client: Direct HTTP API calls in `lib/firecrawl.ts`
  - API Key env var: `FIRECRAWL_API_KEY`
  - Endpoint: `https://api.firecrawl.dev/v2/scrape`
  - Features: Full-page screenshots, markdown/HTML extraction, link/image extraction, branding analysis, scroll automation

**GHL (Go High Level):**
- GHL Calendar & Contact APIs - Calendar booking and contact management for appointment scheduling
  - Endpoint: `https://services.leadconnectorhq.com/`
  - API Key env var: `GHL_API_KEY`
  - Location ID env var: `GHL_LOCATION_ID`
  - User ID env var: `GHL_USER_ID`
  - Used in: `lib/ghl-config.ts`, `app/api/ghl/*`
  - Features: List calendars, fetch availability slots, create bookings, contact management
  - Database fallback: GHL config can be stored in Supabase `user_settings` table (user-specific override)

**Observability & Tracing:**
- Langfuse - LLM observability, tracing, and monitoring
  - SDK/Client: `langfuse` 3.38.6
  - Secret Key env var: `LANGFUSE_SECRET_KEY`
  - Public Key env var: `LANGFUSE_PUBLIC_KEY`
  - Base URL env var: `LANGFUSE_BASE_URL` (defaults to `https://cloud.langfuse.com`)
  - Used in: `lib/langfuse.ts`, integrated into `lib/gemini.ts` and `lib/openai.ts`
  - Features: Trace creation with session tracking, span creation, async context preservation, automatic flushing

## Data Storage

**Databases:**
- Supabase (PostgreSQL)
  - Connection: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client), `SUPABASE_SERVICE_ROLE_KEY` (server)
  - Client: `@supabase/supabase-js` 2.98.0, `@supabase/ssr` 0.8.0
  - Tables:
    - `funnels` - Stores generated funnels with chat history, files, metadata
    - `snapshots` - Stores HTML snapshots of generated pages
    - `allowed_emails` - Email allowlist with `is_admin` flag for access control
    - `user_settings` - User-specific settings including GHL credentials (`ghl_api_key`, `ghl_location_id`, `ghl_user_id`)
  - Auth: Supabase Auth (email/password based)
  - Used in: `lib/storage.ts`, `lib/supabase/server.ts`, `lib/ghl-config.ts`, `app/api/*`

**File Storage:**
- Vercel Blob - Cloud file storage for generated images
  - SDK/Client: `@vercel/blob` 2.2.0
  - API Token env var: `BLOB_READ_WRITE_TOKEN`
  - Used in: `lib/image-gen.ts` for uploading generated images
  - Graceful degradation: Falls back to placeholder URLs if token is missing

**Caching:**
- None detected - No Redis or persistent caching layer configured

## Authentication & Identity

**Auth Provider:**
- Supabase Auth - Email/password authentication with JWT sessions
  - Implementation: OAuth via Supabase, stored in HTTP-only cookies
  - Middleware: `lib/supabase/middleware.ts` - Session refresh via cookies on every request
  - Current User: `lib/supabase/server.ts` - `getCurrentUserId()` from session cookies
  - Admin Check: `lib/supabase/server.ts` - `isAdminSession()` checks `allowed_emails.is_admin` or impersonator cookie
  - Impersonation: Admin users can impersonate other users via `impersonator_email` cookie (see `app/admin/impersonate/page.tsx`)

## Monitoring & Observability

**Error Tracking:**
- Langfuse - LLM traces include error metadata
- Console logging - Standard console.error/warn throughout codebase (see `lib/gemini.ts`, `lib/openai.ts`, API routes)

**Logs:**
- Console output - All AI generation, API calls, storage operations logged to stdout/stderr
- Langfuse traces - LLM calls tracked with input/output/metadata

## CI/CD & Deployment

**Hosting:**
- Vercel - Primary deployment platform (inferred from Next.js App Router, Vercel Blob integration, `.vercel/` directory)

**CI Pipeline:**
- Not detected - No GitHub Actions, GitLab CI, or other CI configuration found
- Build command: `npm run build` (Next.js standard)
- Start command: `npm start` or `next start`

## Environment Configuration

**Required env vars (critical):**
- `GEMINI_API_KEY` - Google Generative AI API key
- `OPENAI_API_KEY` - OpenAI API key
- `FIRECRAWL_API_KEY` - Firecrawl API key for web scraping
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob token (optional, images fall back to placeholders if missing)
- `LANGFUSE_SECRET_KEY` - Langfuse secret (optional, observability degrades gracefully)
- `LANGFUSE_PUBLIC_KEY` - Langfuse public key (optional)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase public anon key (sent to client)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role (server-only, do NOT expose to client)
- `GHL_API_KEY` - GHL API key (optional per user, can be overridden in user_settings)
- `GHL_LOCATION_ID` - GHL location ID (optional per user)
- `GHL_USER_ID` - GHL assigned user ID (optional per user)

**Secrets location:**
- Local development: `.env.local` (git-ignored)
- Production (Vercel): Environment variables configured in Vercel dashboard

## Webhooks & Callbacks

**Incoming:**
- Not detected - No incoming webhook endpoints configured

**Outgoing:**
- GHL callback hooks - Possible but not explicitly handled in current codebase
- Langfuse async flush - `lib/langfuse.ts` flushes via Next.js `after()` callback

## API Rate Limits & Retry Strategy

**Gemini API:**
- Retry delays: 3s, 6s, 12s (exponential backoff)
- Retryable errors: 503, 429 (rate limit), "overloaded", "high demand", "RESOURCE_EXHAUSTED"
- Implementation: `lib/gemini.ts` - `withRetry()` helper

**OpenAI API:**
- Retry delays: 3s, 6s, 12s (exponential backoff)
- Retryable errors: 429, "rate_limit", "overloaded", 503, "server_error"
- Implementation: `lib/openai.ts` - `withRetry()` helper

**Supabase:**
- No explicit retry logic (relies on SDK defaults)

---

*Integration audit: 2026-03-13*
