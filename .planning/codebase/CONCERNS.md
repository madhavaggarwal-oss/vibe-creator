# Codebase Concerns

**Analysis Date:** 2026-03-13

## Tech Debt

**Large Component Files (Monoliths):**
- Issue: `app/generate/[id]/page.tsx` (2816 lines), `lib/gemini.ts` (1882 lines), `components/react-preview.tsx` (1484 lines) are difficult to maintain, test, and debug. Multiple responsibilities mixed together (state management, UI rendering, API calls).
- Files: `app/generate/[id]/page.tsx`, `lib/gemini.ts`, `components/react-preview.tsx`
- Impact: Slow development velocity, high risk of regressions on touch. Difficult to isolate issues. Testing requires full component mount.
- Fix approach: Extract functions into separate modules. Break `react-preview.tsx` into error boundary, sandpack wrapper, event handlers. Extract `json parsing`, `image processing`, and `retry logic` from `gemini.ts` into dedicated modules.

**Excessive Console Logging (389 occurrences):**
- Issue: Debug `console.log` and `console.warn` statements remain throughout production code across 35 files. No centralized logging system or environment-aware filtering.
- Files: Pervasive across `lib/`, `app/api/`, `components/`
- Impact: Console noise in production. Security risk if sensitive data is logged. No structured logging for observability.
- Fix approach: Replace `console.*` calls with environment-aware logging utility. Create `lib/logger.ts` that respects `NODE_ENV`. Only log in development or via Langfuse (already integrated).

**Magic Numbers and String Literals:**
- Issue: Hardcoded values scattered throughout: retry delays `[3000, 6000, 12000]` in both `gemini.ts` and `openai.ts`, heartbeat interval `15000`, image dimensions, timeout values.
- Files: `lib/gemini.ts`, `lib/openai.ts`, `lib/stream-response.ts`, `lib/image-gen.ts`
- Impact: Difficult to tune performance. No single source of truth for configuration. Inconsistency between retry strategies.
- Fix approach: Create `lib/constants.ts` with centralized configuration (retry delays, timeouts, heartbeat intervals, image constraints, API limits).

**Dual AI Model Implementation Without Abstraction:**
- Issue: Code is duplicated across `lib/gemini.ts` and `lib/openai.ts`: same retry logic, same JSON parsing, same image processing, same prompt system. No model abstraction layer.
- Files: `lib/gemini.ts` (1882 lines), `lib/openai.ts` (410 lines), `lib/system-prompts.ts` (unclear structure)
- Impact: Bug fixes must be applied twice. Adding new models requires duplicating 400+ lines. Inconsistent error handling between models.
- Fix approach: Create abstract `lib/ai-provider.ts` interface with concrete implementations `GeminiProvider` and `OpenAIProvider`. Consolidate shared logic (JSON parsing, retry, image processing).

**Incomplete Error Recovery in API Routes:**
- Issue: Many API routes lack comprehensive error handling. Stream errors may not properly clean up resources (e.g., `lib/stream-response.ts` heartbeat cleanup depends on signal). Error responses don't always include actionable context.
- Files: `app/api/generate/route.ts`, `app/api/funnel/[id]/generate-images/route.ts`, `app/api/funnel/[id]/repair/route.ts`
- Impact: Partial failures can leave connections hanging. Client may not know what went wrong (generic "Stream error" message).
- Fix approach: Standardize error responses with error codes and user-facing messages. Ensure all async handlers have proper try/finally blocks. Test abort signal cleanup.

---

## Known Bugs

**sessionStorage Quota Exceeded on Large Image Clones:**
- Symptoms: Image clone generation fails silently. User sees "Failed to start generation" but is not told why. Data is lost on navigation.
- Files: `lib/pending-generation.ts`, `lib/image-utils.ts`
- Trigger: Clone a project with large images (base64 encoded). Payload size exceeds ~5MB sessionStorage limit.
- Workaround: Current code converts clone images to JPEG to reduce size, but this is a patch. If images are still too large, the entire generation data is lost.
- Root cause: Relying on sessionStorage for large payloads. No size validation before attempting write. No user feedback when quota exceeded.
- Fix approach: Validate payload size before navigation. If too large, store in IndexedDB instead. Show user warning if images will be compressed.

