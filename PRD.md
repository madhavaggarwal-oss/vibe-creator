# Vibe Creator - Product Requirements Document (PRD)

## 1. Overview

**Product Name:** Vibe Creator
**Platform:** Web application (Next.js)
**Purpose:** AI-powered website builder that generates complete React + Tailwind CSS projects from natural language prompts and reference images, with live preview, iterative chat-based editing, and full code export.

---

## 2. User Personas

- **Small business owners** who need a website quickly without coding knowledge
- **Marketers** building landing pages and multi-page sites
- **Designers** who want to go from mockup/screenshot to working code

---

## 3. Core User Flows

### Flow 1: Create New Website
1. User lands on the Vibe Creator home page
2. Types a prompt describing the site they want (e.g., "A SaaS landing page for an AI writing tool")
3. Optionally uploads reference images (screenshots, mockups, inspiration)
4. Selects AI model (Gemini 3 Flash or Gemini 3 Pro)
5. Clicks generate (or presses Enter)
6. Redirected to the builder page with animated progress overlay
7. AI generates a full React + Tailwind project (15+ files)
8. Live preview renders in the canvas area

### Flow 2: Edit Website via Chat
1. User views the generated site in the builder
2. Types an edit request in the chat panel (e.g., "Make the hero section darker and add a pricing page")
3. Optionally attaches reference images
4. AI returns updated files with an explanation
5. Preview refreshes automatically
6. Chat history is preserved for context-aware follow-up edits

### Flow 3: Review & Export Code
1. User switches to the "Code" tab in the builder
2. Browses the file tree (searchable, nested folders)
3. Clicks files to view syntax-highlighted code
4. Copies individual files or downloads the entire project as a ZIP

### Flow 4: Browse & Manage Projects
1. Home page displays a grid of previously created projects
2. Each project shows a live iframe thumbnail preview
3. Click a project to reopen it in the builder
4. Projects persist across sessions (stored on disk)

---

## 4. Pages & Navigation

### 4.1 Home Page (`/`)
- **Hero section** with animated gradient background (3 moving blobs, gradient sweep)
- **"New" badge** with tagline "Build sites with AI in seconds"
- **Heading:** "What's on your mind?"
- **Prompt input card:**
  - Multi-line textarea (3 rows) with placeholder text
  - Submit on Enter (Shift+Enter for newline)
  - "+" button to attach images
  - Model selector dropdown (Gemini 3 Flash / Gemini 3 Pro)
  - Gradient submit button (yellow-blue-green)
- **Image attachment area:**
  - Thumbnails (56x56px) displayed between textarea and action bar
  - Loading spinner while processing
  - Remove (X) button on hover
  - Click to open lightbox
- **Projects section:**
  - Three tabs: "Recently viewed", "My projects", "Templates"
  - 4-column responsive grid (1/2/3/4 columns at breakpoints)
  - Each card: live iframe thumbnail (1440x900 scaled to 20%), project name, relative timestamp
  - Loading skeleton animation while fetching
  - Empty state with icon and helper text
  - "Browse all" link

### 4.2 Builder Page (`/generate/[id]`)
- **Top bar:**
  - Back button (home link)
  - Project name (editable display)
  - Page route selector (dropdown of all pages/routes)
  - Device toggle: Desktop / Tablet / Mobile
  - View toggle: Preview / Code
  - "Open in new tab" button
  - Chat panel collapse/expand toggle

- **Left panel - Chat:**
  - Scrollable chat message history
  - User messages (blue bubbles, right-aligned)
  - AI messages (white bubbles with border, left-aligned)
  - Images displayed above their associated message (read-only thumbnails)
  - Chat input form with:
    - "+" button for image attachment
    - Text input placeholder: "Describe changes you want..."
    - Submit button
  - During generation: bouncing dots animation
  - Stop generation button (red)
  - Abort/retry controls when generation is cancelled

- **Right panel - Preview mode:**
  - Sandpack-rendered React app in responsive container
  - Device frame sizing (desktop: 100%, tablet: 768x1024, mobile: 375x812)
  - Rounded corners and shadow on container
  - Loading state while Sandpack boots (~2-3s)

