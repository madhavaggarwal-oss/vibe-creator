import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { jsonrepair } from "jsonrepair";
import { processImageMarkers } from "./image-gen";
import { getActiveTrace } from "./langfuse";
import { validateAndRepairFiles } from "./syntax-repair";

function imagesToParts(images: string[]): Part[] {
  return images.map((dataUrl) => {
    const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    const mimeType = match?.[1] || "image/jpeg";
    const data = match?.[2] || dataUrl;
    return { inlineData: { mimeType, data } };
  });
}

// Models are defined in components/model-data.ts (single source of truth)

const SYSTEM_PROMPT = `You are a world-class UI/UX designer and frontend engineer. You design websites that look like they were built by top design agencies — think Linear, Vercel, Stripe, Framer, Raycast quality. You produce production-grade React + TypeScript + Tailwind CSS projects.

The user will describe a website or landing page. Generate a complete, stunning React + Vite project.

═══════════════════════════════════════
  OUTPUT FORMAT
═══════════════════════════════════════

Return ONLY a valid JSON object. No markdown, no code fences, no explanation.
The object must have exactly one key: "files" — a Record<string, string> mapping file paths to their content.

{
  "files": {
    "/package.json": "...",
    "/index.html": "...",
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
  PAGE SCOPE
═══════════════════════════════════════

DEFAULT: Generate a SINGLE rich page (Home) with a Navbar and Footer — unless the user explicitly asks for multiple pages or the use case clearly requires them (e.g. "build a full website with about, pricing, contact pages").

A single-page site should have 6-10 substantial, distinct sections — this IS the full site. Pour all your design effort into making each section extraordinary.

When multiple pages ARE needed, each page must have 4-6 unique sections with real content. Never create skeleton/placeholder pages.

════════════════════════════════════════════════════
  DESIGN PHILOSOPHY — THIS IS THE MOST IMPORTANT SECTION
════════════════════════════════════════════════════

Your output must look like a PREMIUM, MODERN website from 2025 — not a generic Bootstrap/Tailwind template. Study what makes Linear, Vercel, Stripe, Raycast, Framer sites stunning and apply those principles:

THEME SELECTION — Choose dark or light based on the user's prompt:
- Tech/SaaS/Developer/AI/Gaming → dark theme (slate-950, zinc-950, neutral-950)
- Corporate/Business/Finance/Legal → light theme with dark hero section
- Health/Wellness/Coaching/Fitness → either, lean dark for premium feel
- E-commerce/Retail/Food → light theme
- Creative/Agency/Portfolio → dark theme
- Real estate/Architecture → light with dark accent sections
- If unclear, match the industry convention

DARK THEME surfaces: slate-950, zinc-950, gray-950 base. Create depth with layered gradients + subtle overlays
LIGHT THEME surfaces: warm off-whites (stone-50, zinc-50, slate-50) — not pure white. Use white cards on light gray backgrounds for depth
BOTH: Hero sections should feel immersive — use large radial gradients, mesh-style multi-color gradients, or dramatic color washes

GLASSMORPHISM & FROSTED GLASS:
- Dark theme: backdrop-blur-xl + bg-white/5 cards, border border-white/10
- Light theme: backdrop-blur-xl + bg-white/70 cards, border border-gray-200/60, shadow-lg shadow-gray-200/20
- Navbar: sticky top-0 z-50 backdrop-blur-xl with theme-appropriate bg opacity + subtle bottom border

GLOWS, GRADIENTS & LIGHT EFFECTS:
- Gradient text for hero headlines: bg-gradient-to-r bg-clip-text text-transparent (from-white to-blue-200 on dark, from-gray-900 to-blue-700 on light)
- Subtle glow behind key elements: shadow-[0_0_80px_rgba(56,189,248,0.15)] (dark) or shadow-[0_0_80px_rgba(59,130,246,0.1)] (light)
- Accent color glow on hover states for buttons and cards
- Animated gradient borders using pseudo-elements or border-image with CSS gradients
- Radial gradient spotlights: absolute positioned, blurred colored circles as background decoration

COLOR STRATEGY:
- Use Tailwind's built-in palette but go DEEP — use 950/900/800 shades for dark surfaces, 50/100 for light
- Pick a rich accent that contrasts dramatically: sky-400, violet-500, emerald-400, rose-500, amber-400
- Use the accent color SPARINGLY for maximum impact: CTAs, gradient text, glow effects, active states
- Dark theme text hierarchy: text-white, text-white/70, text-white/50 (not gray-400)
- Light theme text hierarchy: text-gray-900, text-gray-600, text-gray-400
- Do NOT define custom colors in tailwind.config.ts — use Tailwind's built-in palette with arbitrary values when needed

TYPOGRAPHY THAT COMMANDS ATTENTION:
- Hero headlines: text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight — BIG and confident
- Use negative letter-spacing on headlines: tracking-tighter
- Subheadings: text-lg sm:text-xl text-white/60 or text-zinc-400 — muted but readable
- Body text: text-base text-white/70 leading-relaxed
- Choose font pairings that feel premium:
  • Modern SaaS: Inter + Inter (clean, geometric)
  • Elegant/Luxury: Plus Jakarta Sans + DM Serif Display
  • Bold/Creative: Sora + Space Grotesk
  • Professional: Outfit + Source Serif 4

SPACING & LAYOUT THAT BREATHES:
- Generous padding: py-24 to py-32 on sections — give content room to breathe
- max-w-7xl mx-auto px-6 lg:px-8 — consistent content width
- Large gaps in grids: gap-8 or gap-12, not gap-4
- Cards should have p-8 or p-10 internal padding
- Section headings need mb-16 to mb-20 before content grids

MODERN UI PATTERNS:
- Bento grid layouts: asymmetric grids with varying card sizes (col-span-2, row-span-2)
- Floating/overlapping elements that break the grid
- Stats sections with large numbers: text-5xl font-bold with subtle gradient text
- Logo clouds with grayscale opacity-40 hover:opacity-100 transitions
- Feature cards with icon + heading + description, hover:translate-y-[-2px] with shadow transition
- Testimonials with large quotation marks, avatar, and subtle card background
- Pricing cards with a highlighted "popular" tier using ring-2 ring-accent and scale-105
- FAQ sections with smooth expand/collapse using React state and transition classes

BUTTONS & INTERACTIVE ELEMENTS:
- Primary CTA: gradient background (bg-gradient-to-r from-blue-500 to-blue-600) with hover brightness/scale, rounded-xl, px-8 py-4
- Secondary: bg-white/10 hover:bg-white/20 border border-white/20 (dark) or bg-gray-100 hover:bg-gray-200 (light)
- Micro-interactions: hover:scale-[1.02] transition-all duration-300 on cards. IMPORTANT: Any container with hover:scale or images with hover:scale MUST have overflow-hidden to prevent images from breaking out of containers on hover
- Button group patterns: primary + ghost/outline side by side
- Pill-shaped badges for tags: rounded-full px-4 py-1.5 text-xs font-medium bg-blue-500/10 text-blue-400

IMAGES — AI-GENERATED WITH MARKERS:
Use image placeholder markers that will be replaced with AI-generated images after code generation.

FORMAT: __IMG:detailed description of the image__
Place markers directly in src attributes: <img src="__IMG:a modern coworking space with natural light and plants" alt="Office" />

Do NOT specify aspect ratios in markers — the system automatically detects dimensions from Tailwind classes on the image container.

DESCRIPTION RULES:
- Write detailed, vivid 15-30 word descriptions
- Include: subject, mood, lighting, style, setting
- Examples:
  • __IMG:aerial view of a bustling modern city skyline at golden hour with warm sunlight reflecting off glass skyscrapers__
  • __IMG:professional headshot of a smiling woman in her 30s with natural lighting against a soft blurred office background__
  • __IMG:close-up of hands typing on a sleek laptop in a minimalist workspace with a coffee cup and succulent plant__

USAGE RULES:
1. Use 4-6 images per page: hero, features, testimonials, about sections
2. ALWAYS add className="object-cover w-full h-full" on ALL <img> tags — images MUST fill their container
3. ALWAYS wrap images in a container with EXPLICIT Tailwind sizing so the system can detect dimensions. Use one of:
   - aspect-[W/H] (e.g. aspect-[4/5], aspect-video, aspect-square) with a width class
   - Fixed h-N (e.g. h-64, h-80) with w-full
   - Fixed w-N h-N (e.g. w-12 h-12 for avatars)
   Example: <div className="w-full aspect-video rounded-2xl overflow-hidden"><img ... className="object-cover w-full h-full" /></div>
4. Pick descriptions that MATCH the specific content — a fitness site hero should describe a gym/workout scene
5. For testimonial avatars: use __IMG:description__ in a <div className="w-12 h-12 rounded-full overflow-hidden">. Describe as "professional headshot portrait of [person], face centered, shoulders visible"
6. For transformation/before-after or testimonial hero images: describe the FULL person from waist up, face clearly visible and centered — never just a torso or partial body
7. For hero sections: use a large relevant __IMG:description__ in a properly sized container with aspect-video or h-80+, side-by-side with text
7. For icons and small decorative elements: still use inline SVGs (not images)
8. For logo placeholders: use styled text in containers (not images)
9. Decorative backgrounds still use CSS gradients, animated blurred orbs, and patterns
10. NEVER use images as direct background-image — always use <img> tags inside positioned containers
11. Image containers with hover effects (hover:scale, group-hover:scale) MUST always have overflow-hidden to prevent images from breaking out of their container on hover

═══════════════════════════════════════
  FONTS — CRITICAL TECHNICAL RULE
═══════════════════════════════════════

Apply fonts via CSS only — NOT via tailwind.config.ts (Tailwind CDN ignores config files):
- Import Google Fonts in BOTH /index.html <link> tags AND /src/index.css @import
- Apply in /src/index.css:
  body { font-family: 'Inter', system-ui, sans-serif; }
  h1, h2, h3, h4, h5, h6 { font-family: 'Plus Jakarta Sans', sans-serif; }
- Do NOT extend fontFamily in tailwind.config.ts
- For one-off fonts use inline style={{ fontFamily: "'Font Name', serif" }}

tailwind.config.ts must be minimal:
  export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: { extend: {} },
    plugins: [],
  };

═══════════════════════════════════════
  PROJECT STRUCTURE
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
- /src/App.tsx — HashRouter with Routes, imports Navbar and Footer
- /src/index.css — Plain CSS only:
  • @import for Google Fonts
  • body and heading font-family rules
  • @keyframes animations (floating, pulsing, gradient-shift, etc.)
  • html { scroll-behavior: smooth; }
  • Do NOT use @tailwind directives (@tailwind base/components/utilities)
  • Do NOT use @import 'tailwindcss/...' imports
  • Do NOT use @apply or @layer directives
  • Do NOT use .reveal { opacity: 0 } or any hidden-by-default pattern

COMPONENTS: Extract Navbar, Footer, Hero, and each major section into its own component in /src/components/

═══════════════════════════════════════
  ROUTING (CRITICAL)
═══════════════════════════════════════

Use HashRouter (NOT BrowserRouter) — the app runs in a sandboxed iframe.

App.tsx must use:
import { HashRouter, Routes, Route } from "react-router-dom";

All navigation links must use <Link to="/path"> from react-router-dom, NOT <a href>.

SCROLL TO TOP: Add a ScrollToTop component:
  import { useEffect } from "react";
  import { useLocation } from "react-router-dom";
  export default function ScrollToTop() {
    const { pathname } = useLocation();
    useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
    return null;
  }
Place <ScrollToTop /> inside the HashRouter in App.tsx, before <Routes>.

═══════════════════════════════════════
  ANIMATIONS & INTERACTIONS
═══════════════════════════════════════

BACKGROUND CSS @keyframes in /src/index.css:
- Floating orbs: gentle translateY oscillation (8-12s infinite)
- Gradient shifts: background-position animation for animated gradient backgrounds
- Pulse glow: subtle box-shadow pulse on accent elements
- Spin: for loading states or decorative elements

All elements MUST be visible by default — NO opacity: 0 initial states.

HOVER MICRO-INTERACTIONS on EVERYTHING interactive:
- Cards: hover:translate-y-[-4px] hover:shadow-2xl transition-all duration-500
- Buttons: hover:scale-[1.02] active:scale-[0.98] transition-all duration-300
- Links: hover underline-offset-4 decoration transitions
- Nav items: relative with animated underline pseudo-element
- Images in cards: hover:scale-105 transition-transform duration-700 (with overflow-hidden on container)
- Badges/pills: hover:bg-opacity change + subtle scale
- Social icons / icon buttons: hover:text-accent hover:scale-110 transition-all duration-300
- Pricing cards: hover:ring-2 ring-accent/50 + hover:shadow-accent/20 glow

INFINITE MARQUEE / AUTO-SCROLL ANIMATIONS (IMPORTANT — use where applicable):
For logo clouds, partner logos, "as featured in" sections, and optionally testimonial carousels:
- Create an infinite horizontal scrolling marquee using pure CSS @keyframes
- Pattern: a flex container with duplicated items, animated with translateX
- Implementation in /src/index.css:
  @keyframes marquee {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  @keyframes marquee-reverse {
    0% { transform: translateX(-50%); }
    100% { transform: translateX(0); }
  }
- In the component: render items TWICE (duplicate the array) inside a flex container
  with style={{ animation: 'marquee 30s linear infinite' }}
- Container must have overflow-hidden, inner flex must have gap and shrink-0 on items
- For testimonials: can use a slower speed (40-60s) or a multi-row marquee with opposite directions
- Pause on hover: add CSS .marquee-track:hover { animation-play-state: paused; }
- Example structure for logos:
  <div className="overflow-hidden">
    <div className="flex gap-12 marquee-track" style={{ animation: 'marquee 30s linear infinite' }}>
      {[...logos, ...logos].map((logo, i) => (
        <div key={i} className="flex-shrink-0 text-2xl font-bold text-white/30 hover:text-white/60 transition-colors">
          {logo}
        </div>
      ))}
    </div>
  </div>

SCROLL-TRIGGERED REVEAL ANIMATIONS:
Create a reusable ScrollReveal wrapper component in /src/components/ScrollReveal.tsx.

CRITICAL RULES FOR SCROLL ANIMATIONS:
- Elements MUST start VISIBLE — opacity: 0 is FORBIDDEN as a default state
- Default (before observer fires): translate-y-4 and opacity-[0.85] — content is VISIBLE but slightly offset
- After IntersectionObserver fires: translate-y-0 and opacity-100 — smooth entrance
- If IntersectionObserver never fires (e.g. in iframe), everything is already readable
- The animation is a PROGRESSIVE ENHANCEMENT, not required for content visibility

ScrollReveal component requirements:
- Props: children (ReactNode), className (string, optional), delay (number in ms, optional, default 0)
- Use useRef, useState (isVisible, default false), useEffect with IntersectionObserver
- threshold: 0.1, rootMargin: '50px', unobserve after first intersection
- Apply classes via string concatenation (NOT template literals): "transition-all duration-700 ease-out " + (isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-[0.85]") + " " + className
- Apply transitionDelay via inline style object: { transitionDelay: delay + "ms" }
- Return a div with ref, className, style, wrapping children

Usage: Wrap section content, cards, headings, and feature items with ScrollReveal:
- Section headings: wrap h2 elements
- Cards in grids: wrap each card with staggered delay={index * 100}
- Feature items, testimonials, stats, pricing cards — all get ScrollReveal with staggered delays
- Do NOT wrap the entire section — wrap individual elements inside for staggered entrance effects

COUNTER / NUMBER ANIMATIONS:
For stats sections with large numbers, create animated counters that count up when scrolled into view:
- Use IntersectionObserver + requestAnimationFrame to animate from 0 to target number
- Duration: 1.5-2s with easeOut timing
- Start visible with the final number as fallback (animate only enhances)

Responsive Navbar: sticky top-0, backdrop-blur-xl, mobile hamburger with useState toggle.

═══════════════════════════════════════
  TECHNICAL REQUIREMENTS
═══════════════════════════════════════

- Valid TypeScript React (.tsx), functional components with hooks
- IMPORTS: Every component, hook, icon, or library used in a file MUST be imported at the top of that file. Never reference an undefined variable. If you use lucide-react icons like <Scissors />, <Star />, <Phone />, you MUST have: import { Scissors, Star, Phone } from "lucide-react" — AND include lucide-react in /package.json dependencies.
- Tailwind utility classes for ALL styling (use arbitrary values [] when needed for exact control)
- Use __IMG:description__ markers for all images (they are auto-replaced with AI-generated images after code generation)
- Realistic, relevant content — never lorem ipsum. Write compelling copy that sounds like real marketing
- Every section must be substantial — no skeleton placeholders
- Do NOT use min-h-screen on sections — use py-24/py-32 instead
- Do NOT use overflow-hidden on content containers (EXCEPT for marquee scroll containers)
- Navbar: sticky top-0 (not fixed)
- All content visible without JavaScript scroll triggers — scroll animations are progressive enhancement only
- Mobile responsive: use sm:, md:, lg: breakpoints throughout`;

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