**Race Condition in Chat History Updates:**
- Symptoms: In rapid succession, if user sends messages while generation is in progress, chat history can become out of sync with stored data.
- Files: `app/generate/[id]/page.tsx` (chat state management)
- Trigger: Send message → start generation → generation completes → message arrives. Updates may overwrite each other.
- Current mitigation: None observed.
- Fix approach: Implement optimistic locking or versioning on chat history. Use API to fetch latest before updating. Debounce chat sends.

**JSON Parsing Fallback Chain Incomplete:**
- Symptoms: If AI response is malformed JSON that survives `jsonrepair`, the fallback to manual extraction may fail silently, returning an empty object.
- Files: `lib/gemini.ts` (lines 1539-1567), `parseAIJson` function
- Trigger: Very large or deeply nested malformed JSON. jsonrepair hits RangeError on stack limit.
- Current mitigation: Logs warning, but continues with incomplete extraction.
- Impact: Generated code may have missing files or fields, causing render errors downstream.
- Fix approach: If all parsing fails, return explicit error with context (response length, first 500 chars). Let caller decide whether to retry or abort.

---

## Security Considerations

**Insufficient Input Validation on Funnel IDs:**
- Risk: UUID validation exists (`lib/storage.ts:isValidFunnelId`) but is only used in some routes. Not all API endpoints validate the ID format before querying storage.
- Files: `app/api/funnel/[id]/route.ts`, `app/api/funnel/[id]/validate/route.ts`, `app/api/funnel/[id]/generate-images/route.ts`
- Current mitigation: `isValidFunnelId` function exists but coverage is inconsistent.
- Recommendations: Add middleware or decorator to validate all `[id]` route params automatically. Audit all routes that accept IDs to ensure validation is called.

**Environment Variable Exposure in Debug Endpoint:**
- Risk: `/api/debug/image-test` exposes environment variable names and partial values (first 8 chars of API keys) in response.
- Files: `app/api/debug/image-test/route.ts` (lines 11-12)
- Current mitigation: Only first 8 chars are shown, not full key.
- Recommendations: Remove this debug endpoint from production deployment. If needed for diagnostics, gate behind admin check (`getCurrentUserId` + admin role).

**XSS Risk in Stored HTML/Code:**
- Risk: Funnel HTML pages are rendered directly in iframes without sanitization. If user-supplied prompt or cloned HTML contains malicious script, it executes.
- Files: `app/preview/[id]/[slug]/route.ts` (renders HTML directly)
- Current mitigation: Pages are generated by AI (not user input directly), but if prompt contains injection payloads, AI may generate code that includes them.
- Recommendations: Use CSP headers on iframe preview routes. Sanitize generated HTML with `DOMPurify` or similar before rendering.

**No Rate Limiting on Generation APIs:**
- Risk: `/api/generate` and `/api/funnel/[id]/repair` can be called unlimited times, consuming quota from Gemini/OpenAI and Vercel Blob storage.
- Files: `app/api/generate/route.ts`, `app/api/funnel/[id]/repair/route.ts`
- Current mitigation: Per-user auth check exists, but no per-user rate limit.
- Recommendations: Implement rate limiting (e.g., 10 generation requests per hour per user) using Vercel KV or Supabase.

---

## Performance Bottlenecks

**Image Generation Concurrency and Memory:**
- Problem: Generating 10+ images sequentially uses Gemini API quota and can exceed Vercel function memory (1GB default).
- Files: `lib/image-gen.ts` (image generation loop), `app/api/funnel/[id]/generate-images/route.ts`
- Cause: Promise.all for multiple image generations can spike memory if images are large. No streaming response for progress feedback.
- Current state: Recent commits mention "increase image generation concurrency to 20", suggesting scaling issues were encountered.
- Improvement path: Implement batch processing with configurable concurrency (e.g., 5 parallel). Stream progress updates to client. Add memory monitoring (warn if >800MB).