- **Right panel - Code mode:**
  - File tree sidebar (left):
    - Nested folder structure with expand/collapse
    - File count badges on folders
    - Color-coded file type icons
    - Search/filter input
  - Code editor area (right):
    - Tab bar for open files (closable)
    - File path breadcrumb
    - Syntax-highlighted code (read-only)
    - Line numbers
    - Copy button with "Copied!" feedback
    - Download dropdown: current file or all as ZIP

- **Generation overlay (for new projects):**
  - Full-canvas animated background
  - Wireframe skeleton animation
  - 9-step progress indicator:
    1. Analyzing your requirements
    2. Designing the layout structure
    3. Building the navigation system
    4. Creating hero sections
    5. Developing page components
    6. Applying styles and themes
    7. Adding responsive breakpoints
    8. Optimizing performance
    9. Final polish and review
  - Progress bar with percentage
  - Cancel button

### 4.3 Full Preview Page (`/preview-react/[id]`)
- Full-viewport (100vw x 100vh) Sandpack preview
- No chrome/controls — just the rendered website
- Used for "Open in new tab" and listing thumbnails

### 4.4 Legacy HTML Preview (`/preview/[id]/[slug]`)
- Serves raw HTML for pre-React funnels
- Canvas mode disables links and form submissions

---

## 5. AI Generation

### 5.1 Models
| Model | ID | Use Case |
|---|---|---|
| Gemini 3 Flash | `gemini-3-flash-preview` | Default, faster generation |
| Gemini 3 Pro | `gemini-3-pro-preview` | Highest quality output |

### 5.2 Generation Rules
- **Output format:** JSON `{ files: { "/path": "code content", ... } }`
- **Project structure:** Full React + Vite + TypeScript + Tailwind CSS
- **Required files:** `/src/App.tsx`, `/src/main.tsx`, `/package.json` (minimum)
- **Typical output:** 15-20 files including pages, components, hooks, config
- **Routing:** HashRouter (required for Sandpack iframe compatibility)
- **Styling:** Tailwind CSS utility classes only, built-in colors only
- **Images:** NO external image URLs — use CSS gradients, inline SVGs, colored divs with icons
- **Fonts:** Google Fonts loaded via `<link>` in index.html + applied via CSS selectors
- **Content:** Rich, realistic content (never lorem ipsum), 4-6 unique sections per page
- **Visibility:** No `opacity: 0` initial states — all content visible by default
- **Scroll behavior:** ScrollToTop component on route changes
- **Max tokens:** 131,072 output tokens
- **Temperature:** 0.7

### 5.3 Edit Rules
- **Input:** Current file tree (JSON) + edit instruction + last 10 chat messages
- **Output:** `{ message: "explanation", files: { "/path": "new content" | null } }`
- **Partial updates:** Only changed/new files returned
- **File deletion:** `null` value removes a file
- **Context-aware:** Maintains conversation history for follow-up edits

### 5.4 Multimodal Support
- Users can attach images (screenshots, mockups) with both initial prompts and edit messages
- Images are resized client-side (max 1024px, JPEG 0.8 quality)
- Sent to Gemini as `inlineData` parts (base64 + mimeType)

### 5.5 JSON Parsing Resilience
Three-tier approach for handling AI output:
1. Direct `JSON.parse()`
2. `jsonrepair` library for malformed JSON
3. Custom `extractFilesFromTruncated()` parser for token-limit truncation

---

## 6. Preview System

### 6.1 Sandpack Integration
- Uses `@codesandbox/sandpack-react` for in-browser React rendering
- Template: `react-ts`
- External resources: Tailwind CDN (`cdn.tailwindcss.com`) + Google Fonts
- CSS transformations before rendering:
  - Strip `@tailwind base/components/utilities` directives
  - Strip `@import 'tailwindcss/...'` imports
  - Comment out `@apply` rules
  - Comment out `@layer` blocks
  - Fix `.reveal` classes (opacity 0 → 1)