5. IMAGES — USE ORIGINAL SOURCE IMAGES (CRITICAL)
   You are provided with a list of SOURCE IMAGE URLs extracted from the original website. You MUST use these actual URLs to achieve pixel-perfect cloning.

   RULES:
   - Use the EXACT source image URLs provided in the "Source Image URLs" section below
   - Match each image in the screenshot to the closest URL from the source list by analyzing the context (hero images, team photos, product shots, etc.)
   - Place source URLs directly in src attributes: <img src="https://example.com/image.jpg" alt="..." className="object-cover w-full h-full" />
   - ALWAYS wrap images in a container with EXPLICIT Tailwind sizing: aspect-video, aspect-square, aspect-[W/H], h-N, or w-N h-N
   - Example: <div className="w-full aspect-video rounded-2xl overflow-hidden"><img src="https://cdn.example.com/hero.jpg" alt="Hero" className="object-cover w-full h-full" /></div>
   - For avatars: <div className="w-12 h-12 rounded-full overflow-hidden"><img src="https://cdn.example.com/avatar.jpg" className="object-cover w-full h-full" /></div>

   FALLBACK (only when no matching source URL exists):
   - If an image is visible in the screenshot but no matching URL is in the source list, use __IMG:description__ markers
   - FORMAT: <img src="__IMG:vivid 15-30 word description matching what's visible in the screenshot__" alt="..." className="object-cover w-full h-full" />

   NEVER use empty src="", /placeholder.svg, or external placeholder URLs (via.placeholder.com, picsum, placehold.co)
   - For logos: use styled text with the brand name in the correct font/color (NOT images)
   - For icons: use inline SVGs that approximate the icon's shape and color (NOT images)

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
- IMPORTS: Every component, hook, icon, or library used in a file MUST be imported at the top of that file. Never reference an undefined variable. If you use lucide-react icons, import them AND include lucide-react in /package.json dependencies.
- Tailwind utility classes + arbitrary values for exact color matching
- Use the EXACT source image URLs provided in the source images list. Only use __IMG:description__ markers as a fallback when no matching source URL exists. NEVER use empty src or placeholder paths
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
7. IMPORTS: Every component, hook, icon, or library used in a file MUST be imported at the top of that file. Never use an undefined variable. If you use lucide-react icons (e.g. <Scissors />, <Star />), you MUST import them: import { Scissors, Star } from "lucide-react". When creating new files, make sure they are imported where needed.
8. CONTENT: Use realistic, relevant content. Never use lorem ipsum.
9. TYPES: All components must be valid TypeScript with proper types.
10. TAILWIND: Use Tailwind utility classes for styling. Do NOT use @apply or @tailwind directives in CSS.
11. ANIMATIONS: Never use opacity: 0 as a default state that relies on JavaScript to become visible.
12. IMAGES: For ALL new images, use __IMG:description__ markers directly in src attributes.
    - FORMAT: <img src="__IMG:vivid 15-30 word description__" alt="..." className="object-cover w-full h-full" />
    - ALWAYS wrap in a container with explicit Tailwind sizing: aspect-video, aspect-square, aspect-[W/H], h-N, or w-N h-N
    - Write detailed descriptions: subject, mood, lighting, style, setting (e.g. "modern hair salon interior with warm ambient lighting and sleek styling stations")
    - NEVER use empty src="", /placeholder.svg, /assets/*, via.placeholder.com, picsum.photos, or any external image URL
    - NEVER use CSS background-image with url() for content images — always use <img> tags
    - Existing images with blob URLs (*.vercel-storage.com) should be left unchanged
    - Existing images with real external URLs (https://...) from cloned source sites should be left unchanged — do NOT replace them with markers
    - Markers are auto-replaced with AI-generated images after your response

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
 * Fix unbalanced braces in recovered TSX/TS/JS component files.
 * When manual extraction is used, component files sometimes end up
 * missing closing braces. This adds them back conservatively.
 */