**CSS Parsing for Tailwind Theme Extraction:**
- Problem: `extractTailwindThemeConfig` parses entire tailwind.config.ts using regex to find theme block. Inefficient for large configs. Called for every page render.
- Files: `components/react-preview.tsx` (line 288)
- Cause: Regex-based parsing instead of proper JS parsing. No caching of results.
- Improvement path: Cache theme extraction per project. Use AST parser (Babel) for reliable extraction. Memoize result in component.

**Sandpack Bundle Size & Startup Time:**
- Problem: Dynamic import reduces TTL but Sandpack still takes 2-3 seconds to initialize and bundle first render.
- Files: `app/generate/[id]/page.tsx` (line 59), `components/react-preview.tsx`
- Current state: Loading spinner shown, but user experience is slow.
- Improvement path: Prefetch Sandpack bundle. Use Web Workers to bundle in background. Implement aggressive caching at browser level.

---

## Fragile Areas

**Syntax Repair Pipeline:**
- Files: `lib/syntax-repair.ts` (923 lines), used by `app/api/funnel/[id]/repair/route.ts`
- Why fragile: Four-tier repair chain (bracket counting → AST parsing → Babel transpilation → local fixes) is complex and order-dependent. Each tier can fail in ways the next tier doesn't handle. If Babel fails, fallback to local fixes may introduce new syntax errors.
- Safe modification: Add integration tests for each tier. Test on corpus of known bad AI outputs. Add logging at each tier to understand failure patterns.
- Test coverage: Exists (`tryParseTSX`, `trySandpackTranspile`) but gaps in local repair functions (`repairAdjacentJSX`, `repairMissingReturn`, etc.).

**Chat History State in Generate Page:**
- Files: `app/generate/[id]/page.tsx` (lines 1-600+)
- Why fragile: Chat history is loaded from storage, updated in state, and sent to API. Multiple sources of truth (storage, in-memory state, Supabase). Merging logic is implicit.
- Safe modification: Add explicit chat history merge strategy. Document state flow. Write tests for concurrent updates.
- Test coverage: None observed for chat sync edge cases.

**Image Marker Processing:**
- Files: `lib/image-gen.ts` (lines 6-100+, marker regex and extraction)
- Why fragile: Regex-based marker detection (`__IMG:description__`) is brittle. Whitespace, escaping, or special chars in description can break matching. Fallback to placehold.co URLs can be cached incorrectly.
- Safe modification: Use strict marker format validation. Test with corpus of AI-generated code. Add fallback for malformed markers (warn, skip).
- Test coverage: None observed for edge cases (emoji, special chars, very long descriptions).

---

## Scaling Limits

**Vercel Serverless Function Timeouts:**
- Current capacity: 300 second max duration (set in `app/api/generate/route.ts`). Some routes have 120s (image generation, scraping).
- Limit: Complex code generation or large image batches may exceed timeout, leaving user hanging.
- Current state: Recent commit notes "revert maxDuration to 300 to unblock Vercel deployments", suggesting timeout tuning is an ongoing issue.
- Scaling path: Implement async job queue (e.g., Vercel Cron or external queue). Break generation into smaller tasks. Add progress tracking.

**Supabase Row Size & Bandwidth:**
- Current capacity: Funnel records store full chat history + files JSON. Large projects can be 10MB+.
- Limit: Supabase bandwidth limits may be exceeded with many concurrent users. Row size limits may be hit.
- Scaling path: Separate chat history into its own table. Store large files in Vercel Blob, reference by URL in Supabase. Implement pagination for chat history.

**AI API Rate Limits (Gemini/OpenAI):**
- Current capacity: Multi-model generation added (Gemini + OpenAI), but no quota tracking or distribution logic.
- Limit: If one model hits rate limit, no fallback to the other. User sees error.
- Scaling path: Implement smart model selection based on current quota usage. Add fallback logic. Monitor quota consumption and alert when approaching limits.

