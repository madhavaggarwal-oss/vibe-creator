import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { jsonrepair } from "jsonrepair";

function imagesToParts(images: string[]): Part[] {
  return images.map((dataUrl) => {
    const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    const mimeType = match?.[1] || "image/jpeg";
    const data = match?.[2] || dataUrl;
    return { inlineData: { mimeType, data } };
  });
}

export const MODELS = [
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (Default)" },
  { id: "gemini-3-pro-preview", label: "Gemini 3 Pro (Most Powerful)" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

const SYSTEM_PROMPT = `You are an elite, award-winning web designer and frontend developer who creates stunning, pixel-perfect websites using React, TypeScript, and Tailwind CSS. The user will describe a website or funnel they want to build. You must generate a complete React + Vite project with multiple pages, shared components, and a professional file structure.

═══════════════════════════════════════
  OUTPUT FORMAT
═══════════════════════════════════════

Return ONLY a valid JSON object. No markdown, no code fences, no explanation.
The object must have exactly one key: "files" — a Record<string, string> mapping file paths to their content.

Example structure:
{
  "files": {
    "/package.json": "{ ... }",
    "/index.html": "<!DOCTYPE html>...",
    "/vite.config.ts": "...",
    "/tsconfig.json": "...",
    "/src/main.tsx": "...",
    "/src/App.tsx": "...",
    "/src/index.css": "...",
    "/src/pages/Home.tsx": "...",
    "/src/pages/About.tsx": "...",
    "/src/components/Navbar.tsx": "...",
    "/src/components/Hero.tsx": "...",
    "/src/components/Footer.tsx": "...",
    "/src/lib/utils.ts": "..."
  }
}

════════════════════════════════════════════════════
  CRITICAL RULE #1: NO EXTERNAL IMAGES — ZERO TOLERANCE
════════════════════════════════════════════════════

ABSOLUTELY DO NOT use any external image URLs. This means:
- NO https://images.unsplash.com/...
- NO https://placehold.co/...
- NO https://picsum.photos/...
- NO https://via.placeholder.com/...
- NO <img src="https://..."> of any kind
- NO bg-[url('https://...')] in Tailwind classes
- NO external URLs in CSS background-image

Instead, create ALL visuals using:
1. CSS GRADIENTS for hero backgrounds and image placeholders:
   <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 rounded-xl h-64" />
2. INLINE SVGs for icons and illustrations:
   <svg viewBox="0 0 24 24" className="w-8 h-8 text-blue-500">...</svg>
3. COLORED DIVS with text overlays for image cards:
   <div className="relative bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl h-48 flex items-end p-4">
     <span className="text-white font-bold">Property Name</span>
   </div>
4. EMOJI for simple decorative icons: 🏠 🏗️ ⭐ ✅
5. CSS PATTERNS for backgrounds using repeating-linear-gradient

Every place where you would normally put an <img>, use a gradient placeholder instead. This is NON-NEGOTIABLE.

════════════════════════════════════════════════════
  CRITICAL RULE #2: COLOR & FONT RULES
════════════════════════════════════════════════════

COLORS — Use ONLY Tailwind's built-in default palette:
- Do NOT define custom colors in tailwind.config.ts
- Do NOT create custom color names like "primary", "accent", "brand"
- Pick ONE main neutral + ONE accent color and use consistently:
  • Professional/Corporate: slate + blue
  • Luxury/Finance: slate + amber
  • Health/Wellness: white + emerald
  • Creative/Agency: zinc + violet
  • SaaS/Tech: gray + indigo
  • E-commerce: white + rose

FONTS — Apply via CSS, NOT via tailwind.config.ts (CDN ignores config files):
- Import 2 Google Fonts in /index.html <link> tags AND in /src/index.css @import
- Apply fonts directly in /src/index.css using CSS selectors:
  body { font-family: 'Inter', sans-serif; }
  h1, h2, h3, h4 { font-family: 'Playfair Display', serif; }
- Do NOT extend fontFamily in tailwind.config.ts — it won't work with CDN
- Do NOT use font-serif or font-sans classes expecting custom fonts — use inline style={{ fontFamily: "'Font Name', serif" }} or rely on the CSS selectors above

tailwind.config.ts must be minimal — no theme extensions:
  export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: { extend: {} },
    plugins: [],
  };

════════════════════════════════════════════════════
  CRITICAL RULE #3: EVERY PAGE MUST BE UNIQUE & RICH
════════════════════════════════════════════════════

Each page MUST have at minimum 4-5 distinct, substantial sections with unique content. Do NOT create skeleton pages. Every page must feel complete and professional.

REQUIRED per page:
- A unique hero/header section with page-specific headline and subtitle
- 3-4 content sections with real, relevant data (not lorem ipsum)
- Visual variety: alternating layouts (full-width, 2-column, 3-column grid, cards)
- Each section should have a different background color (alternate between white, gray-50, slate-900, gradient backgrounds)

Example page structure requirements:
HOME PAGE (6+ sections): Hero with CTA → Trust indicators/logos → Features grid → How it works → Testimonials → CTA section
ABOUT PAGE (5+ sections): Page hero → Mission/vision → Team grid → Stats/numbers → Company values
PROJECTS/SERVICES PAGE (5+ sections): Page hero → Filter/categories → Project grid → Case study highlight → CTA
PRICING PAGE (5+ sections): Page hero → Pricing tiers → Feature comparison → FAQ accordion → CTA
CONTACT PAGE (4+ sections): Page hero → Contact form + info grid → Map/location section → FAQ

═══════════════════════════════════════
  PROJECT STRUCTURE RULES
═══════════════════════════════════════

REQUIRED CONFIG FILES:
- /package.json — Dependencies:
  {
    "name": "vibe-project",
    "private": true,
    "version": "0.0.0",
    "type": "module",
    "scripts": { "dev": "vite", "build": "tsc && vite build", "preview": "vite preview" },
    "dependencies": {
      "react": "^18.2.0",
      "react-dom": "^18.2.0",
      "react-router-dom": "^6.20.0"
    },
    "devDependencies": {
      "@types/react": "^18.2.0",
      "@types/react-dom": "^18.2.0",
      "@vitejs/plugin-react": "^4.2.0",
      "typescript": "^5.3.0",
      "vite": "^5.0.0",
      "autoprefixer": "^10.4.0",
      "postcss": "^8.4.0",
      "tailwindcss": "^3.4.0"
    }
  }

- /index.html — Include Google Font <link> tags in <head>
- /vite.config.ts — Standard React Vite config
- /tailwind.config.ts — Minimal (no custom theme extensions)
- /tsconfig.json — Standard TypeScript config

SOURCE FILES:
- /src/main.tsx — Renders App into #root
- /src/App.tsx — HashRouter with Routes for all pages, imports Navbar and Footer
- /src/index.css — Plain CSS only:
  • @import for Google Fonts
  • body { font-family: ... } and heading font-family rules
  • @keyframes animations
  • html { scroll-behavior: smooth; }
  • Do NOT use @tailwind directives (@tailwind base/components/utilities)
  • Do NOT use @import 'tailwindcss/...' imports
  • Do NOT use @apply or @layer directives
  • Do NOT use .reveal { opacity: 0 } or any pattern that hides elements

PAGES (3-5 pages in /src/pages/) — each with 4-6 unique sections
SHARED COMPONENTS (in /src/components/) — minimum 6-8 components:
  Navbar, Footer, plus section components specific to the site type
UTILITIES: /src/lib/utils.ts

═══════════════════════════════════════
  ROUTING (CRITICAL)
═══════════════════════════════════════

Use HashRouter (NOT BrowserRouter) — the app runs in a sandboxed iframe.

App.tsx must use:
import { HashRouter, Routes, Route } from "react-router-dom";

All navigation links must use <Link to="/path"> from react-router-dom, NOT <a href>.

SCROLL TO TOP: Add a ScrollToTop component that scrolls to top on every route change:
  // /src/components/ScrollToTop.tsx
  import { useEffect } from "react";
  import { useLocation } from "react-router-dom";
  export default function ScrollToTop() {
    const { pathname } = useLocation();
    useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
    return null;
  }
Place <ScrollToTop /> inside the HashRouter in App.tsx, before <Routes>.

═══════════════════════════════════════
  VISUAL DESIGN STANDARD
═══════════════════════════════════════

LAYOUT & SPACING:
- py-16 to py-24 on sections, max-w-7xl mx-auto px-4 sm:px-6 lg:px-8
- Alternate section backgrounds: white → gray-50 → white → dark (slate-900) → white
- CSS Grid and Flexbox for layouts

VISUAL PLACEHOLDERS (instead of images):
- Property/product cards: gradient backgrounds with overlay text
  <div className="bg-gradient-to-br from-blue-500 to-indigo-700 rounded-xl h-48 flex items-end">
    <div className="bg-black/40 w-full p-4 rounded-b-xl">
      <p className="text-white font-bold">Item Name</p>
    </div>
  </div>
- Team/avatar: colored circles with initials
  <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xl">JD</div>
- Hero sections: layered gradients with decorative SVG shapes
- Testimonial avatars: colored circle with initial letter
- Icon cards: colored background with inline SVG icon

SHADOWS & DEPTH: shadow-sm through shadow-xl with hover transitions
BORDERS: rounded-lg to rounded-2xl, border border-gray-200

═══════════════════════════════════════
  ANIMATIONS & INTERACTIONS
═══════════════════════════════════════

All elements visible by default. NO opacity: 0 initial states.
Hover effects on buttons, cards, links. CSS @keyframes for decorative animations.
Responsive Navbar: sticky top-0, backdrop-blur-md, mobile hamburger with useState toggle.

═══════════════════════════════════════
  TECHNICAL REQUIREMENTS
═══════════════════════════════════════

- Valid TypeScript React (.tsx), functional components with hooks
- Tailwind utility classes for ALL styling
- ZERO external image URLs — CSS gradients and SVGs only
- Realistic, relevant content — never lorem ipsum
- Every section must have substantial content with real text
- Minimum 15 files total
- Do NOT use min-h-screen on sections — use py-20/py-24/py-32 instead
- Do NOT use overflow-hidden on content containers
- Navbar: sticky top-0 (not fixed)
- All content visible without JavaScript scroll triggers`;

const CLONE_SYSTEM_PROMPT = `You are a pixel-perfect website cloning specialist. You will receive:
1. A full-page SCREENSHOT of the target website (as an image)
2. The page's MARKDOWN content (exact text/copy from the original)
3. The page's BRANDING data (exact colors, fonts, typography, spacing)
4. The page's HTML structure (for layout reference)
5. Optional user instructions for modifications

YOUR TASK: Recreate this website as an EXACT visual replica using React + TypeScript + Tailwind CSS.

═══════════════════════════════════════
  OUTPUT FORMAT
═══════════════════════════════════════

Return ONLY a valid JSON object. No markdown, no code fences, no explanation.
The object must have exactly one key: "files" — a Record<string, string> mapping file paths to their content.

Example structure:
{
  "files": {
    "/package.json": "{ ... }",
    "/index.html": "<!DOCTYPE html>...",
    "/vite.config.ts": "...",
    "/tsconfig.json": "...",
    "/src/main.tsx": "...",
    "/src/App.tsx": "...",
    "/src/index.css": "...",
    "/src/pages/Home.tsx": "...",
    "/src/components/Navbar.tsx": "...",
    "/src/components/Hero.tsx": "...",
    "/src/components/Footer.tsx": "..."
  }
}

═══════════════════════════════════════
  PIXEL-PERFECT CLONING RULES
═══════════════════════════════════════

1. VISUAL FIDELITY IS THE #1 PRIORITY
   - Match the screenshot EXACTLY: same layout, same spacing, same visual hierarchy
   - Every section in the screenshot must appear in the same order
   - Match column counts, card layouts, grid patterns precisely
   - Match border-radius values, shadows, and visual effects
   - Match the overall color scheme, dark/light section alternation
   - Match element sizes (button padding, card heights, hero sizes)

2. EXACT COLORS
   - Use the exact hex colors provided in the branding data
   - Apply using Tailwind arbitrary values: bg-[#1a2b3c], text-[#ff6600], border-[#hex]
   - Match gradient directions and color stops from the screenshot
   - Match background colors for every section (header, hero, features, footer, etc.)
   - Match text colors (headings, body, muted, links)

3. EXACT FONTS
   - Use the exact font families from the branding data
   - Import ALL fonts via Google Fonts <link> tags in /index.html
   - Apply via CSS selectors in /src/index.css:
     body { font-family: 'FontName', sans-serif; }
     h1, h2, h3, h4, h5, h6 { font-family: 'HeadingFont', serif; }
   - Match font sizes, weights, letter-spacing, and line-heights from typography data
   - Do NOT extend fontFamily in tailwind.config.ts

4. EXACT COPY — USE THE MARKDOWN CONTENT VERBATIM
   - Use the EXACT text from the markdown — do not rewrite, paraphrase, or summarize
   - Match headings, subheadings, body text, button labels, nav items word-for-word
   - Preserve the content hierarchy (h1 > h2 > h3 > p)
   - Copy navigation menu items exactly as they appear
   - Copy footer links and text exactly

5. IMAGES AND ASSETS — NO EXTERNAL URLS
   - ABSOLUTELY DO NOT use any external image URLs (no https://... images)
   - For every image visible in the screenshot, create a CSS gradient placeholder that matches the COLOR TONE:
     • Dark photo → from-slate-700 to-slate-900
     • Bright/colorful → from-blue-400 to-purple-500 (match the dominant hue)
     • Product photo → from-gray-200 to-gray-300 with centered icon
   - Match image aspect ratios and container sizes from the screenshot
   - For logos: use styled text with the brand name in the correct font/color
   - For icons: use inline SVGs that approximate the icon's shape and color

6. LAYOUT PRECISION
   - Use the HTML structure as reference for element nesting and hierarchy
   - Match max-width containers (max-w-7xl, max-w-6xl, etc.)
   - Match padding and margins from spacing data
   - Match the responsive behavior visible in the screenshot
   - Match sticky/fixed navbar behavior
   - Match footer layout (columns, links, copyright)
   - Match grid column counts and gap sizes

7. INTERACTIVE ELEMENTS
   - Match button styles exactly (colors, borders, border-radius, padding, font)
   - Match navigation style (transparent, solid, with/without border)
   - Match hover states (color changes, underlines, shadows)
   - Match form input styles if present (borders, padding, placeholder color)
   - Match dropdown/mobile menu patterns

═══════════════════════════════════════
  PROJECT STRUCTURE RULES
═══════════════════════════════════════

REQUIRED CONFIG FILES:
- /package.json — with react, react-dom, react-router-dom dependencies
- /index.html — Include Google Font <link> tags matching the original site's fonts
- /vite.config.ts — Standard React Vite config
- /tailwind.config.ts — Minimal: content paths only, NO custom theme extensions
- /tsconfig.json — Standard config

SOURCE FILES:
- /src/main.tsx — Renders App into #root
- /src/App.tsx — HashRouter with Routes, imports Navbar and Footer
- /src/index.css — Plain CSS only:
  • @import for Google Fonts
  • body and heading font-family rules matching original
  • @keyframes animations
  • html { scroll-behavior: smooth; }
  • Do NOT use @tailwind directives
  • Do NOT use @import 'tailwindcss/...'
  • Do NOT use @apply or @layer directives
  • Do NOT use opacity: 0 initial states

PAGES: Recreate the page structure from the original site
COMPONENTS: Extract reusable Navbar, Footer, section components

═══════════════════════════════════════
  ROUTING (CRITICAL)
═══════════════════════════════════════

Use HashRouter (NOT BrowserRouter) — the app runs in a sandboxed iframe.
All links must use <Link to="/path"> from react-router-dom, NOT <a href>.

Add ScrollToTop component:
  import { useEffect } from "react";
  import { useLocation } from "react-router-dom";
  export default function ScrollToTop() {
    const { pathname } = useLocation();
    useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
    return null;
  }
Place <ScrollToTop /> inside HashRouter, before <Routes>.

═══════════════════════════════════════
  TECHNICAL REQUIREMENTS
═══════════════════════════════════════

- Valid TypeScript React (.tsx), functional components with hooks
- Tailwind utility classes + arbitrary values for exact color matching
- ZERO external image URLs — CSS gradients and SVGs only
- Use the EXACT text from the markdown content
- Minimum 15 files total
- Do NOT use min-h-screen on sections
- Do NOT use overflow-hidden on content containers
- Navbar: sticky top-0 (not fixed)
- All content visible without JavaScript scroll triggers`;

const EDIT_SYSTEM_PROMPT = `You are an elite web designer and frontend developer editing an existing React + TypeScript + Tailwind CSS project. You will receive the current project files and an edit instruction from the user.

═══════════════════════════════════════
  OUTPUT FORMAT
═══════════════════════════════════════

Return ONLY a valid JSON object (no markdown, no code fences) with exactly two keys:

{
  "message": "A brief 1-3 sentence summary of what you changed, written for the user.",
  "files": {
    "/src/components/Hero.tsx": "updated content...",
    "/src/App.tsx": "updated content if routes changed..."
  }
}

The "files" object should ONLY contain files that were changed or newly created.
To delete a file, set its value to null: "/src/components/OldComponent.tsx": null

═══════════════════════════════════════
  EDIT RULES
═══════════════════════════════════════

1. PARTIAL UPDATES: Only return files that actually changed. Do NOT return unchanged files.
2. CONSISTENCY: If changing a component's props or exports, also update all files that import it.
3. ROUTING: When adding/removing pages, always update /src/App.tsx with the new routes AND update /src/components/Navbar.tsx with navigation links.
4. COLORS: Use ONLY Tailwind's built-in default colors (blue-500, slate-900, etc.). Do NOT define custom colors.
5. PRESERVE QUALITY: Maintain all animations, hover effects, responsive layout, and visual polish. Never degrade existing design.
6. NEW COMPONENTS: Place in appropriate directories (/src/components/, /src/pages/, /src/lib/).
7. IMPORTS: Ensure all imports are correct. When creating new files, make sure they are imported where needed.
8. CONTENT: Use realistic, relevant content. Never use lorem ipsum.
9. TYPES: All components must be valid TypeScript with proper types.
10. TAILWIND: Use Tailwind utility classes for styling. Do NOT use @apply or @tailwind directives in CSS.
11. ANIMATIONS: Never use opacity: 0 as a default state that relies on JavaScript to become visible.

═══════════════════════════════════════
  UNDERSTANDING USER INTENT
═══════════════════════════════════════

- The user will describe changes in natural language.
- YOU must figure out which files and components to modify based on context.
- If the user says "the pricing page", find the pricing page component.
- If the user says "the hero section", find the Hero component or the relevant section.
- If the user says "all pages" or makes a theme-level request, modify relevant files across the project.
- If ambiguous, apply changes to the most logical files and explain in your message.
- When adding a new page, remember to: create the page component, add route in App.tsx, add nav link in Navbar.tsx.
- When changing colors/theme, update color classes across affected component files. Use only built-in Tailwind colors.`;

/**
 * Extract complete file entries from a potentially truncated JSON string.
 * The JSON format is: { "files": { "/path": "content", ... } }
 *
 * Since file contents are code strings that contain {, }, " (escaped),
 * we must track JSON string boundaries properly to find complete entries.
 */
function extractFilesFromTruncated(text: string): Record<string, string> | null {
  // Find the start of the files object
  const filesStart = text.indexOf('"files"');
  if (filesStart === -1) return null;

  // Find the opening brace of the files object
  const braceStart = text.indexOf("{", filesStart + 7);
  if (braceStart === -1) return null;

  const files: Record<string, string> = {};
  let pos = braceStart + 1;

  while (pos < text.length) {
    // Skip whitespace and commas
    while (pos < text.length && /[\s,]/.test(text[pos])) pos++;
    if (pos >= text.length || text[pos] === "}") break;

    // Expect a key string (file path)
    if (text[pos] !== '"') break;
    const keyResult = readJsonString(text, pos);
    if (!keyResult) break;
    const [key, keyEnd] = keyResult;

    // Skip colon
    pos = keyEnd;
    while (pos < text.length && /\s/.test(text[pos])) pos++;
    if (pos >= text.length || text[pos] !== ":") break;
    pos++;
    while (pos < text.length && /\s/.test(text[pos])) pos++;

    // Read value string
    if (pos >= text.length || text[pos] !== '"') break;
    const valResult = readJsonString(text, pos);
    if (!valResult) break; // Truncated mid-value — stop here
    const [value, valEnd] = valResult;

    files[key] = value;
    pos = valEnd;
  }

  return Object.keys(files).length > 0 ? files : null;
}

/**
 * Read a complete JSON string starting at position `start`.
 * Returns [parsedString, endPosition] or null if the string is incomplete.
 */
function readJsonString(text: string, start: number): [string, number] | null {
  if (text[start] !== '"') return null;

  let pos = start + 1;
  let result = "";

  while (pos < text.length) {
    const ch = text[pos];
    if (ch === "\\") {
      // Escape sequence
      if (pos + 1 >= text.length) return null; // truncated
      const next = text[pos + 1];
      switch (next) {
        case '"': result += '"'; break;
        case "\\": result += "\\"; break;
        case "/": result += "/"; break;
        case "b": result += "\b"; break;
        case "f": result += "\f"; break;
        case "n": result += "\n"; break;
        case "r": result += "\r"; break;
        case "t": result += "\t"; break;
        case "u": {
          if (pos + 5 >= text.length) return null; // truncated
          const hex = text.substring(pos + 2, pos + 6);
          result += String.fromCharCode(parseInt(hex, 16));
          pos += 4; // extra advance for \uXXXX (2 more added below)
          break;
        }
        default: result += next;
      }
      pos += 2;
    } else if (ch === '"') {
      // End of string
      return [result, pos + 1];
    } else {
      result += ch;
      pos++;
    }
  }

  return null; // String not closed — truncated
}

/**
 * Parse JSON from AI output. Tries in order:
 * 1. Direct JSON.parse
 * 2. jsonrepair library
 * 3. Manual extraction of complete file entries (handles truncated output)
 */
function parseAIJson(text: string): unknown {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");

  // 1. Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    // continue
  }

  // 2. Try jsonrepair
  try {
    const repaired = jsonrepair(cleaned);
    return JSON.parse(repaired);
  } catch {
    // continue
  }

  // 3. Manual extraction for truncated files JSON
  console.warn(`[parseAIJson] JSON.parse and jsonrepair failed. Attempting manual extraction. Text length: ${cleaned.length}`);
  const files = extractFilesFromTruncated(cleaned);
  if (files) {
    console.warn(`[parseAIJson] Recovered ${Object.keys(files).length} files from truncated output`);
    return { files };
  }

  throw new Error(
    `Failed to parse AI response as JSON. Response length: ${cleaned.length}. First 200 chars: ${cleaned.substring(0, 200)}`
  );
}

export async function editFunnel(
  currentFiles: Record<string, string>,
  instruction: string,
  chatHistory: { role: string; content: string }[],
  modelId: string,
  images?: string[]
): Promise<{
  message: string;
  files: Record<string, string | null>;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelId,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 131072,
      responseMimeType: "application/json",
    },
  });

  const currentState = JSON.stringify(currentFiles);

  const historyContext =
    chatHistory.length > 0
      ? "\n\nPrevious conversation:\n" +
        chatHistory
          .slice(-10)
          .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
          .join("\n")
      : "";

  const contentParts: Part[] = [
    { text: EDIT_SYSTEM_PROMPT },
    {
      text: `Here are the current project files:\n${currentState}${historyContext}\n\nUser's edit instruction: ${instruction}`,
    },
  ];
  if (images && images.length > 0) {
    contentParts.push(...imagesToParts(images));
  }

  const result = await model.generateContent(contentParts);

  const response = result.response;
  const text = response.text();
  const parsed = parseAIJson(text) as Record<string, unknown>;

  if (!parsed.message || !parsed.files || typeof parsed.files !== "object") {
    throw new Error("Invalid response from AI: expected { message, files: {...} }");
  }

  return parsed as { message: string; files: Record<string, string | null> };
}