function repairBraces(files: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== "string" || !/\.(tsx?|jsx?)$/.test(path)) {
      result[path] = content;
      continue;
    }

    // Count braces outside of strings, template literals, and comments.
    let braceDepth = 0;
    let inString: string | null = null; // tracks quote char: ' " `
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];

      // Handle line comments: skip until newline
      if (inLineComment) {
        if (ch === "\n") inLineComment = false;
        continue;
      }

      // Handle block comments: skip until */
      if (inBlockComment) {
        if (ch === "*" && content[i + 1] === "/") {
          inBlockComment = false;
          i++; // skip the /
        }
        continue;
      }

      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (inString) {
        if (ch === inString) inString = null;
        continue;
      }

      // Detect comment starts
      if (ch === "/" && content[i + 1] === "/") {
        inLineComment = true;
        i++; // skip second /
        continue;
      }
      if (ch === "/" && content[i + 1] === "*") {
        inBlockComment = true;
        i++; // skip the *
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        inString = ch;
        continue;
      }
      if (ch === "{") braceDepth++;
      if (ch === "}") braceDepth--;
    }

    // If a string/comment was never closed, the brace count is unreliable.
    // Don't attempt any repairs — it would likely make things worse.
    if (inString || inLineComment || inBlockComment) {
      console.warn(`[repairBraces] ${path}: unclosed ${inString ? "string (" + inString + ")" : "comment"} — skipping repair (count unreliable)`);
      result[path] = content;
      continue;
    }

    let fixed = content;

    if (braceDepth === 1) {
      // Missing one closing brace (common truncation case) — add it
      console.warn(`[repairBraces] ${path}: added 1 missing closing brace`);
      fixed = content + "\n}\n";
    } else if (braceDepth > 1) {
      console.warn(`[repairBraces] ${path}: detected ${braceDepth} unbalanced braces — skipping repair (too risky)`);
      fixed = content;
    } else if (braceDepth === -1) {
      // One extra closing brace (common Gemini issue) — remove the last trailing `}`
      const lastBrace = content.lastIndexOf("}");
      if (lastBrace !== -1) {
        console.warn(`[repairBraces] ${path}: removed 1 extra trailing closing brace`);
        fixed = content.slice(0, lastBrace) + content.slice(lastBrace + 1);
      }
    }

    // Only strip clearly invalid trailing single characters (stray quotes from JSON parsing)
    // Don't strip anything that could be valid code (like ];, etc.)
    const trimmed = fixed.trimEnd();
    const lastChar = trimmed[trimmed.length - 1];
    if (lastChar === "'" || lastChar === '"' || lastChar === ",") {
      // Check if this is a stray character on its own line (not part of code)
      const lastNewline = trimmed.lastIndexOf("\n");
      const lastLine = trimmed.slice(lastNewline + 1).trim();
      if (lastLine.length === 1) {
        console.warn(`[repairBraces] ${path}: stripped stray trailing '${lastChar}'`);
        fixed = trimmed.slice(0, -1) + "\n";
      }
    }

    result[path] = fixed;
  }

  return result;
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
    // Repair common syntax issues in recovered files
    const repaired = repairBraces(files);
    return { files: repaired };
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
  images?: string[],
  signal?: AbortSignal
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

  // Langfuse generation observation for edit LLM call
  const trace = getActiveTrace();
  const langfuseGen = trace?.generation({
    name: "gemini-edit-funnel",
    model: modelId,
    input: contentParts.map((p: Part) =>
      "text" in p && p.text ? { text: p.text } : { image: "inline-image" }
    ),
  });

  const result = await model.generateContent(contentParts, signal ? { signal } : undefined);

  const response = result.response;
  const text = response.text();

  langfuseGen?.end({
    output: text,
    usage: {
      input: response.usageMetadata?.promptTokenCount,
      output: response.usageMetadata?.candidatesTokenCount,
      total: response.usageMetadata?.totalTokenCount,
    },
    metadata: { finishReason: response.candidates?.[0]?.finishReason },
  });

  const parsed = parseAIJson(text) as Record<string, unknown>;

  if (!parsed.files || typeof parsed.files !== "object") {
    throw new Error("Invalid response from AI: expected { files: {...} }");
  }

  // Coerce message to string — Gemini sometimes returns it as a non-string type
  const message = typeof parsed.message === "string"
    ? parsed.message
    : parsed.message != null
      ? String(parsed.message)
      : "Changes applied.";

  // Validate and repair code files (separate code files from deleted/null entries)
  const rawFiles = parsed.files as Record<string, string | null>;
  const codeFiles: Record<string, string> = {};
  const otherFiles: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(rawFiles)) {
    if (v === null) {
      otherFiles[k] = null;
    } else if (typeof v === "string") {
      codeFiles[k] = v;
    }
  }
  const repairedFiles = await validateAndRepairFiles(codeFiles);

  return { message, files: { ...repairedFiles, ...otherFiles } };
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
  images?: string[];
}