---

## Dependencies at Risk

**@codesandbox/sandpack-react Version ^2.20.0:**
- Risk: Major version constraint. Updates may include breaking changes. Sandpack iframe behavior is sensitive to React version mismatches.
- Impact: If broken, entire preview system is unusable. No alternative preview system in place.
- Migration plan: Lock to specific version (`2.20.0` instead of `^2.20.0`). Monitor Sandpack releases. Test thoroughly before upgrading.

**Google Generative AI vs @google/genai Dual Dependency:**
- Risk: Two different Google AI SDKs are imported and used (`lib/gemini.ts` imports `@google/generative-ai`, `lib/image-gen.ts` imports `@google/genai`). They have different APIs and may diverge.
- Impact: Confusion, maintenance burden, incompatible error handling.
- Migration plan: Choose one SDK, migrate all code to it. Remove duplicate dependency from package.json.

**jsonrepair ^3.13.2 Stack Overflow Risk:**
- Risk: `jsonrepair` can hit RangeError on very large inputs, causing catch block to catch and continue. This is not a transparent failure.
- Impact: Silently incomplete JSON parsing.
- Migration plan: Add size check before calling jsonrepair. If >1MB, skip directly to manual extraction. Test with large payloads.

---

## Missing Critical Features

**No Observability/Monitoring Beyond Langfuse:**
- Problem: Errors are logged to console, sent to Langfuse for traces, but there's no unified error dashboard or alerting.
- Blocks: Cannot easily identify failure patterns, debug production issues, or alert on errors.
- Approach: Implement centralized error tracking (e.g., Sentry). Create dashboard for common error types. Add alerting for repeated failures.

**No User Feedback on Generation Progress:**
- Problem: During long generation (code gen + image gen), user sees only a spinner. No breakdown of what's happening (generating code… 30%, generating images… 50%).
- Blocks: User anxiety, impatience, accidental refresh.
- Approach: Add granular progress events from API. Stream progress updates. Show ETA based on historical completion times.

**No Conflict Resolution for Concurrent Edits:**
- Problem: If user has the same project open in two tabs and edits in both, changes overwrite each other silently.
- Blocks: Data loss for power users.
- Approach: Add optimistic locking, version numbers, or CRDT-style merging. Warn user if editing in multiple tabs.

---

## Test Coverage Gaps

**No Unit Tests for Core Utilities:**
- What's not tested: `lib/gemini.ts` (JSON parsing, image processing, retry logic), `lib/syntax-repair.ts` (repair tier functions), `lib/storage.ts` (CRUD operations)
- Files: `lib/gemini.ts`, `lib/openai.ts`, `lib/syntax-repair.ts`, `lib/storage.ts`
- Risk: Silent failures when AI output changes. Regressions when fixing bugs.
- Priority: **High** — these modules are critical paths.

**No Integration Tests for API Routes:**
- What's not tested: Full generation pipeline (request → AI call → image gen → response), error recovery paths, stream handling
- Files: `app/api/generate/route.ts`, `app/api/funnel/[id]/repair/route.ts`
- Risk: Bugs may only surface in production or under specific conditions (large payloads, aborted requests, API failures).
- Priority: **High** — these handle user-facing requests.

**No E2E Tests for User Workflows:**
- What's not tested: Create project → generate code → edit → save → clone → delete flows
- Files: Entire app
- Risk: Feature regressions, broken UX flows discovered by users.
- Priority: **Medium** — automated testing difficult for visual/interactive features.

**No Tests for Edge Cases:**
- What's not tested: Empty projects, very large projects (100+ files), rapid successive requests, network failures during streaming, sessionStorage quota exceeded
- Files: All
- Risk: Crashes or unexpected behavior under stress.
- Priority: **Medium** — important for production stability.

---

*Concerns audit: 2026-03-13*
