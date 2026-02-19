# Vibe Creator — Development Instructions

## Git Workflow

After completing a change, **do NOT immediately commit/push or update PRD-Phase1.md**. Instead:

1. **Ask the user** to review/test the changes first
2. Wait for user confirmation that the changes are working and finalized
3. Only after user approval, **commit + push + update PRD-Phase1.md** together

### Commit conventions
- `feat: <description>` for new features (e.g., `feat: add project delete with confirmation dialog (US-2.5)`)
- `fix: <description>` for bug fixes
- `refactor: <description>` for restructuring without behavior change
- `chore: <description>` for tooling, config, docs-only changes
- Include the user story ID in the message when applicable (e.g., `US-2.5`)
- Keep the subject line under 72 characters; add a body for details if needed

### PRD-Phase1.md updates (only after user approval)
- This file is the single source of truth and MUST stay in sync
- After implementing a story: change `PENDING` → `BUILT` or `PARTIAL` → `BUILT`, check off completed acceptance criteria (`- [ ]` → `- [x]`), update the summary table counts and header total
- **Ad hoc requirements**: if the user requests any feature, fix, or change that is NOT already in PRD-Phase1.md, add it as a new user story under the appropriate theme (or create a new theme). Assign the next available US number, write full acceptance criteria, and mark it `BUILT` once implemented
- Commit the PRD update as part of the same commit as the feature

## Project Structure

- **Next.js 16 App Router** with React 19 and TypeScript
- `app/` — pages and API routes
- `components/` — React components
- `lib/` — utilities (AI generation, storage, image processing)
- `data/` — local JSON project storage (git-ignored)
- `PRD-Phase1.md` — source of truth for all Phase 1 user stories and their status

## Development Principles

### Consistency First
- When making changes to any UI pattern, behavior, or styling, **audit all other locations** in the codebase where the same or similar pattern exists and apply changes consistently. Analyze first before implementing — the experience must be coherent across the entire app.

### Clarify Before Implementing
- If a request has ambiguity, edge cases, or multiple valid approaches, **ask questions and get clarity before writing code**. Think holistically — consider how changes interact with existing features, different states (loading, error, empty, generating, aborted), and all user flows.

### Production-Quality Code
- No shortcuts, hardcoding, or hacks. Follow industry-standard best practices.
- Build for stability and robustness — the codebase must be production-ready.
- Use proper abstractions, type safety, error handling, and clean architecture.

### Vercel Deployment Compatibility
- All code must work when deployed to Vercel. Be mindful of:
  - **Storage**: File-system storage (`/data/*.json`) only works locally. For Vercel deployment, storage must use a database or external service (current local storage is acceptable for development but should be noted as a deployment concern).
  - **API routes**: Must be stateless and compatible with serverless functions.
  - **Environment variables**: Secrets must come from `process.env`, never hardcoded.
  - **Build output**: Ensure `npm run build` passes cleanly with no errors or warnings that would block deployment.
  - **Edge cases**: No reliance on persistent server memory, local file system writes in production, or long-running processes that exceed serverless timeouts.

## Key Conventions

- Use Tailwind CSS utility classes for all styling (no CSS modules)
- Sandpack for live React preview (see MEMORY.md for critical constraints)
- HashRouter required inside Sandpack iframe (not BrowserRouter)
- File-based storage at `/data/{id}.json` via `lib/storage.ts`
- AI generation via Google Generative AI (Gemini) in `lib/gemini.ts`
- Client components use `"use client"` directive
- Dynamic imports for heavy deps (Sandpack, jszip) to avoid SSR issues

## Running

```
npm run dev    # starts Next.js dev server on http://localhost:3000
npm run build  # production build
npm run lint   # eslint
```