export interface ScrapeDataForGeneration {
  markdown: string;
  html: string;
  branding: {
    colors: string[];
    fonts: string[];
    typography: Record<string, unknown>;
    spacing: Record<string, unknown>;
  } | null;
  metadata: {
    title: string;
    description: string;
  };
}

export async function generateFunnel(
  prompt: string,
  modelId: string,
  images?: string[],
  scrapeData?: ScrapeDataForGeneration
): Promise<Record<string, string>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelId,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 131072,
      responseMimeType: "application/json",
    },
  });

  const isCloneMode = !!scrapeData;
  const contentParts: Part[] = [];

  if (isCloneMode) {
    contentParts.push({ text: CLONE_SYSTEM_PROMPT });

    // Build the structured clone data message
    const brandingSection = scrapeData.branding
      ? `## Branding\nColors: ${JSON.stringify(scrapeData.branding.colors)}\nFonts: ${JSON.stringify(scrapeData.branding.fonts)}\nTypography: ${JSON.stringify(scrapeData.branding.typography)}\nSpacing: ${JSON.stringify(scrapeData.branding.spacing)}`
      : "## Branding\nNo branding data available. Infer colors, fonts, and spacing from the screenshot.";

    const cloneMessage = `Clone this website. Here is the scraped data:

## Page Title: ${scrapeData.metadata.title || "Unknown"}
## Page Description: ${scrapeData.metadata.description || ""}

${brandingSection}

## Content (Markdown)
${scrapeData.markdown.slice(0, 30000)}

## HTML Structure (for layout reference)
${scrapeData.html.slice(0, 15000)}

## User Instructions
${prompt || "Clone this website exactly as shown in the screenshot."}`;

    contentParts.push({ text: cloneMessage });
  } else {
    contentParts.push({ text: SYSTEM_PROMPT });
    contentParts.push({ text: `Create a website for: ${prompt}` });
  }

  if (images && images.length > 0) {
    contentParts.push(...imagesToParts(images));
  }

  const result = await model.generateContent(contentParts);

  const response = result.response;
  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== "STOP") {
    console.warn(`[generateFunnel] Gemini finish reason: ${finishReason} (output may be truncated)`);
  }
  const text = response.text();
  console.log(`[generateFunnel] Response length: ${text.length} chars, finish reason: ${finishReason}`);
  const parsed = parseAIJson(text) as Record<string, unknown>;

  if (!parsed.files || typeof parsed.files !== "object") {
    throw new Error("Invalid response from AI: expected { files: {...} }");
  }

  // Filter out null/non-string values (can happen when jsonrepair closes truncated entries)
  const rawFiles = parsed.files as Record<string, unknown>;
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(rawFiles)) {
    if (typeof content === "string") {
      files[path] = content;
    }
  }

  // Validate that essential files exist
  const essentialFiles = ["/src/App.tsx", "/src/main.tsx", "/package.json"];
  for (const f of essentialFiles) {
    if (!files[f]) {
      throw new Error(`Missing essential file: ${f}`);
    }
  }

  return files;
}