- Bridge `App.tsx` injected to:
  - Import index.css
  - Handle hash-based navigation
  - Scroll to top on route change
  - Re-export from `/src/App`

### 6.2 Page Switching
- Dropdown in top bar lists all routes (extracted from App.tsx `<Route>` elements)
- Switching pages injects `window.location.hash` into the Sandpack bridge file
- Scroll-to-top listener fires on every `hashchange` event

### 6.3 Device Emulation
- Desktop: Full width/height of container
- Tablet: 768px x 1024px centered
- Mobile: 375px x 812px centered

---

## 7. Image Upload

### 7.1 Upload Flow
1. User clicks "+" button (triggers hidden `<input type="file" accept="image/*" multiple>`)
2. Files are read and resized client-side (max 1024px longest side)
3. Converted to base64 data URLs (JPEG at 0.8 quality, PNG preserved)
4. Shown as 56x56px thumbnails with loading spinners

### 7.2 Image Preview (Thumbnails)
- Horizontal scrollable row of square thumbnails
- Loading spinner overlay while processing
- Remove (X) button on hover (unless read-only)
- Click to open lightbox

### 7.3 Lightbox (Full Preview)
- Rendered via React Portal to `document.body` (escapes overflow containers)
- Dark backdrop (70% black + backdrop blur)
- Top bar with:
  - Filename and "Image" label
  - **Download** button — saves image as file
  - **Copy** button — copies image to clipboard via `ClipboardItem` API
  - Close (X) button
- Image displayed at natural size (max 80vh height)
- Click backdrop to close

### 7.4 Image in Chat History
- Images attached to messages are stored as base64 data URLs in `ChatMessage.images`
- Displayed as read-only thumbnails above the message bubble (not inside it)
- Initial generation images stored in `Funnel.promptImages` and shown above the first prompt message
- Images shown during generation state (not just after completion)

### 7.5 Where Images Are Supported
| Location | Attach | Remove | Preview | Sent to AI |
|---|---|---|---|---|
| Main page prompt | Yes | Yes | Yes | Yes |
| Builder chat input | Yes | Yes | Yes | Yes |
| Chat history (submitted) | Read-only | No | Yes | N/A |
| Generation prompt (in progress) | Read-only | No | Yes | N/A |

---

## 8. Code View

### 8.1 File Tree
- Nested folder structure built from file paths
- Expandable/collapsible folders with item count badges
- Color-coded file type icons (TSX=blue, CSS=purple, JSON=yellow, HTML=orange, etc.)
- Search/filter input to find files by name
- Click file to open in editor tab

### 8.2 Code Editor (Read-Only)
- Syntax highlighting via highlight.js
- Supported languages: TypeScript, JavaScript, JSON, CSS, HTML/XML
- Dark theme (github-dark)
- Line numbers displayed
- Multi-tab interface (open multiple files)
- Active tab indicated with blue top border

### 8.3 Code Actions
- **Copy:** Copies file content to clipboard, shows "Copied!" for 2 seconds
- **Download current file:** Downloads as individual file
- **Download all as ZIP:** Uses jszip to create full project archive preserving folder structure

---

## 9. Project Listing

### 9.1 Data Displayed
- Project name (extracted from `<title>` or package.json, fallback to prompt)
- Relative timestamp ("Just now", "Edited 2 hours ago", "Edited yesterday", etc.)
- Live iframe thumbnail preview (1440x900 at 20% scale)

### 9.2 Grid Layout
- Responsive: 1 column (mobile) → 2 (sm) → 3 (lg) → 4 (xl)
- Card height: 176px thumbnail + project info
- Hover: subtle shadow increase + border darkening
- Lazy-loaded iframes for performance

### 9.3 Thumbnail Preview
- React projects: iframe to `/preview-react/[id]`
- Legacy HTML projects: iframe to `/preview/[id]/[slug]`
- Scaled down with `transform: scale(0.2)` from 1440x900 origin
- `pointer-events: none` to prevent interaction

---

## 10. Data Model

