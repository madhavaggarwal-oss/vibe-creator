# Codebase Structure

**Analysis Date:** 2026-03-13

## Directory Layout

```
funnel-builder/
├── app/                        # Next.js App Router pages and API routes
│   ├── layout.tsx              # Root HTML layout with Geist fonts
│   ├── page.tsx                # Home page (/)
│   ├── login/                  # Auth entry point
│   ├── auth/callback/          # OAuth/email link callback handler
│   ├── generate/[id]/          # Main editing & preview interface
│   ├── projects/               # Project listings page
│   ├── settings/               # User settings page
│   ├── preview-react/[id]/     # Standalone React preview (legacy?)
│   ├── admin/                  # Admin-only pages (impersonate, analytics)
│   ├── docs/                   # Static docs (GHL setup guide)
│   └── api/                    # API route handlers
│       ├── generate/           # POST new project generation
│       ├── chat/               # POST edit existing project
│       ├── funnels/            # GET project list, CRUD operations
│       ├── ghl/                # GoHighLevel calendar integration (calendars, slots, contact)
│       ├── scrape/             # GET scrape website (legacy, mostly server-side)
│       ├── auth/               # Email check, current user, OAuth callback
│       ├── admin/              # User impersonation, analytics (admin only)
│       ├── settings/           # User settings read/write
│       ├── classify/           # Content classification (unused?)
│       └── debug/              # Debug endpoints
├── components/                 # React components (client-side)
│   ├── vibe-site-page.tsx      # Home page UI (prompt, images, model picker)
│   ├── react-preview.tsx       # Sandpack preview wrapper with error boundary
│   ├── highlevel-layout.tsx    # Header/nav layout for app pages
│   ├── funnels-page.tsx        # Projects list component (legacy?)
│   ├── image-upload.tsx        # Image picker UI
│   ├── model-data.ts           # Model metadata (name, description)
├── lib/                        # Utilities and business logic
│   ├── supabase/               # Supabase auth & DB utilities
│   │   ├── server.ts           # Server-side client creation, getCurrentUserId()
│   │   ├── client.ts           # Client-side client creation
│   │   └── middleware.ts       # Session refresh middleware
│   ├── gemini.ts               # Google Generative AI integration (generation, editing, retry logic)
│   ├── openai.ts               # OpenAI GPT integration (generation, editing, retry logic)
│   ├── storage.ts              # Funnel CRUD (save, get, list, delete via Supabase)
│   ├── stream-response.ts      # NDJSON streaming utilities for long-running API routes
│   ├── image-gen.ts            # Image marker processing and Imagen API calls
│   ├── image-utils.ts          # Client-side image file processing
│   ├── firecrawl.ts            # URL scraping utility (Firecrawl API)
│   ├── system-prompts.ts       # LLM system prompts (SYSTEM_PROMPT, EDIT_SYSTEM_PROMPT, etc.)
│   ├── syntax-repair.ts        # JSON/JSX/CSS repair and validation utilities
│   ├── generation-utils.ts     # AI response parsing helpers
│   ├── generation-log.ts       # Log generation attempts for analytics
│   ├── pending-generation.ts   # Transient state holder (in-memory + sessionStorage)
│   ├── shared-types.ts         # Cross-layer type definitions (FunnelProject, formatRelativeDate)
│   ├── langfuse.ts             # Optional Langfuse integration for AI monitoring
│   └── ghl-config.ts           # GoHighLevel API configuration
├── public/                     # Static assets (images, icons)
├── data/                       # Local JSON file storage (legacy, git-ignored)
├── scripts/                    # Utility scripts (seed-projects.ts, etc.)
├── .next/                      # Build output (git-ignored)
├── .planning/                  # GSD planning documents (this directory)
├── middleware.ts               # Global middleware entry point
├── next.config.ts              # Next.js configuration
├── tsconfig.json               # TypeScript configuration with @ path alias
├── tailwind.config.js          # Tailwind CSS configuration
├── eslint.config.mjs           # ESLint rules
└── package.json                # Dependencies and scripts
```

## Directory Purposes

**app/:**
- Purpose: Next.js App Router containing all pages and API routes
- Contains: Route handlers, Server Components, page layouts
- Key files: `layout.tsx` (root), `page.tsx` (home), `middleware.ts` (global)

**app/api/:**
- Purpose: HTTP API endpoints for generation, editing, auth, and data access
- Contains: POST/GET route handlers with authentication checks and error handling
- Organized by feature: `generate/`, `chat/`, `funnels/`, `ghl/`, `auth/`, `admin/`

**components/:**
- Purpose: Reusable React client components
- Contains: UI elements like forms, previews, image uploaders, layouts
- Key files: `vibe-site-page.tsx` (home UI), `react-preview.tsx` (Sandpack wrapper)

**lib/:**
- Purpose: Business logic, utilities, and integrations
- Organized by concern: `supabase/` (auth), `gemini.ts` (Gemini AI), `storage.ts` (data persistence)
- No routing or UI — pure logic and data access

**lib/supabase/:**
- Purpose: Supabase authentication and database access
- Key functions: `getCurrentUserId()`, `isAdminSession()`, `createClient()`

**public/:**
- Purpose: Static assets served directly (images, icons, manifests)

**data/:**
- Purpose: Local JSON file storage (legacy, replaced by Supabase)
- Status: Git-ignored, only present in development

**scripts/:**
- Purpose: Utility scripts for development and administration
- Example: `seed-projects.ts` for test data creation

## Key File Locations

**Entry Points:**
- `app/page.tsx`: Home page (public entry, delegates to `VibeSitePage`)
- `app/generate/[id]/page.tsx`: Project generation and editing interface
- `app/login/page.tsx`: Authentication entry point
- `middleware.ts`: Global middleware for session refresh