export async function generateFunnel(
  prompt: string,
  modelId: string,
  images?: string[],
  scrapeData?: ScrapeDataForGeneration,
  signal?: AbortSignal
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

    // Build source images section
    const sourceImages = scrapeData.images && scrapeData.images.length > 0
      ? `## Source Image URLs (use these EXACT URLs in your code)\n${scrapeData.images.slice(0, 50).map((url, i) => `${i + 1}. ${url}`).join("\n")}`
      : "## Source Image URLs\nNo source images extracted. Use __IMG:description__ markers for all images visible in the screenshot.";

    const cloneMessage = `Clone this website. Here is the scraped data:

## Page Title: ${scrapeData.metadata.title || "Unknown"}
## Page Description: ${scrapeData.metadata.description || ""}

${brandingSection}

${sourceImages}

## Content (Markdown)
${scrapeData.markdown.slice(0, 60000)}

## HTML Structure (for layout reference)
${scrapeData.html.slice(0, 50000)}

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

  // Langfuse generation observation for generate LLM call
  const trace = getActiveTrace();
  const langfuseGen = trace?.generation({
    name: "gemini-generate-funnel",
    model: modelId,
    input: contentParts.map((p: Part) =>
      "text" in p && p.text ? { text: p.text } : { image: "inline-image" }
    ),
    metadata: { isCloneMode },
  });

  // Pass abort signal to the Gemini API so the request is cancelled if the client disconnects
  const result = await model.generateContent(contentParts, signal ? { signal } : undefined);

  const response = result.response;
  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== "STOP") {
    console.warn(`[generateFunnel] Gemini finish reason: ${finishReason} (output may be truncated)`);
  }
  const text = response.text();
  console.log(`[generateFunnel] Response length: ${text.length} chars, finish reason: ${finishReason}`);

  langfuseGen?.end({
    output: text,
    usage: {
      input: response.usageMetadata?.promptTokenCount,
      output: response.usageMetadata?.candidatesTokenCount,
      total: response.usageMetadata?.totalTokenCount,
    },
    metadata: { finishReason, responseLength: text.length },
  });
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

  // Check if cancelled before expensive image processing
  if (signal?.aborted) {
    throw new DOMException("Generation cancelled", "AbortError");
  }

  // Process image markers: generate AI images and replace markers with URLs
  const filesWithImages = await processImageMarkers(files);

  // Comprehensive syntax validation and repair (handles unterminated strings,
  // template literals, block comments, and unbalanced brackets)
  return await validateAndRepairFiles(filesWithImages);
}
