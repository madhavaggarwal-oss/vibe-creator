# PRD: Vibe Creator — Phase 1 User Stories & Acceptance Criteria

## Overview

This document maps all Phase 1 requirements against the current codebase. Each theme contains user stories with detailed acceptance criteria. Stories are marked:
- **BUILT** — Fully implemented and functional
- **PARTIAL** — Core functionality exists but missing specific criteria
- **PENDING** — Not yet implemented

**Total: 43 user stories | 23 Built | 5 Partial | 15 Pending**

---

## Theme 1: Navigation & Layout

### US-1.1: Vibe Site Tab `BUILT`
**As a** user, **I want** a "Vibe Creator" tab in the main navigation sidebar **so that** I can access the AI site builder.

**Acceptance Criteria:**
- [x] Sidebar shows "Sites" as active navigation item with "Vibe Creator" and "Funnels" tabs
- [x] Clicking "Vibe Creator" tab shows the hero + prompt + projects page
- [x] Clicking "Funnels" tab shows funnels table view
- [x] Other sidebar items show "Coming soon" placeholder

**Files:** `app/page.tsx`, `components/highlevel-layout.tsx`

---

## Theme 2: Project Management

### US-2.1: Project List View with Thumbnails `BUILT`
**As a** user, **I want** to see all my projects as cards with preview thumbnails and names **so that** I can quickly find and open my projects.

**Acceptance Criteria:**
- [x] Projects displayed in responsive grid (1-2-3-4 columns at breakpoints)
- [x] Each card shows cached snapshot thumbnail (static HTML iframe, instant load)
- [x] Project name displayed below thumbnail
- [x] "Edited X ago" timestamp shown
- [x] Clicking a card navigates to `/generate/{id}`
- [x] Loading skeleton shown while projects load
- [x] Empty state shown when no projects exist
- [x] "My projects" heading (single section, no tabs)
- [x] Max 32 cards shown, "Browse all" link to `/projects`

**Files:** `components/vibe-site-page.tsx`

---

### US-2.2: Project Rename `PENDING`
**As a** user, **I want** to rename a project **so that** I can organize my projects with meaningful names.

**Acceptance Criteria:**
- [ ] Kebab menu (three-dot icon) on each project card in the list view
- [ ] Menu shows "Rename" option
- [ ] Clicking "Rename" makes the project name inline-editable (text field replaces the name)
- [ ] Pressing Enter or clicking outside saves the new name
- [ ] Pressing Escape cancels the rename and reverts to previous name
- [ ] Empty names are not allowed — revert to previous name with subtle error feedback
- [ ] Name updates persist to storage via API (`PATCH /api/funnel/{id}`)
- [ ] Updated name reflects immediately in the project card
- [ ] Updated name reflects in the top bar when the project is open in the editor
- [ ] Project name in the editor top bar is also editable (click to edit)

**Implementation Notes:** Currently project name is auto-extracted from `index.html <title>` in `lib/storage.ts:extractProjectName()`. Need to add a `name` override field and a rename API endpoint.

---

### US-2.3: Project Clone `PENDING`
**As a** user, **I want** to clone/duplicate a project **so that** I can create variations without modifying the original.

**Acceptance Criteria:**
- [ ] Kebab menu on project card shows "Clone" option
- [ ] Cloning creates a new project with "(Copy)" appended to the name
- [ ] All files, metadata are duplicated to the new project (no chat history copied)
- [ ] New project gets a new UUID and current timestamp as `createdAt`
- [ ] Cloned project appears at the top of the projects list immediately
- [ ] Brief toast notification: "Project cloned successfully"
- [ ] User can navigate to the cloned project from the notification or the list

**Implementation Notes:** Need `POST /api/funnel/{id}/clone` API. Deep-copy all fields from source funnel JSON.

---

### US-2.4: Project Share `PENDING`
**As a** user, **I want** to share a project via a preview link **so that** others can view my site without editing it.

**Acceptance Criteria:**
- [ ] Kebab menu on project card shows "Share" option
- [ ] "Share" button in editor top bar also triggers share flow
- [ ] Share opens a popover/dialog with the shareable preview URL
- [ ] URL format: `/preview-react/{id}` (already exists as a full-screen preview page)
- [ ] "Copy link" button copies URL to clipboard
- [ ] Toast confirmation: "Link copied to clipboard"
- [ ] Preview link shows the site in read-only mode (no editor UI, no sidebar)
- [ ] Share link works for anyone without authentication
- [ ] Optional: QR code for the share link

**Implementation Notes:** `/preview-react/[id]` page already exists and renders full-screen. Main work is building the share popover UI and copy-to-clipboard flow.

---

### US-2.5: Project Delete `BUILT`
**As a** user, **I want** to delete a project I no longer need **so that** I can keep my project list clean.

**Acceptance Criteria:**
- [x] Kebab menu on project card shows "Delete" option (in red text for danger indication)
- [x] Clicking "Delete" shows a confirmation dialog: "Delete '{project name}'?" with warning text and bullet list of what gets deleted
- [x] Dialog has "Cancel" (secondary) and "Continue" (red/danger) buttons, plus X close button
- [x] Confirming deletes the project data file and snapshot via API (`DELETE /api/funnel/{id}`)
- [x] Project card removed from the grid on success
- [ ] If user is currently viewing the deleted project in the editor, redirect to home page
- [x] Canceling the dialog does nothing — project remains
- [x] Toast notification: "Project deleted"

**Files:** `app/api/funnel/[id]/route.ts`, `components/vibe-site-page.tsx`, `app/globals.css`

---

### US-2.6: Clone from URL `BUILT`
**As a** user, **I want** to paste a URL and clone an existing website **so that** I can use it as a starting point for my own project.

**Acceptance Criteria:**
- [x] URL input field above the main prompt textarea with link icon and placeholder "Paste a URL to clone a website..."
- [x] "Clone" button next to URL input
- [x] Enter key in URL field triggers clone
- [x] Auto-prepends `https://` if protocol missing
- [x] URL passed to Firecrawl API for scraping (screenshot, markdown, HTML, branding, metadata)
- [x] If no custom prompt entered, auto-generates: "Clone this website: {url}"
- [x] Scraped screenshot used as reference image for generation
- [x] Scrape data (structure, content, branding) passed to AI for faithful reproduction
- [x] Loading/scraping state shown with spinner ("Scraping...")
- [x] Disabled state during scraping

