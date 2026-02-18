# Vibe Creator — Development Instructions

## Git Workflow

After completing each user story or meaningful change:

1. **Commit** with a conventional commit message following the repo's existing style:
   - `feat: <description>` for new features (e.g., `feat: add project delete with confirmation dialog (US-2.5)`)
   - `fix: <description>` for bug fixes
   - `refactor: <description>` for restructuring without behavior change
   - `chore: <description>` for tooling, config, docs-only changes
   - Include the user story ID in the message when applicable (e.g., `US-2.5`)
   - Keep the subject line under 72 characters; add a body for details if needed
2. **Push** to `origin/main` after each commit
3. **Update PRD-Phase1.md** — this file is the single source of truth and MUST stay in sync:
   - After implementing a story: change `PENDING` → `BUILT` or `PARTIAL` → `BUILT`, check off completed acceptance criteria (`- [ ]` → `- [x]`), update the summary table counts and header total
   - **Ad hoc requirements**: if the user requests any feature, fix, or change that is NOT already in PRD-Phase1.md, add it as a new user story under the appropriate theme (or create a new theme). Assign the next available US number, write full acceptance criteria, and mark it `BUILT` once implemented. This ensures every change is tracked in the PRD regardless of how it was requested.
   - Commit the PRD update as part of the same commit as the feature

## Project Structure

- **Next.js 16 App Router** with React 19 and TypeScript
- `app/` — pages and API routes
- `components/` — React components
- `lib/` — utilities (AI generation, storage, image processing)
- `data/` — local JSON project storage (git-ignored)
- `PRD-Phase1.md` — source of truth for all Phase 1 user stories and their status

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