**Configuration:**
- `next.config.ts`: Next.js settings
- `tsconfig.json`: TypeScript paths (`@/*` → project root)
- `tailwind.config.js`: Tailwind utilities and colors
- `eslint.config.mjs`: Code linting rules

**Core Logic:**
- `lib/storage.ts`: Funnel CRUD and project persistence
- `lib/gemini.ts`: Gemini AI generation and editing
- `lib/openai.ts`: OpenAI GPT generation and editing
- `lib/stream-response.ts`: Streaming response utilities (Vercel timeout workaround)

**UI Components:**
- `components/vibe-site-page.tsx`: Home page form and model selector
- `components/react-preview.tsx`: Sandpack preview with error boundary
- `components/highlevel-layout.tsx`: Header/nav layout

**Type Definitions:**
- `lib/storage.ts`: `Funnel`, `ChatMessage`, `FunnelPage` interfaces (lines 42-62, 19-24)
- `lib/shared-types.ts`: `FunnelProject`, date formatting utilities

## Naming Conventions

**Files:**
- **Pages:** kebab-case with `.tsx` extension (e.g., `vibe-site-page.tsx`, `react-preview.tsx`)
- **API routes:** Feature-named directories with `route.ts` (e.g., `app/api/generate/route.ts`)
- **Utilities:** kebab-case matching their purpose (e.g., `stream-response.ts`, `image-gen.ts`)
- **Components:** PascalCase in kebab-case files (e.g., `vibe-site-page.tsx` exports `VibeSitePage`)
- **Middleware:** `middleware.ts` at project root

**Directories:**
- **API groups:** Feature-named (e.g., `api/ghl/`, `api/admin/`)
- **Dynamic routes:** Square brackets for params (e.g., `generate/[id]/`)
- **Supabase utilities:** Grouped in `lib/supabase/` by concern (server, client, middleware)

**Functions & Variables:**
- **Exports:** camelCase for functions, PascalCase for types/interfaces/components
- **Privates:** camelCase, no underscore prefix
- **Constants:** UPPER_CASE (e.g., `MAX_IMAGES`, `RETRY_DELAYS`)
- **Async functions:** Describe action (e.g., `generateFunnel`, `saveFunnel`, `listFunnels`)

**Types & Interfaces:**
- **Domain models:** PascalCase, describe entity (e.g., `Funnel`, `ChatMessage`, `FunnelPage`)
- **Props interfaces:** `{ComponentName}Props` (e.g., `ReactProjectPreviewProps`)
- **API requests/responses:** `{Feature}{Request|Response}` pattern (e.g., from code: model routing in `chat/route.ts`)
- **Enums:** UPPER_CASE options (e.g., role values "user" | "assistant" | "calendar-connected")

## Where to Add New Code

**New Feature (e.g., Calendar Integration):**
- API endpoint: `app/api/{feature}/route.ts` (e.g., `app/api/ghl/calendars/route.ts`)
- Utilities: `lib/{feature}.ts` (e.g., `lib/ghl-config.ts`)
- Types: Add to `lib/storage.ts` interfaces if global, or inline in `lib/{feature}.ts`
- Client page: `app/{feature}/page.tsx` if user-facing
- Tests: Colocate as `lib/{feature}.test.ts` (not currently in repo, would be pattern to follow)

**New Component:**
- Location: `components/{name}.tsx` (e.g., `components/image-upload.tsx`)
- Convention: Export default PascalCase component function with `"use client"` directive if interactive
- Props: Define `{ComponentName}Props` interface in same file
- Reusable styles: Use Tailwind utility classes, no CSS modules

**New Utility/Library:**
- Location: `lib/{purpose}.ts` (e.g., `lib/image-gen.ts`)
- Convention: Export named functions, no default exports
- Error handling: Use try/catch with console logging using `[prefix]` for module identification
- Types: Define interfaces/types at top of file

**New API Route:**
- Location: `app/api/{feature}/{action}/route.ts`
- Convention: Import `getCurrentUserId()` from `lib/supabase/server.ts`, check immediately
- Input: Validate via `request.json()` checks before processing
- Streaming: Use `createStreamingResponse()` from `lib/stream-response.ts` for long operations
- Errors: Return `NextResponse.json({ error: "message" }, { status: code })`

**Settings/Configuration:**
- Tailwind: `tailwind.config.js` (colors, spacing, fonts)
- TypeScript: `tsconfig.json` (paths, compiler options)
- Next.js: `next.config.ts` (redirects, headers, rewrites)

## Special Directories

**data/:**
- Purpose: Local JSON file storage (development only)
- Generated: Yes, dynamically created by storage operations
- Committed: No, in `.gitignore`
- Note: Only works locally; Vercel deployment requires Supabase

**.next/:**
- Purpose: Build output, cache, and internal Next.js files
- Generated: Yes, created by `npm run build`
- Committed: No, in `.gitignore`

**.planning/:**
- Purpose: GSD (Generate-Ship-Deploy) planning and analysis documents
- Generated: No, manually written by analysis tools
- Committed: Yes, checked into git for reference

**.env.local:**
- Purpose: Local environment variables (development)
- Committed: No, in `.gitignore`
- Contains: NEXT_PUBLIC_SUPABASE_* (public), SUPABASE_SERVICE_ROLE_KEY, API keys for Gemini, OpenAI, etc.

**node_modules/:**
- Purpose: Installed dependencies
- Generated: Yes, created by `npm install`
- Committed: No, in `.gitignore`

---

*Structure analysis: 2026-03-13*