**Files:** `components/vibe-site-page.tsx`, `app/api/scrape/route.ts`, `lib/firecrawl.ts`

---

### US-2.7: Simplified Project Listing `BUILT`
**As a** user, **I want** the main page to show only "My projects" with a maximum of 8 rows **so that** the page loads quickly and stays clean.

**Acceptance Criteria:**
- [x] "Recently viewed" and "Templates" tabs removed
- [x] Single "My projects" heading replaces tab switcher
- [x] Grid shows max 32 cards (8 rows x 4 cols at xl breakpoint)
- [x] "Browse all" link visible when projects exist, navigates to `/projects`

**Files:** `components/vibe-site-page.tsx`

---

### US-2.8: Cached Thumbnail Snapshots `BUILT`
**As a** user, **I want** project thumbnails to load instantly **so that** I don't wait for a full Sandpack render every time I visit the main page.

**Acceptance Criteria:**
- [x] After project generation completes, rendered HTML is captured via PostMessage from Sandpack iframe
- [x] Captured HTML saved to `/data/snapshots/{id}.html` via POST `/api/funnel/{id}/snapshot`
- [x] Main page and browse-all page load thumbnails from snapshot API (`/api/funnel/{id}/snapshot`) instead of `/preview-react/{id}`
- [x] Snapshot iframe renders static HTML (no Sandpack boot, instant load)
- [x] Placeholder gradient shown if no snapshot exists
- [x] After chat edit, old snapshot invalidated (deleted server-side) and new snapshot captured
- [x] Capture script injected into Sandpack bridge App.tsx, listens for `capture-html` PostMessage

**Files:** `app/api/funnel/[id]/snapshot/route.ts`, `components/react-preview.tsx`, `app/generate/[id]/page.tsx`, `app/api/chat/route.ts`, `components/vibe-site-page.tsx`

---

### US-2.9: Browse All Projects Page `BUILT`
**As a** user, **I want** a dedicated page to browse all my projects with search **so that** I can find any project even when I have many.

**Acceptance Criteria:**
- [x] Page at `/projects` with HighLevelLayout (sidebar, "Vibe Creator" active tab)
- [x] "All projects" heading with back arrow to home
- [x] Project count displayed next to heading
- [x] Search bar filters projects by name (client-side, instant)
- [x] Clear button on search input
- [x] Same responsive grid as main page (1-2-3-4 cols)
- [x] First 24 cards shown (6 rows x 4 cols)
- [x] "Load more" button at bottom loads next 24, shows remaining count
- [x] Empty state for no projects
- [x] Empty search state: "No projects matching '{query}'"
- [x] Snapshot iframe thumbnails (same as main page)

**Files:** `app/projects/page.tsx`

---

## Theme 3: Prompt Box (Main Page)

### US-3.1: Prompt Input with Submit `BUILT`
**As a** user, **I want** to describe what site I want in a text box and submit **so that** AI generates it for me.

**Acceptance Criteria:**
- [x] Textarea with placeholder "Describe the site you want to create..."
- [x] Enter submits (Shift+Enter for newline)
- [x] Submit button with gradient styling (yellow → blue → green)
- [x] Disabled state while generating (spinner icon replaces arrow)
- [x] Error message display below prompt box
- [x] Prompt data stored in sessionStorage and navigates to `/generate/new`
- [x] Clone from URL input above the textarea

**Files:** `components/vibe-site-page.tsx`

---

### US-3.2: LLM Model Selector `BUILT`
**As a** user, **I want** to choose which AI model to use **so that** I can pick between speed and quality.

**Acceptance Criteria:**
- [x] Dropdown selector in prompt box footer area
- [x] Default: Gemini 3 Flash Preview (faster)
- [x] Alternative: Gemini 3 Pro Preview (most powerful)
- [x] Selected model passed to generation API
- [x] Model labels show capability hint (e.g., "Default, faster" vs "Most powerful")

**Files:** `components/model-data.ts`, `components/vibe-site-page.tsx`

---

### US-3.3: Image Upload in Prompt `PARTIAL`
**As a** user, **I want** to upload reference images with my prompt **so that** AI can use them for design inspiration.

**Acceptance Criteria:**
- [x] "+" button opens native file picker (`accept="image/*"`)
- [x] Multiple images can be selected in one operation
- [x] Images resized client-side to max 1024px dimension, JPEG at 0.8 quality, PNG preserved
- [x] Thumbnails (56x56px) shown below prompt textarea
- [x] Individual images can be removed by clicking X on thumbnail
- [x] Images passed as base64 data URLs to generation API
- [x] Loading state shown while images are being processed
- [ ] **Max 10 images** — after 10 images, the + button is disabled with a tooltip "Maximum 10 images"
- [ ] **Max 5MB per image** — files over 5MB show an error toast: "Image exceeds 5MB limit" and are not added
- [ ] Total count shown (e.g., "3/10 images")

**Files:** `lib/image-utils.ts`, `components/vibe-site-page.tsx`, `components/image-upload.tsx`

---

### US-3.4: Plan Mode on Main Page `PENDING`
**As a** user, **I want** to enable "Plan mode" before submitting my prompt **so that** the AI asks me structured questions to understand my needs better before generating.

**Acceptance Criteria:**

**Toggle & Activation:**
- [ ] "Plan" toggle button in prompt box footer (next to model selector and submit button)
- [ ] Visual indicator when Plan mode is active (e.g., button highlighted, "Plan" label shown)
- [ ] When Plan mode is ON and user submits prompt, user lands in canvas with Plan mode active in the prompt box

**Structured Questions Flow (see image1 — Questions card with radio options):**
- [ ] In the chat area, AI presents structured clarifying questions in a card/form format
- [ ] Each question card shows:
  - Question text at top (e.g., "What type of real estate business do you have?")
  - "Select one answer" label
  - Radio button options, each with bold title and subtitle description
  - "Other" option with free-text input field
- [ ] Navigation controls at bottom of question card:
  - `<` and `>` arrows to go back/forward between questions
  - "Skip all" button to skip remaining questions
  - "Next" button (blue, primary) to proceed to next question
- [ ] Questions are contextual and relevant to the user's prompt (generated by LLM)
- [ ] Questions enable end-to-end workflow for best output (business type, goals, features, design style, etc.)