### 10.1 Funnel (Project)
```
id: string (UUID)
name: string (auto-extracted or from prompt)
prompt: string (original user prompt)
promptImages: string[] (base64 data URLs from initial generation)
model: string (AI model used)
files: Record<string, string> (path → code content map)
chatHistory: ChatMessage[] (full conversation history)
createdAt: string (ISO timestamp)
pages: FunnelPage[] (legacy HTML format, empty for React projects)
```

### 10.2 ChatMessage
```
role: "user" | "assistant"
content: string (message text)
timestamp: string (ISO timestamp)
images: string[] (base64 data URLs, optional)
```

### 10.3 Storage
- Filesystem-based: `/data/{id}.json`
- No database dependency
- Full state serialized to JSON
- Read/write via Node.js `fs` module

---

## 11. API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/generate` | Generate new project from prompt + optional images |
| POST | `/api/chat` | Send edit instruction to modify existing project |
| GET | `/api/funnels` | List all projects (sorted by newest) |
| GET | `/api/funnel/[id]` | Get full project data |
| GET | `/api/funnel/[id]/code` | Get code files in structured format |
| POST | `/api/funnel/[id]/validate` | Validate HTML syntax (legacy) |

---

## 12. UI/UX Design

### 12.1 Color Palette
- **Brand gradient:** Yellow (`#FEC403`) → Blue (`#2896FB`) → Green (`#4BCF29`)
- **UI:** Tailwind gray scale (gray-50 through gray-900)
- **Chat user:** Blue-600 background, white text
- **Chat assistant:** White background, gray border, dark text
- **Code editor:** Dark theme (`#1e1e2e`, `#1b1b2f`, `#252540`)

### 12.2 Animations
- **Hero background:** 3 animated gradient blobs (10-14s cycles) + gradient sweep (8s)
- **Generation progress:** Wireframe skeleton fade-in, bouncing dots, progress bar
- **Loading states:** Pulse skeleton cards, spinning circles
- **Transitions:** All interactive elements use `transition-all` or `transition-colors`
- **Hover effects:** Scale (1.05x on submit button), shadow changes, color shifts

### 12.3 Responsive Behavior
- Chat panel collapsible (0px when collapsed, 320px when open)
- Preview container adapts to remaining space
- Project grid: 1→2→3→4 columns at breakpoints
- Mobile-friendly input areas

---

## 13. Technical Stack

| Category | Technology |
|---|---|
| Framework | Next.js 16.1.6 (App Router) |
| Language | TypeScript |
| UI | React 19, Tailwind CSS 4 |
| AI | Google Generative AI (Gemini 3) |
| Preview | Sandpack (@codesandbox/sandpack-react) |
| Syntax Highlighting | highlight.js |
| JSON Resilience | jsonrepair |
| ZIP Export | jszip |
| ID Generation | uuid v4 |
| Storage | Filesystem (JSON files) |

---

## 14. Backward Compatibility

- Legacy HTML funnels (pre-React migration) continue to work
- Detection: `isReactProject()` checks if `files` field exists with entries
- Legacy funnels use iframe preview to `/preview/[id]/[slug]`
- Legacy funnels cannot be edited via chat (error message shown)
- React projects use Sandpack preview

---

## 15. Error Handling

| Scenario | Behavior |
|---|---|
| Generation fails | Error message displayed, retry available |
| Generation aborted | "Generation was cancelled" message, retry/back buttons |
| JSON parsing fails | 3-tier fallback (parse → repair → extract) |
| Chat edit fails | Error message in chat bubble |
| Funnel not found | 404 response from API |
| Legacy funnel edit attempt | "Legacy HTML funnels cannot be edited" error |
| Image upload fails | Silent fail, image not added |
| Clipboard copy fails | Fallback to text copy |

---

## 16. Performance Optimizations

- **Dynamic imports:** Sandpack loaded with `next/dynamic` (no SSR)
- **Lazy loading:** Project thumbnail iframes use `loading="lazy"`
- **Memoization:** `useMemo` for file tree building, page route extraction, Sandpack file processing
- **Code splitting:** Automatic via Next.js route-based splitting
- **Image compression:** Client-side resize to max 1024px before base64 encoding
- **Selective rendering:** Only changed files sent in edit responses