**Open-Ended Follow-ups (see image2 — Suggested answer chips):**
- [ ] After structured questions, LLM may ask 2-3 open-ended text questions in the chat
- [ ] Open questions limited to 2-3 maximum that require free-text answers
- [ ] For open-ended questions, short suggested answers appear as clickable chips above the prompt box
- [ ] Clicking a chip fills in a longer, more detailed version of the answer into the prompt box
- [ ] User can edit the filled answer before submitting
- [ ] After answering, user sees a summary card of all collected answers (e.g., "Business type: Residential sales, Page goal: Generate leads, Design style: Modern & minimal, Features: Contact form, Other")

**Answer Review:**
- [ ] After all questions are answered, user sees a review screen with all their answers
- [ ] User can go back and change any answer by clicking on it
- [ ] "Continue" or "Generate Plan" button to proceed

**Plan Document (see image3 — Plan in canvas view):**
- [ ] A plan document is generated as a structured markdown document
- [ ] Plan shows in the canvas area with sections like:
  - Project title and description
  - Sections breakdown (Navigation, Hero, Services, Contact Form, Footer, etc.)
  - Design Style specifications
  - Technical details
- [ ] Top bar changes: "Plan" text in the center, "Approve" CTA (blue) on right, "Close" (X) on left
- [ ] Preview/Code toggle is replaced by Close button on the left
- [ ] In the chat panel, "Plan" appears as selected context in the prompt box
- [ ] User can type to ask edits to the plan (e.g., "add a testimonials section")

**Plan Approval & Execution (see image4 — Approved state):**
- [ ] "Approve" button in top bar triggers site generation from the plan
- [ ] After approval, plan card in chat shows "Approved" badge (green) and "View" button
- [ ] Chat shows generation progress:
  - "Finished thinking" status
  - "Building your real estate landing page now." message
  - Expandable action card showing what's being edited (e.g., "Editing index.css")
  - Todo list with current action (e.g., "Update design system colors", "Create all landing page sections")
- [ ] Generation proceeds using the approved plan as the full specification
- [ ] Plan can be viewed at any time by clicking "View" on the plan card

**Implementation Notes:** This is a major feature requiring: (1) Plan mode UI toggle, (2) Structured question rendering component, (3) Question generation prompt for LLM, (4) Answer collection and review UI, (5) Plan document generation prompt, (6) Plan canvas viewer, (7) Plan approval flow, (8) Plan-to-generation pipeline.

---

## Theme 4: Prompt Box (Canvas/Editor)

### US-4.1: Chat-Based Editing `BUILT`
**As a** user, **I want** to describe changes in the chat and have AI apply them **so that** I can iteratively improve my site.

**Acceptance Criteria:**
- [x] Chat input at bottom of left panel with text field and send button
- [x] User messages shown right-aligned in white bubbles with gray border
- [x] AI responses shown left-aligned as plain text (no bubble, full width)
- [x] Bouncing dots loading indicator while AI processes
- [x] "Stop generating" button to cancel ongoing operation
- [x] Changes applied to project files and preview auto-refreshes
- [x] Chat history persisted across page reloads (stored in project JSON)
- [x] Last 10 chat messages sent to AI for context continuity
- [x] Initial welcome message: "I've created your project with X files. You can ask me to make changes..."

**Files:** `app/generate/[id]/page.tsx`, `app/api/chat/route.ts`

---

### US-4.2: LLM Model Selector in Canvas `BUILT`
**As a** user, **I want** to change the AI model while editing **so that** I can switch between speed and quality mid-session.

**Acceptance Criteria:**
- [x] Model selector available (uses `editModel` state)
- [x] Default set to the model used during initial generation
- [x] Changing model affects all subsequent edit requests

**Files:** `app/generate/[id]/page.tsx`

---

### US-4.3: Image Upload in Canvas Chat `PARTIAL`
**As a** user, **I want** to attach reference images to my edit messages **so that** AI can see visual examples of what I want.

**Acceptance Criteria:**
- [x] "+" button in chat input opens file picker
- [x] Multiple images can be attached per message
- [x] Thumbnails shown above chat input before sending (removable)
- [x] Images shown in the chat message bubble after sending
- [x] Images passed to the edit API as base64
- [x] Lightbox preview with copy/download for sent images
- [ ] **Max 10 images per message** — disable picker after 10
- [ ] **Max 5MB per image** — show error toast for oversized files

**Files:** `app/generate/[id]/page.tsx`, `lib/image-utils.ts`

---

### US-4.4: Plan Mode in Canvas `PENDING`
**As a** user, **I want** to activate Plan mode while editing an existing project **so that** I can plan complex changes before the AI executes them.

**Acceptance Criteria:**
- [ ] "Plan" toggle in canvas prompt box (similar to main page plan toggle)
- [ ] When Plan mode is active, AI generates a plan document instead of making direct code changes
- [ ] Plan shown in the chat window initially (existing preview remains as-is in canvas)
- [ ] User can "Approve" or ask to "Edit" the plan
- [ ] If editing, plan opens in canvas view replacing the preview:
  - Top bar: "Plan" in center, "Approve" on right, "Close" (X) on left
  - Plan document displayed as formatted markdown
- [ ] In prompt box, "Plan" appears as selected context chip
- [ ] User can type to request plan modifications
- [ ] User can click "Back to preview" to return to the site preview without approving
- [ ] On approval, AI executes all planned changes in sequence
- [ ] Plan mode auto-activates for complex tasks if LLM determines it's necessary
- [ ] During plan mode, no direct code execution happens until approval

**Implementation Notes:** Shares components with US-3.4. Canvas plan mode is simpler as it doesn't need the structured question flow — just plan generation, review, and execution.

---

### US-4.5: Visual Edit Mode `PENDING`
**As a** user, **I want** to select elements on the preview canvas and edit them visually **so that** I can make precise, targeted design changes by pointing at what I want to change.

**Acceptance Criteria:**

**Activation:**
- [ ] "Design" mode option in top bar toggle (alongside Preview and Code)
- [ ] When Design mode is selected, it's highlighted in the toggle; others show as icons only
- [ ] Design mode renders the same preview but with an interactive overlay

**Element Selection:**
- [ ] On hover over any element in the preview, show a tooltip with the HTML element type (e.g., `<h1>`, `<span>`, `<div>`, `<button>`)
- [ ] Hovering highlights the element with a subtle outline (e.g., dashed blue border)
- [ ] Clicking an element selects it — selected state shows a solid blue outline
- [ ] Selected element info shown in the prompt box area (e.g., "Editing: `<h1>` Hero Title")
- [ ] Only one element can be selected at a time
- [ ] Clicking elsewhere or pressing Escape deselects

**Editing:**
- [ ] With an element selected, user types instructions in the prompt box
- [ ] AI receives the selected element's tag, text content, and surrounding context
- [ ] AI applies changes only to the selected element and its immediate context
- [ ] Preview updates after edit; element remains selected for further edits

**Exit:**
- [ ] Close button (X) in top right of canvas to exit visual edit mode
- [ ] Switching to Preview or Code mode also exits visual edit mode
- [ ] All other top bar controls (device selector, page switcher, share, publish) remain accessible

**Implementation Notes:** Requires postMessage bridge between parent frame and Sandpack iframe for element inspection. Need to inject a hover/click handler script into the Sandpack preview.

---

## Theme 5: Chat Features

### US-5.1: Thinking Preview & Todo List `PENDING`
**As a** user, **I want** to see the AI's thinking process and a progress checklist **so that** I understand what it's doing and can track progress of complex operations.

**Acceptance Criteria (see image5):**

**Thinking Section:**
- [ ] When AI processes a request, show a collapsible "thinking" section at the top of the AI response
- [ ] Collapsed state shows: "Thought for Xs" (e.g., "Thought for 7s")
- [ ] Clicking expands to show the AI's internal reasoning/analysis text
- [ ] Thinking text is styled in a muted/italic format to distinguish from the response

**Action Summary:**
- [ ] Below thinking, show a brief summary of what AI is doing (e.g., "Implementing all 8 CRO optimizations now")
- [ ] An expandable card shows the detailed action plan (e.g., "Let me implement the full plan. I'll create all ne...")
- [ ] Card has expand/collapse chevron

**Todo/Progress Checklist:**
- [ ] Inside the action card, show a checklist of sub-tasks
- [ ] Each item has a radio/checkbox indicator showing status (pending ○ / in-progress ◉ / completed ●)
- [ ] Items update in real-time as AI processes (e.g., "Create new CRO components" ○, "Update existing components" ○)
- [ ] Current action text shown below checklist (e.g., "Reviewing plan elements for CRO improvements")
- [ ] Completed items show a filled indicator

**Implementation Notes:** Requires streaming response from AI API or structured response format with thinking/todos. May need a new response schema from `lib/gemini.ts`.

---

### US-5.2: Clarifying Questions in Form Format `PENDING`
**As a** user, **I want** the AI to ask me structured clarifying questions when it needs more information **so that** it can produce better, more targeted results.

**Acceptance Criteria (see image1):**
- [ ] AI can return structured question objects (not just plain text) as part of its response
- [ ] Questions rendered as styled form cards in the chat area
- [ ] Each question card shows:
  - Question text as a header
  - "Select one answer" instruction
  - Radio button options, each with:
    - Bold label (e.g., "Residential sales")
    - Description subtitle (e.g., "Helping people buy and sell homes")
  - "Other" option with expandable free-text input
- [ ] Navigation controls: `<` Previous, `>` Next arrows, "Skip all" link, "Next" button (blue)
- [ ] User selects an answer and clicks Next to proceed
- [ ] Selected answers collected and sent back to AI
- [ ] Works in both plan mode (main page) and canvas chat
- [ ] AI uses answers to inform generation or editing decisions
- [ ] After all questions answered, answers shown as summary in chat

**Implementation Notes:** Requires structured response parsing from Gemini. Questions could be JSON-formatted in the AI response, parsed client-side into form components.

---

### US-5.3: Image Preview in Chat `PARTIAL`
**As a** user, **I want** to preview, copy, and download images I've attached to chat messages **so that** I can manage my reference images easily.

**Acceptance Criteria:**
- [x] Image thumbnails shown in chat message bubbles
- [x] Clicking a thumbnail opens full-size lightbox popup
- [x] Lightbox has "Copy to clipboard" button (using ClipboardItem API)
- [x] Lightbox has "Download" button (saves as file)
- [x] Lightbox has "Close" (X) button
- [ ] Images displayed directly above the submitted prompt text in the same message container (currently they're in a separate bubble above)

**Files:** `components/image-upload.tsx`

---

### US-5.4: Restore/Revert to Version `PENDING`
**As a** user, **I want** to restore my project to a previous state at any AI response **so that** I can undo changes I don't like.

**Acceptance Criteria (see image6 — "5 messages reverted" banner):**

**UI Elements:**
- [ ] Below each AI response (after the first response), show action icons: restore/revert icon, thumbs up, thumbs down
- [ ] Icons are small, subtle, and only fully visible on hover over the message

**Restore Action:**
- [ ] Clicking the restore icon shows a confirmation: "Restore to this version? Changes after this point will be hidden."
- [ ] Confirming restores the project files to the state they were in after that AI response
- [ ] All messages below the restored message are hidden (not permanently deleted)
- [ ] A banner appears where the hidden messages were: "{X} messages reverted" with a "Show" link
- [ ] Clicking "Show" reveals the hidden messages again (but doesn't restore their file changes)

**Data Requirements:**
- [ ] Each AI response in chat history must store a snapshot of the project files at that point
- [ ] Snapshot stored as `filesSnapshot: Record<string, string>` on the ChatMessage object
- [ ] Restoring means replacing the current `funnel.files` with the snapshot from the selected message
- [ ] Snapshot must be saved when the `/api/chat` response is processed

**Preview Updates:**
- [ ] After restore, Sandpack preview refreshes with the restored files
- [ ] Code view refreshes if open
- [ ] Subsequent edits continue from the restored state

**Implementation Notes:** This requires modifying the `ChatMessage` interface in `lib/storage.ts` to include `filesSnapshot`. The `/api/chat` endpoint must save the full file state after each successful edit. Storage size will increase significantly — consider compression or storing only diffs.

---

### US-5.5: Feedback (Thumbs Up/Down) `PENDING`
**As a** user, **I want** to rate AI responses with thumbs up or down **so that** I can provide feedback on quality.

**Acceptance Criteria:**
- [ ] Below each AI response message, show thumbs up (👍) and thumbs down (👎) icon buttons
- [ ] Icons are subtle/gray by default, colored on hover
- [ ] Clicking thumbs up:
  - Button fills/highlights in green
  - Feedback recorded (positive)
  - Brief visual confirmation (button stays highlighted)
- [ ] Clicking thumbs down:
  - Button fills/highlights in red
  - A popover/modal appears with:
    - Text: "What went wrong?"
    - Textarea for optional comments
    - "Submit" button and "Cancel" link
  - After submitting (with or without comments), feedback recorded
- [ ] Toast notification at bottom-left: "Thanks for your feedback" (auto-dismiss after 3s)
- [ ] Only one feedback state per message — clicking the other thumb toggles the selection
- [ ] Feedback persisted to storage (locally in project JSON or separate feedback store)
- [ ] Feedback data includes: message index, rating (up/down), optional comment, timestamp

**Implementation Notes:** Add `feedback?: { rating: 'up' | 'down'; comment?: string; timestamp: string }` to `ChatMessage` interface. Store in project JSON. Toast notification component needed.

---

### US-5.6: Resizable Chat Panel `BUILT`
**As a** user, **I want** to drag the divider between chat and canvas to resize the chat panel **so that** I can allocate more or less space to the chat.

**Acceptance Criteria:**
- [x] A draggable divider at the canvas border edge
- [x] Cursor changes to `col-resize` on hover over the divider
- [x] Invisible handle — no visible UI, just cursor change at canvas edge
- [x] Dragging resizes the chat panel width in real-time
- [x] Minimum width: 280px
- [x] Maximum width: 500px
- [x] Default width: 320px
- [x] Chat content reflows smoothly during resize (no overflow clipping)
- [x] Canvas/preview adjusts its width to fill remaining space
- [x] Resize preference persisted in localStorage for session continuity
- [x] Double-clicking the divider resets to default width
- [x] Collapse button still available to fully hide the panel

**Implementation Notes:** Replace fixed `w-80` class with dynamic width state. Implement mouse event handlers (mousedown on divider, mousemove to track, mouseup to finish).

---

## Theme 6: Context Management

### US-6.1: Image Context Panel `PENDING`
**As a** user, **I want** a dedicated context area to manage all uploaded reference images across my project **so that** I can easily preview, reuse, or remove them.

**Acceptance Criteria:**
- [ ] "Context" section accessible from the editor (tab or collapsible section in the chat panel, or a side panel)
- [ ] Shows all images uploaded across the project lifecycle:
  - Initial prompt images
  - Images from subsequent chat messages
- [ ] Each image displayed as a thumbnail in a grid layout
- [ ] Click thumbnail to open full-size lightbox preview
- [ ] Each thumbnail has action buttons on hover:
  - Copy to clipboard
  - Download
  - Remove from context
- [ ] Remove shows confirmation: "Remove this image from context?"
- [ ] Image context persists across sessions (stored in project data)
- [ ] Count indicator: "X images in context"
- [ ] Empty state: "No images uploaded yet. Attach images to your prompts for better results."

**Implementation Notes:** Images are currently stored inline in `promptImages` and `chatHistory[].images` as base64. Context panel would aggregate these. Consider whether removed images should be removed from chat history display too.

---

## Theme 7: Canvas/Editor Top Bar

### US-7.1: Preview / Code / Design Mode Toggle `PARTIAL`
**As a** user, **I want** to switch between Preview, Code, and Design viewing modes **so that** I can interact with my site in different ways.

**Acceptance Criteria:**
- [x] Preview mode: Live Sandpack rendering of the React project (default)
- [x] Code mode: Syntax-highlighted source code with file tree sidebar
- [ ] Design mode: Preview with interactive element selection overlay (see US-4.5)
- [x] Active mode shows icon + label; inactive modes show only icons (compact toggle)
- [x] Smooth visual transition between modes
- [ ] Keyboard shortcuts: Cmd/Ctrl+1 (Preview), Cmd/Ctrl+2 (Code), Cmd/Ctrl+3 (Design)

**Files:** `app/generate/[id]/page.tsx`

**Implementation Notes:** Preview and Code now use compact toggle (selected shows icon+label, unselected shows icon only). Design mode button still needed.

---

### US-7.2: Page Switcher `BUILT`
**As a** user, **I want** to switch between pages of my multi-page site using a dropdown **so that** I can view and edit each page.

**Acceptance Criteria:**
- [x] Dropdown in top bar showing all routes extracted from `App.tsx`
- [x] First/home page shown as "/"
- [x] Route labels derived from component names (e.g., "About", "Services")
- [x] Selecting a route navigates the Sandpack preview to that hash route
- [x] Dropdown only appears when multiple routes exist

**Files:** `app/generate/[id]/page.tsx` (pageRoutes useMemo)

---

### US-7.3: Device Emulation `BUILT`
**As a** user, **I want** to preview my site at different screen sizes **so that** I can verify responsive design.

**Acceptance Criteria:**
- [x] Device selector in top bar with Desktop, Tablet, Mobile options
- [x] Desktop: 100% width (fills canvas)
- [x] Tablet: 768px x 1024px
- [x] Mobile: 375px x 812px
- [x] Device dimensions label shown below preview for non-desktop modes
- [x] Preview container animates to the selected device size

**Files:** `app/generate/[id]/page.tsx` (DEVICES constant)

---

### US-7.4: Share Preview Link `PENDING`
**As a** user, **I want** to generate and copy a shareable preview link from the top bar **so that** I can quickly share my work with others.

**Acceptance Criteria:**
- [ ] "Share" button in top bar (already exists visually, needs functionality)
- [ ] Clicking opens a popover/modal with:
  - Title: "Share preview"
  - The full URL displayed in a read-only input field
  - "Copy link" button next to the input
  - Optional: "Open in new tab" link
- [ ] Clicking "Copy link" copies the URL to clipboard
- [ ] Toast confirmation: "Link copied!"
- [ ] URL format: `{origin}/preview-react/{funnel.id}`
- [ ] The preview page already exists at `/preview-react/[id]` — no backend changes needed
- [ ] Popover closes when clicking outside or pressing Escape

**Implementation Notes:** The full-screen preview page exists. This is purely a UI feature — build a popover component for the Share button.

---

### US-7.5: Publish `PENDING`
**As a** user, **I want** to publish my site to a live URL **so that** it's accessible to anyone on the internet.

**Acceptance Criteria:**
- [ ] "Publish" button in top bar (already exists visually, needs functionality)
- [ ] First publish:
  - Click shows a publish dialog with project name and confirmation
  - "Publish" button triggers deployment
  - Loading state during deployment
  - On success: show the published URL with copy button
- [ ] Re-publish (after edits):
  - Button shows "Update" or "Republish" label
  - Indicator showing published version is behind current edits
  - Click updates the deployed version
- [ ] Published URL format: TBD (e.g., `{projectSlug}.vibesite.app` or Vercel deployment)
- [ ] Status indicator in top bar: "Draft" (unpublished) or "Published" with green dot
- [ ] Published sites are static exports of the React project

**Implementation Notes:** Requires a deployment target (Vercel, Netlify, custom hosting). Could start with Vercel Blob static hosting or a simple static file server. This is an architectural decision.

---

### US-7.6: Generate Page UI Redesign `BUILT`
**As a** user, **I want** the editor page to have a clean, modern look with clear visual separation between chat and canvas **so that** the interface feels polished and professional.

**Acceptance Criteria:**
- [x] Top bar and chat panel share unified `#F9FAFB` background (no dividing borders between them)
- [x] Canvas area distinguished by its own subtle grey border with `rounded-2xl` corners
- [x] No border between chat panel and canvas — separated by color difference only
- [x] Chat input area seamless with chat messages (no border-top divider), white input on light bg
- [x] Preview/Code as separate individual tab buttons (each with own rounded border)
- [x] Center pill bar in top bar: device cycle toggle (click to cycle desktop→tablet→mobile, icon changes), page selector (always shown), open-in-tab, refresh
- [x] All top bar icons use `strokeWidth={2}` and darker colors (`text-gray-500`/`text-gray-600`) for better visibility
- [x] Uniform `h-8` height across all top bar buttons (Preview, Code, Share, Publish)
- [x] Text bumped to `text-sm` for project name, toggles, and action buttons
- [x] Hero section on main page uses `83vh` min-height for better visual balance

**Files:** `app/generate/[id]/page.tsx`, `components/vibe-site-page.tsx`

---

### US-7.7: Chat Area & Top Bar Refinements `BUILT`
**As a** user, **I want** the chat area and top bar to feel clean and modern with clear visual hierarchy **so that** conversations are easy to read and navigation is intuitive.

**Acceptance Criteria:**
- [x] User prompt bubbles use white background with gray border (not blue) and uniform `rounded-2xl` on all corners
- [x] Date and time shown above each user prompt (e.g. "18 Feb at 19:55")
- [x] LLM responses rendered as plain text at full chat width (no bubble/background)
- [x] Chat text uses `font-sans` at `14.5px`, timestamps at `12.5px`
- [x] Sparkle gradient logo (rounded-lg) replaces left-arrow icon beside project name
- [x] Clicking logo/project name opens dropdown with "Go to Dashboard" → navigates to `/`
- [x] Chevron rotates when dropdown is open; click-outside closes it
- [x] Sidebar panel icon for chat collapse/expand toggle
- [x] Smooth curtain-style collapse/expand animation — text stays fixed, container clips over it
- [x] Project name, version history, and collapse/expand icons always visible (even when collapsed)
- [x] Consistent `pl-5 pr-3` padding across chat area, top bar, and chat input
- [x] Minimum chat panel width set to 20% of viewport width

**Files:** `app/generate/[id]/page.tsx`

---

### US-7.8: Generation UX Overhaul `BUILT`
**As a** user, **I want** the editor page to look functional and alive during first-time generation **so that** the experience feels polished rather than blocked.

**Acceptance Criteria:**
- [x] Top bar shows Preview (pre-selected) and Code tabs during generation — no "Generating..." or "Stop" text in top bar
- [x] Center pill bar (device/page/refresh) visible during generation in preview mode (controls inert)
- [x] Code tab during generation shows simulated code-writing animation: file tree populates one by one, code types out with cursor blink in dark theme
- [x] Simulated files include realistic React project structure (index.html, App.tsx, pages, components, CSS)
- [x] Top bar center shows "Building..." in code mode during generation
- [x] Share and Publish buttons disabled with `opacity-50` and "Creation in Progress" tooltip during generation
- [x] Chat input area shows normal form layout during generation: input disabled, upload disabled with "Creation in Progress" tooltip
- [x] Send button replaced with solid black square stop icon during generation — clicking stops generation
- [x] All simulated state resets when generation completes and real content loads

**Files:** `app/generate/[id]/page.tsx`

---

## Theme 8: Code View & Export

### US-8.1: Code Viewer with File Tree `BUILT`
**As a** user, **I want** to browse and read the generated source code in a structured file tree **so that** I can understand and learn from the generated project.

**Acceptance Criteria:**
- [x] Toggle to "Code" mode in top bar switches the canvas to code viewer
- [x] Left sidebar shows nested file tree built from project file paths
- [x] Folders expandable/collapsible with expand arrow and folder icon
- [x] Item count badge shown next to each folder
- [x] Color-coded file type icons (TSX=blue, TS/JS=yellow, CSS=purple, HTML=red, JSON=green)
- [x] Default expanded folders: `/src`, `/src/pages`, `/src/components`
- [x] Search/filter input at top of file tree to find files by name or path
- [x] Click a file to open it in the editor area
- [x] Multi-tab interface: multiple files can be open simultaneously
- [x] Active tab highlighted with blue top border; close (X) button on each tab
- [x] Syntax highlighting via highlight.js (TypeScript, JavaScript, JSON, CSS, HTML/XML)
- [x] Dark theme (github-dark) for the code editor
- [x] Line numbers displayed alongside code
- [x] File path breadcrumb shown above the code content
- [x] "Select a file to view its code" placeholder when no file is selected
- [x] `/src/App.tsx` opened by default when entering code view

**Files:** `app/generate/[id]/page.tsx` (code view section, ~lines 1380-1554)

---

### US-8.2: Code Copy & Download `BUILT`
**As a** user, **I want** to copy file content or download the entire project as a ZIP **so that** I can use the generated code in my own development environment.

**Acceptance Criteria:**
- [x] "Copy" button in file action bar copies the active file content to clipboard
- [x] "Copied!" confirmation shown for 2 seconds after copying
- [x] "Download" dropdown with two options:
  - "This file ({filename})" — downloads the single active file
  - "All files as ZIP ({count} files)" — downloads full project as ZIP archive
- [x] ZIP preserves folder structure (e.g., `/src/pages/About.tsx`)
- [x] ZIP created client-side using jszip library
- [x] Download triggers browser's native save dialog
- [x] Dropdown closes when clicking outside

**Files:** `app/generate/[id]/page.tsx` (handleCopyFile, handleDownloadFile, handleDownloadAll)

---

## Theme 9: Canvas Preview & Interaction

### US-9.1: Generation Progress Overlay `BUILT`
**As a** user, **I want** to see an animated progress indicator while my site is being generated **so that** I know the system is working and roughly how far along it is.

**Acceptance Criteria:**
- [x] Full-canvas overlay with animated gradient background (blobs + sweep)
- [x] Wireframe skeleton animation behind the progress indicator (nav bar, hero, 3-card grid)
- [x] Centered progress card with pulsing sparkle icon
- [x] 9-step rotating status messages:
  1. Analyzing your requirements
  2. Designing component architecture
  3. Building React components
  4. Setting up routing
  5. Generating page content
  6. Styling with Tailwind CSS
  7. Adding animations & interactions
  8. Connecting all pages
  9. Finalizing your project
- [x] Progress bar that ramps from 0% to ~85% during generation, then jumps to 100% on completion
- [x] Percentage text below progress bar
- [x] "Stop" / "Stop generating" button to cancel generation (in top bar and chat panel)
- [x] Aborted state: "Generation cancelled" message with "Try again" and "Go back" options
- [x] Error state: "Generation failed" message with error details and retry button
- [x] In chat panel: user's prompt shown as blue bubble, bouncing dots for AI thinking

**Files:** `app/generate/[id]/page.tsx` (GENERATION_STEPS, generating overlay section ~lines 1252-1355)

---

### US-9.2: Open in New Tab `BUILT`
**As a** user, **I want** to open my site preview in a full browser tab **so that** I can see it without the editor chrome.

**Acceptance Criteria:**
- [x] "Open in new tab" icon button in the top bar (external link icon)
- [x] Clicking opens `/preview-react/{funnel.id}` in a new browser tab
- [x] Preview page renders the full React project at 100vw x 100vh
- [x] No editor UI, sidebar, or controls — just the rendered website
- [x] Uses dynamic import of Sandpack (no SSR)
- [x] Loading state while Sandpack initializes

**Files:** `app/preview-react/[id]/page.tsx`, `app/generate/[id]/page.tsx` (open in new tab button)

---

### US-9.3: Chat Panel Collapse/Expand `BUILT`
**As a** user, **I want** to collapse and expand the chat panel **so that** I can maximize the canvas area when I don't need the chat.

**Acceptance Criteria:**
- [x] Collapse button (resize icon) in the top bar area above the chat panel
- [x] Clicking collapses the chat panel to 0px width with smooth transition
- [x] When collapsed, a chat bubble icon button is shown to re-expand
- [x] Canvas/preview area expands to fill the freed space
- [x] Top bar adjusts: project name area shrinks when collapsed
- [x] Transition animated with `transition-all duration-200`

**Files:** `app/generate/[id]/page.tsx` (chatCollapsed state)

---

### US-9.4: In-Canvas Navigation `PARTIAL`
**As a** user, **I want** to click links and buttons within the preview to navigate between pages **so that** I can test the site's navigation experience.

**Acceptance Criteria:**
- [x] HashRouter-based navigation works within the Sandpack iframe
- [x] Clicking internal `<Link>` components navigates between routes
- [x] `ScrollToTop` component resets scroll position on route changes
- [ ] When user clicks a link inside the preview, the page selector dropdown in the top bar updates to reflect the new current page
- [ ] External links (href starting with http) open in a new browser tab instead of navigating within the iframe
- [ ] Anchor links (#section) scroll to the target element within the current page

**Implementation Notes:** Syncing the page selector requires a postMessage bridge from the Sandpack iframe to the parent. The bridge script injected in `react-preview.tsx` could emit route change events.

---

## Theme 10: Error Handling & Resilience

### US-10.1: Error Handling Flows `BUILT`
**As a** user, **I want** the system to handle errors gracefully with clear messages and recovery options **so that** I'm never stuck without recourse.

**Acceptance Criteria:**
- [x] **Generation failure**: Error message displayed on full-screen error page with "Try again" and "Go back" buttons
- [x] **Generation aborted**: "Generation was cancelled" message with retry and back options (both in canvas and chat panel)
- [x] **Chat edit failure**: Error message shown as AI response bubble in chat ("Error: {message}. Please try again.")
- [x] **Chat edit stopped**: "Generation stopped. No changes were made." message in chat
- [x] **Funnel not found**: "Failed to load funnel" message with link to go home
- [x] **JSON parsing resilience**: 3-tier fallback — direct parse → jsonrepair → custom extractFilesFromTruncated() for truncated AI output
- [x] **Legacy funnel edit**: Error shown when trying to chat-edit a legacy HTML funnel
- [x] **AbortController cleanup**: Proper cleanup on component unmount to prevent memory leaks
- [x] **Silent fail for non-critical**: Project listing, code loading fail silently without breaking the UI

**Files:** `app/generate/[id]/page.tsx` (error states), `lib/gemini.ts` (JSON parsing), `app/api/chat/route.ts` (validation)

---

## Theme 11: Agentic Capabilities

### US-11.1: Tool Calls `PENDING`
**As a** user, **I want** the AI to be able to use tools (web search, code reading, screenshots) **so that** it produces better-informed, more accurate results.

**Acceptance Criteria:**

**Available Tools:**
- [ ] **Web Search**: AI can search the internet for current information (APIs, design trends, competitor sites, documentation)
- [ ] **Code Reading**: AI can read/reference specific files in the current project for precise context
- [ ] **Screenshot Capture**: AI can take screenshots of the current generated pages for visual analysis

**UI Indicators:**
- [ ] When AI uses a tool, show an inline indicator in the chat (e.g., "🔍 Searching the web for 'modern SaaS pricing pages'...")
- [ ] Tool usage shown as collapsible cards with the tool name and a brief result summary
- [ ] Tool results feed into the AI's decision-making (not shown raw to user unless expanded)

**Transparency:**
- [ ] Tool calls are visible but not obtrusive — collapsed by default
- [ ] User can expand to see what was searched/read/captured
- [ ] If a tool fails, show a brief error and continue with available context

**Implementation Notes:** Requires Gemini function calling / tool use API integration. Web search could use Google Search API or Serper. Code reading already exists implicitly (full files sent to context). Screenshots would require rendering the Sandpack preview as an image.

---

### US-11.2: Multiple Specialized Agents `PENDING`
**As a** user, **I want** the AI to use specialized agents for different types of tasks **so that** each task gets expert-level handling.

**Acceptance Criteria:**

**Agent Types:**
- [ ] **Intent Detection Agent**: Classifies incoming user requests into: create, edit, delete, plan, SEO, image generation, clone, general question
- [ ] **Plan/Clarification Agent**: Generates structured questions, builds plan documents
- [ ] **Creation Agent**: Generates new projects from scratch with optimal prompts
- [ ] **Editing Agent**: Handles targeted modifications to existing projects
- [ ] **Deletion Agent**: Handles component/page/section removal cleanly
- [ ] **SEO Agent**: Optimizes meta tags, headings, content structure, alt text for search engines
- [ ] **Image Generation Agent**: Creates AI-generated images for use in the site
- [ ] **Clone Agent**: Handles URL-to-project cloning with Firecrawl

**Routing & UX:**
- [ ] Agent selection is automatic based on intent detection (no manual user selection)
- [ ] Optionally show which agent is handling the request (e.g., "SEO Agent" label on the response)
- [ ] Agents can chain — e.g., intent detects "optimize for SEO" → routes to SEO agent → SEO agent calls editing agent for implementation
- [ ] Each agent has specialized system prompts for their domain

**Implementation Notes:** Currently a single monolithic system prompt in `lib/gemini.ts`. Refactor into separate prompt files per agent. Add an intent classifier as the first step. Route to specialized prompts based on classification.

---

## Summary Table

| Theme | Total | Built | Partial | Pending |
|-------|-------|-------|---------|---------|
| 1. Navigation & Layout | 1 | 1 | 0 | 0 |
| 2. Project Management | 9 | 6 | 0 | 3 |
| 3. Prompt Box (Main) | 4 | 2 | 1 | 1 |
| 4. Prompt Box (Canvas) | 5 | 2 | 1 | 2 |
| 5. Chat Features | 6 | 1 | 1 | 4 |
| 6. Context Management | 1 | 0 | 0 | 1 |
| 7. Canvas Top Bar | 8 | 5 | 1 | 2 |
| 8. Code View & Export | 2 | 2 | 0 | 0 |
| 9. Canvas Preview & Interaction | 4 | 3 | 1 | 0 |
| 10. Error Handling & Resilience | 1 | 1 | 0 | 0 |
| 11. Agentic Capabilities | 2 | 0 | 0 | 2 |
| **TOTAL** | **43** | **23** | **5** | **15** |

---

## Recommended Implementation Order

### Batch 1: Quick Wins (Low Effort, High Value)
1. **US-2.5** Project Delete — API + confirmation dialog + list removal
2. **US-2.2** Project Rename — Kebab menu + inline edit + API
3. **US-5.5** Feedback (Thumbs Up/Down) — Icons + popup + local storage
4. **US-3.3 / US-4.3** Image Upload Validations — Max count/size checks (complete partial)

### Batch 2: Medium Effort
5. **US-5.6** Resizable Chat Panel — Drag divider + width state
6. **US-2.3** Project Clone — Clone API + list refresh
7. **US-2.4 / US-7.4** Share Preview Link — Popover UI + copy link
8. **US-5.4** Restore/Revert to Version — File snapshots + restore logic
9. **US-9.4** Canvas Navigation Sync — postMessage bridge for route changes (complete partial)

### Batch 3: High Effort (Core Features)
10. **US-5.1** Thinking Preview & Todo List — Structured AI response + UI components
11. **US-5.2** Clarifying Questions in Form — Question card component + structured response parsing
12. **US-3.4** Plan Mode (Main Page) — Full plan flow with questions, plan doc, approval
13. **US-4.4** Plan Mode (Canvas) — Canvas plan generation and approval
14. **US-4.5 / US-7.1** Visual Edit Mode & Design Toggle — Element selection + postMessage bridge

### Batch 4: Strategic (Architecture)
15. **US-6.1** Image Context Panel — Aggregated image management
16. **US-7.5** Publish — Deployment pipeline
17. **US-11.1** Tool Calls — Gemini function calling + web search
18. **US-11.2** Multiple Agents — Intent detection + specialized prompts

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `app/page.tsx` | Home page with tab routing |
| `app/generate/[id]/page.tsx` | Main editor/builder page (~1560 lines) |
| `app/preview-react/[id]/page.tsx` | Full-screen React preview |
| `components/vibe-site-page.tsx` | Home hero, prompt box, project grid |
| `components/react-preview.tsx` | Sandpack wrapper for live preview |
| `components/image-upload.tsx` | Image thumbnails + lightbox |
| `components/highlevel-layout.tsx` | Sidebar navigation layout |
| `components/funnels-page.tsx` | Funnels table view |
| `components/model-data.ts` | AI model definitions |
| `lib/gemini.ts` | AI generation/editing + system prompts |
| `lib/storage.ts` | File-based project persistence |
| `lib/image-utils.ts` | Client-side image processing |
| `lib/image-gen.ts` | AI image generation + Vercel Blob |
| `lib/firecrawl.ts` | URL scraping via Firecrawl |
| `app/api/generate/route.ts` | Project generation API |
| `app/api/chat/route.ts` | Chat/edit API |
| `app/api/funnels/route.ts` | Project listing API |
| `app/api/funnel/[id]/route.ts` | Single project fetch API |
| `app/api/funnel/[id]/code/route.ts` | Code files API |
| `app/api/funnel/[id]/snapshot/route.ts` | Snapshot HTML cache API |
| `app/api/scrape/route.ts` | URL scraping API |
| `app/projects/page.tsx` | Browse all projects page |
