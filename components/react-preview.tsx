"use client";

import {
  SandpackProvider,
  SandpackLayout,
  SandpackPreview,
  useSandpack,
} from "@codesandbox/sandpack-react";
import { useMemo, Component, type ReactNode } from "react";

interface CalendarData {
  slots: Record<string, string[]>;
  slotDuration: number;
  calendarId: string;
}

interface ReactProjectPreviewProps {
  files: Record<string, string>;
  refreshKey?: number;
  startRoute?: string;
  calendarData?: CalendarData | null;
}

// ── Error boundary to catch Sandpack crashes gracefully ──
interface ErrorBoundaryProps {
  children: ReactNode;
  refreshKey?: number;
}
interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class SandpackErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error) {
    // Extract a readable message from the error
    let msg = error.message || "Unknown error";
    // The "Cannot assign to read only property" wraps the actual syntax error — extract it
    const syntaxMatch = msg.match(/SyntaxError:\s*(.+)/);
    if (syntaxMatch) {
      msg = syntaxMatch[1];
    }
    return { hasError: true, errorMessage: msg };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // Reset error state when refreshKey changes (user clicked refresh or files changed)
    if (prevProps.refreshKey !== this.props.refreshKey) {
      this.setState({ hasError: false, errorMessage: "" });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-white p-8">
          <div className="flex flex-col items-center gap-4 text-center max-w-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50">
              <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Preview compilation error</h3>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">{this.state.errorMessage}</p>
            </div>
            <p className="text-xs text-gray-400">Try asking the AI to fix this error, or edit the code directly.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Compile error overlay — replaces Sandpack's confusing default ──
// Must be rendered inside SandpackProvider to use useSandpack().
function CompileErrorOverlay() {
  const { sandpack } = useSandpack();
  const rawError = sandpack.error;

  if (!rawError) return null;

  // Extract a meaningful message from Sandpack's error
  let errorMessage = rawError.message || "Unknown compilation error";

  // Sandpack wraps SyntaxErrors with "Cannot assign to read only property 'message'"
  // — extract the actual SyntaxError from inside
  const readOnlyMatch = errorMessage.match(
    /Cannot assign to read only property 'message' of object '([^']+)'/
  );
  if (readOnlyMatch) {
    errorMessage = readOnlyMatch[1];
  }

  // Extract file path and location from SyntaxError
  const syntaxMatch = errorMessage.match(/SyntaxError:\s*(.+)/);
  if (syntaxMatch) {
    errorMessage = syntaxMatch[1];
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white p-8">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50">
          <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Preview compilation error</h3>
          <p className="mt-2 text-xs text-gray-600 leading-relaxed font-mono bg-gray-50 rounded-lg px-3 py-2 text-left break-all">
            {errorMessage}
          </p>
        </div>
        <p className="text-xs text-gray-400">
          Try asking the AI to fix this error, or edit the code directly.
        </p>
      </div>
    </div>
  );
}

// Extract Google Font URLs from index.html <link> tags
function extractFontUrls(html: string): string[] {
  const urls: string[] = [];
  const linkRegex = /<link[^>]+href="(https:\/\/fonts\.googleapis\.com[^"]+)"[^>]*>/g;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

// Base styles for native <select> elements so they match the generated UI
// instead of rendering as macOS native dropdowns.
// Only strips native appearance — does NOT add a chevron via background-image,
// because AI-generated code typically wraps <select> with its own SVG chevron icon.
const SELECT_BASE_STYLES = `
select {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
}
select:focus {
  outline: 2px solid currentColor;
  outline-offset: -2px;
  border-radius: inherit;
}
`;

// CSS fallback for broken/missing images — shows a subtle gradient placeholder
// instead of blank white space. Works by styling the img element itself when
// the image fails to load (broken images become "replaced elements" with no intrinsic size).
const BROKEN_IMAGE_STYLES = `
img {
  min-height: 40px;
}
img[src=""],
img:not([src]),
img[src="#"],
img[src="about:blank"] {
  background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
  min-height: 120px;
}
/* Prevent images from overflowing containers on hover scale transforms.
   Uses :has() to auto-add overflow:hidden to any parent of a scaled image. */
:has(> img[class*="scale"]),
:has(> img[class*="hover"]),
:has(> [class*="scale"] img) {
  overflow: hidden;
}
`;

// Calendar + booking form responsive safety net.
// Uses CSS :has() to structurally target calendar layouts by detecting a 7-column grid
// (grid-cols-7) and force responsive stacking via @media queries.
// Injected only when calendarData is present.
const CALENDAR_RESPONSIVE_STYLES = `
/* Calendar + booking form responsive safety net */
@media (max-width: 640px) {
  /* Force calendar+form side-by-side layouts to stack vertically.
     Targets any flex container that has a 7-column calendar grid descendant. */
  .flex:has(.grid-cols-7) {
    flex-direction: column !important;
    align-items: stretch !important;
  }
  /* Make direct children full-width when stacked */
  .flex:has(.grid-cols-7) > * {
    width: 100% !important;
    max-width: 100% !important;
    flex: none !important;
  }
  /* Grid-based calendar+form layouts: single column on mobile */
  .grid:has(.grid-cols-7):not(.grid-cols-7) {
    grid-template-columns: 1fr !important;
  }
  [class*="grid-cols"]:has(.grid-cols-7):not(.grid-cols-7) {
    grid-template-columns: 1fr !important;
  }
  /* Grid children: full width when stacked */
  .grid:has(.grid-cols-7):not(.grid-cols-7) > *,
  [class*="grid-cols"]:has(.grid-cols-7):not(.grid-cols-7) > * {
    grid-column: 1 / -1 !important;
  }
}
`;

// Pre-built useCalendarData hook injected into Sandpack when calendar data is available.
// This provides real GHL slot data to LLM-generated calendar UI components.
const CALENDAR_DATA_HOOK = `export interface CalendarData {
  slots: Record<string, string[]>;
  slotDuration: number;
  calendarId: string;
}

export function useCalendarData(): CalendarData | null {
  return (window as any).__CALENDAR_DATA__ || null;
}

// Format a local date as "YYYY-MM-DD" for slot key lookup.
// month is 0-indexed (0 = Jan, 11 = Dec), same as Date.getMonth().
// NEVER use new Date().toISOString() — it converts to UTC which shifts the date ±1 day.
export function formatDateKey(year: number, month: number, day: number): string {
  return \`\${year}-\${String(month + 1).padStart(2, '0')}-\${String(day).padStart(2, '0')}\`;
}

// Convert 24h time string (e.g. "14:30") to 12h format (e.g. "2:30 PM").
export function formatSlotTime(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return \`\${displayHour}:\${m} \${period}\`;
}
`;

// Transform CSS to work with Tailwind CDN
function transformCssForCdn(css: string): string {
  let result = css;
  // Remove @tailwind directives (both syntaxes)
  result = result.replace(/@tailwind\s+(base|components|utilities)\s*;/g, "");
  // Remove @import 'tailwindcss/...' directives
  result = result.replace(/@import\s+['"]tailwindcss\/[^'"]+['"]\s*;/g, "");
  // Comment out @apply (not supported by CDN)
  result = result.replace(/@apply\s+([^;]+);/g, "/* @apply $1 */");
  // Comment out @layer blocks
  result = result.replace(/@layer\s+(base|components|utilities)\s*\{/g, "/* @layer $1 */ {");
  // Fix any CSS rule that hides elements via opacity: 0 as an initial state
  // (IntersectionObserver-based reveal patterns are unreliable in Sandpack iframe)
  result = result.replace(
    /(\.[a-zA-Z][\w-]*\s*\{[^}]*)opacity:\s*0(\s*[;}])/g,
    (match, before, after) => {
      // Only fix if this looks like a reveal/animation class (not intentional like overlays)
      if (/\b(reveal|fade|slide|animate|hidden|scroll|appear|entry)/i.test(before)) {
        return before + "opacity: 1" + after;
      }
      return match;
    }
  );
  // Also fix transform: translateY(...) in those same reveal-style classes
  result = result.replace(
    /(\.(reveal|fade|slide|animate|scroll|appear|entry)[\w-]*\s*\{[^}]*)transform:\s*translateY\([^)]+\)/g,
    "$1transform: translateY(0)"
  );
  return result;
}

// Names that are NOT lucide icons — common React/router/built-in components & JS globals
const NON_ICON_NAMES = new Set([
  // React & Router
  "React", "Fragment", "Suspense", "StrictMode",
  "Link", "NavLink", "Route", "Routes", "HashRouter", "BrowserRouter", "Outlet", "Navigate",
  "ScrollToTop",
  // JS/TS built-in globals & types (commonly appear in generics like useState<Date>)
  "Date", "Map", "Set", "Array", "Object", "Error", "Promise", "RegExp",
  "String", "Number", "Boolean", "Symbol", "Function", "Proxy", "Reflect",
  "WeakMap", "WeakSet", "JSON", "Math", "Intl",
  // Web API globals
  "URL", "Headers", "Request", "Response", "FormData", "File", "Blob",
  "Event", "Node", "Element", "Document", "Window", "Image",
  // TypedArrays
  "Int8Array", "Uint8Array", "Float32Array", "Float64Array", "BigInt",
]);

/**
 * Detect PascalCase JSX components used but not imported in a TSX file.
 * If unresolved names are found and lucide-react is available, inject the import.
 */
function fixMissingLucideImports(code: string, hasLucideDep: boolean): string {
  if (!hasLucideDep) return code;

  // Find all PascalCase JSX tags: <ComponentName or <ComponentName> or <ComponentName />
  const jsxUsageRegex = /<([A-Z][A-Za-z0-9]+)[\s/>]/g;
  const usedComponents = new Set<string>();
  let m;
  while ((m = jsxUsageRegex.exec(code)) !== null) {
    usedComponents.add(m[1]);
  }

  if (usedComponents.size === 0) return code;

  // Find all imported/defined names
  const importedNames = new Set<string>();
  // Match: import { A, B, C } from "..."  and  import X from "..."
  const importRegex = /import\s+(?:(\w+)|\{([^}]+)\})\s+from\s+['"][^'"]+['"]/g;
  while ((m = importRegex.exec(code)) !== null) {
    if (m[1]) importedNames.add(m[1]); // default import
    if (m[2]) {
      // Named imports: split by comma, handle "Name as Alias"
      m[2].split(",").forEach((n) => {
        const parts = n.trim().split(/\s+as\s+/);
        const name = (parts[1] || parts[0]).trim();
        if (name) importedNames.add(name);
      });
    }
  }
  // Also catch: import DefaultName, { Named } from "..."
  const mixedImportRegex = /import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+['"][^'"]+['"]/g;
  while ((m = mixedImportRegex.exec(code)) !== null) {
    importedNames.add(m[1]);
    m[2].split(",").forEach((n) => {
      const parts = n.trim().split(/\s+as\s+/);
      const name = (parts[1] || parts[0]).trim();
      if (name) importedNames.add(name);
    });
  }

  // Find locally defined components: function Name / const Name
  const defRegex = /(?:function|const|let|var|class)\s+([A-Z][A-Za-z0-9]+)/g;
  while ((m = defRegex.exec(code)) !== null) {
    importedNames.add(m[1]);
  }

  // Unresolved = used in JSX but not imported/defined and not a known non-icon
  const unresolved = [...usedComponents].filter(
    (name) => !importedNames.has(name) && !NON_ICON_NAMES.has(name)
  );

  if (unresolved.length === 0) return code;

  // Check if there's already a lucide-react import to extend
  const existingLucide = code.match(/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/);
  if (existingLucide) {
    // Add missing icons to the existing import
    const existingNames = new Set(
      existingLucide[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0].trim())
    );
    const toAdd = unresolved.filter((n) => !existingNames.has(n));
    if (toAdd.length === 0) return code;
    const newImport = existingLucide[0].replace(
      existingLucide[1],
      existingLucide[1].trimEnd() + ", " + toAdd.join(", ")
    );
    return code.replace(existingLucide[0], newImport);
  }

  // No existing lucide import — add a new one at the top (after other imports)
  const importLine = `import { ${unresolved.join(", ")} } from "lucide-react";\n`;
  // Insert after the last import statement
  const lastImportIdx = code.lastIndexOf("\nimport ");
  if (lastImportIdx !== -1) {
    const lineEnd = code.indexOf("\n", lastImportIdx + 1);
    return code.slice(0, lineEnd + 1) + importLine + code.slice(lineEnd + 1);
  }
  // No imports at all — prepend
  return importLine + code;
}

// Fix BrowserRouter → HashRouter (BrowserRouter doesn't work in Sandpack iframe)
function fixRouterImports(code: string): string {
  let result = code;
  // Replace import
  result = result.replace(
    /import\s*\{([^}]*)\bBrowserRouter\b([^}]*)\}\s*from\s*['"]react-router-dom['"]/g,
    (match, before, after) => match.replace("BrowserRouter", "HashRouter")
  );
  // Replace JSX usage
  result = result.replace(/<BrowserRouter(\s|>|\/)/g, "<HashRouter$1");
  result = result.replace(/<\/BrowserRouter>/g, "</HashRouter>");
  return result;
}

export default function ReactProjectPreview({
  files,
  refreshKey,
  startRoute,
  calendarData,
}: ReactProjectPreviewProps) {
  const { sandpackFiles, dependencies, externalResources } = useMemo(() => {
    const sfFiles: Record<string, { code: string; hidden?: boolean }> = {};
    let deps: Record<string, string> = {
      "react-router-dom": "^6.20.0",
    };
    const extResources: string[] = [
      "https://cdn.tailwindcss.com",
    ];

    let hasIndexCss = false;

    // Collect all import sources from TSX/TS/JS files to auto-detect dependencies
    // the AI used but forgot to add to package.json
    const importedPackages = new Set<string>();

    for (const [path, code] of Object.entries(files)) {
      // Skip null/non-string values (can happen from truncated AI output)
      if (typeof code !== "string") continue;
      const normalizedPath = path.startsWith("/") ? path : `/${path}`;

      // Scan source files for third-party imports (not relative paths)
      if (/\.(tsx?|jsx?)$/.test(normalizedPath)) {
        const importRegex = /(?:import|from)\s+['"]([^./][^'"]*)['"]/g;
        let importMatch;
        while ((importMatch = importRegex.exec(code)) !== null) {
          // Extract package name (handle scoped packages like @headlessui/react)
          const raw = importMatch[1];
          const pkgName = raw.startsWith("@")
            ? raw.split("/").slice(0, 2).join("/")
            : raw.split("/")[0];
          // Exclude built-in packages already provided by Sandpack
          if (pkgName !== "react" && pkgName !== "react-dom") {
            importedPackages.add(pkgName);
          }
        }
      }

      // Transform ALL CSS files (not just index.css) — AI can create additional
      // CSS files with @tailwind/@apply/@layer directives that break Sandpack
      if (normalizedPath.endsWith(".css") && normalizedPath !== "/src/index.css") {
        const hasDirectives = /@tailwind|@import\s+['"]tailwindcss|@apply|@layer\s+(base|components|utilities)|opacity:\s*0/.test(code);
        if (hasDirectives) {
          sfFiles[normalizedPath] = { code: transformCssForCdn(code) };
          continue;
        }
      }

      if (normalizedPath === "/package.json") {
        try {
          const pkg = JSON.parse(code);
          if (pkg.dependencies) {
            const { react, "react-dom": reactDom, ...otherDeps } = pkg.dependencies;
            deps = { ...deps, ...otherDeps };
          }
        } catch {
          // Ignore
        }
        continue;
      }

      if (normalizedPath === "/index.html") {
        const fontUrls = extractFontUrls(code);
        extResources.push(...fontUrls);
        continue;
      }

      if (
        normalizedPath === "/tailwind.config.ts" ||
        normalizedPath === "/vite.config.ts" ||
        normalizedPath === "/postcss.config.js" ||
        normalizedPath === "/tsconfig.json"
      ) {
        continue;
      }

      if (normalizedPath === "/src/main.tsx") {
        sfFiles[normalizedPath] = { code: fixRouterImports(code), hidden: true };
        continue;
      }

      if (normalizedPath === "/src/index.css") {
        hasIndexCss = true;
        sfFiles[normalizedPath] = { code: transformCssForCdn(code) + SELECT_BASE_STYLES + BROKEN_IMAGE_STYLES + (calendarData ? CALENDAR_RESPONSIVE_STYLES : "") };
        continue;
      }

      // Fix BrowserRouter → HashRouter in App.tsx and any routing files
      if (/\.(tsx?|jsx?)$/.test(normalizedPath) && code.includes("BrowserRouter")) {
        sfFiles[normalizedPath] = { code: fixRouterImports(code) };
        continue;
      }

      sfFiles[normalizedPath] = { code };
    }

    // Auto-add any imported packages the AI forgot to put in package.json
    for (const pkg of importedPackages) {
      if (!deps[pkg]) {
        deps[pkg] = "latest";
      }
    }

    // Inject pre-built useCalendarData hook when calendar data is available.
    // This provides real GHL slot data to LLM-generated calendar UI components.
    if (calendarData) {
      // Always inject the hook file
      sfFiles["/src/hooks/useCalendarData.ts"] = {
        code: CALENDAR_DATA_HOOK,
        hidden: true,
      };

      // Fallback: if Gemini didn't import useCalendarData anywhere, force-inject it.
      // Find the most likely calendar-related file and add the import + usage.
      const anyFileImportsIt = Object.values(sfFiles).some(
        (f) => f.code.includes("useCalendarData")
      );
      if (!anyFileImportsIt) {
        // Find the best candidate file: a calendar/booking page or component
        const calendarFilePattern = /calendar|booking|appointment|schedule/i;
        let targetPath: string | null = null;
        // Prefer pages over components
        for (const fp of Object.keys(sfFiles)) {
          if (/\.(tsx|jsx)$/.test(fp) && calendarFilePattern.test(fp)) {
            targetPath = fp;
            if (fp.includes("/pages/")) break; // prefer page files
          }
        }
        if (targetPath) {
          const file = sfFiles[targetPath];
          // Compute relative import path from the target file to /src/hooks/useCalendarData
          const depth = targetPath.split("/").length - 1; // e.g. /src/pages/Booking.tsx = 3 parts after split
          const relPrefix = depth > 3 ? "../".repeat(depth - 3) + "../hooks/" : "../hooks/";
          const importLine = `import { useCalendarData, formatSlotTime } from "${relPrefix}useCalendarData";\n`;
          let code = file.code;
          if (!code.includes("useCalendarData")) {
            // Add import after last import statement
            const lastImportIdx = code.lastIndexOf("import ");
            if (lastImportIdx !== -1) {
              const endOfImport = code.indexOf("\n", lastImportIdx);
              code = code.slice(0, endOfImport + 1) + importLine + code.slice(endOfImport + 1);
            } else {
              code = importLine + code;
            }
            // Inject hook call at the top of the default export function body
            const fnMatch = code.match(/export\s+default\s+function\s+\w+\s*\([^)]*\)\s*\{/);
            if (fnMatch && fnMatch.index !== undefined) {
              const insertPos = fnMatch.index + fnMatch[0].length;
              code = code.slice(0, insertPos) + "\n  const calendarData = useCalendarData();" + code.slice(insertPos);
            }
            sfFiles[targetPath] = { ...file, code };
          }
        }
      }
    }

    // Fix missing lucide-react imports: AI often uses icon components like <Scissors>
    // without importing them. Detect unresolved PascalCase JSX and inject imports.
    const hasLucideDep = !!deps["lucide-react"];
    let lucideWasInjected = false;
    for (const [filePath, fileObj] of Object.entries(sfFiles)) {
      if (!/\.(tsx|jsx)$/.test(filePath)) continue;
      const fixed = fixMissingLucideImports(fileObj.code, hasLucideDep || true);
      if (fixed !== fileObj.code) {
        sfFiles[filePath] = { ...fileObj, code: fixed };
        lucideWasInjected = true;
      }
    }
    // If we injected lucide imports but lucide-react wasn't a dep, add it
    if (lucideWasInjected && !deps["lucide-react"]) {
      deps["lucide-react"] = "latest";
    }

    // Bridge App.tsx: imports CSS, scrolls to top on navigation, optionally navigates to a route, re-exports App
    const bridgeLines: string[] = [];
    if (hasIndexCss) bridgeLines.push('import "./src/index.css";');
    // Scroll to top on every hash-based route change
    bridgeLines.push('window.addEventListener("hashchange", () => window.scrollTo(0, 0));');
    if (startRoute && startRoute !== "/") {
      bridgeLines.push(`if (window.location.hash !== "#${startRoute}") { window.location.hash = "#${startRoute}"; }`);
    }
    // Broken image fallback: listen for img load errors and apply gradient placeholder
    bridgeLines.push(`document.addEventListener("error", (e) => {
  if (e.target && e.target.tagName === "IMG") {
    const img = e.target;
    img.style.background = "linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)";
    img.style.minHeight = img.style.minHeight || "120px";
    img.removeAttribute("src");
  }
}, true);`);
    // Snapshot capture listener: responds to postMessage from parent only
    bridgeLines.push(`window.addEventListener("message", (e) => {
  if (e.source !== window.parent) return;
  if (e.data && e.data.type === "capture-html") {
    window.parent.postMessage({ type: "html-snapshot", html: document.documentElement.outerHTML }, "*");
  }
});`);

    // GHL form submission interception: intercept all form submits and send data to parent
    bridgeLines.push(`
// Helper: find the semantic field name for an input element
function __ghlFieldName(el) {
  // 1. name attribute — primary signal (Gemini generates these with GHL-compatible names)
  if (el.name) return el.name;

  // 2. id attribute
  if (el.id) return el.id;

  // 3. Fallback for older projects: find associated label text
  // Check <label for="id">
  if (el.id) {
    var labelFor = document.querySelector('label[for="' + el.id + '"]');
    if (labelFor) {
      var lt = labelFor.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (lt) return lt;
    }
  }
  // Check parent <label>
  var parentLabel = el.closest("label");
  if (parentLabel) {
    var txt = "";
    for (var c = 0; c < parentLabel.childNodes.length; c++) {
      if (parentLabel.childNodes[c].nodeType === 3) txt += parentLabel.childNodes[c].textContent;
    }
    txt = txt.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (txt) return txt;
  }
  // Check nearby label: walk up to 3 parent levels looking for a label sibling
  var node = el;
  for (var lvl = 0; lvl < 3; lvl++) {
    var prev = node.previousElementSibling;
    if (prev && (prev.tagName === "LABEL" || prev.tagName === "SPAN" || prev.tagName === "P")) {
      var pt = prev.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (pt && pt.length < 30) return pt;
    }
    // Also check if the parent itself contains a label child before this element
    var par = node.parentElement;
    if (par) {
      var lbl = par.querySelector("label, span.label, span[class*='label']");
      if (lbl && lbl !== node) {
        var lt2 = lbl.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        if (lt2 && lt2.length < 30) return lt2;
      }
    }
    node = node.parentElement;
    if (!node) break;
  }

  // 4. Infer from input type
  if (el.type === "email") return "email";
  if (el.type === "tel") return "phone";
  if (el.type === "url") return "website";

  // 5. aria-label
  var aria = el.getAttribute("aria-label");
  if (aria) return aria.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  return "";
}

document.addEventListener("submit", function(e) {
  try {
    var form = e.target;
    if (!form || form.tagName !== "FORM") return;
    e.preventDefault();
    console.log("[GHL] Form submit intercepted", form.id || "(no id)");

    var fields = {};
    var customFieldKeys = [];
    var customFieldLabels = {};
    var inputs = form.querySelectorAll("input, select, textarea");
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      if (el.type === "file" || el.type === "submit" || el.type === "button" || el.type === "reset" || el.type === "hidden") continue;

      var fieldName = __ghlFieldName(el);
      if (!fieldName) continue;

      // Detect explicitly marked custom fields and their display labels
      if (el.getAttribute("data-ghl-custom") === "true") {
        customFieldKeys.push(fieldName);
        var label = el.getAttribute("data-ghl-label");
        if (label) customFieldLabels[fieldName] = label;
      }

      console.log("[GHL] Field:", fieldName, (el.getAttribute("data-ghl-custom") === "true" ? "(custom)" : "(standard)"), "value=" + el.value);

      var val;
      if (el.type === "checkbox") { val = el.checked ? (el.value || "true") : ""; }
      else if (el.type === "radio") { if (!el.checked) continue; val = el.value; }
      else { val = el.value; }

      if (fields[fieldName] !== undefined) {
        if (Array.isArray(fields[fieldName])) { fields[fieldName].push(val); }
        else { fields[fieldName] = [fields[fieldName], val]; }
      } else {
        fields[fieldName] = val;
      }
    }

    // Combine country_code + phone into a single phone field with country code prefix
    if (fields["country_code"] && fields["phone"]) {
      var code = fields["country_code"].toString().trim();
      var num = fields["phone"].toString().trim();
      fields["phone"] = code + num;
      delete fields["country_code"];
      console.log("[GHL] Combined phone with country code:", fields["phone"]);
    }

    console.log("[GHL] Collected fields:", JSON.stringify(fields, null, 2));
    if (customFieldKeys.length) console.log("[GHL] Custom field keys:", customFieldKeys);

    // Send to parent with explicit custom field markers and labels
    window.parent.postMessage({ type: "ghl-form-submit", fields: fields, customFieldKeys: customFieldKeys, customFieldLabels: customFieldLabels }, "*");

    // Disable submit button — ONLY use attribute/style changes (never .textContent or .value)
    // because modifying child nodes causes React to crash with "removeChild" errors
    // when the AI-generated code navigates away (e.g. to a thank-you page) after submit
    var submitBtn = form.querySelector('button[type="submit"], button:not([type]), input[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.style.opacity = "0.6";
      submitBtn.style.pointerEvents = "none";
    }
  } catch(submitErr) {
    console.error("[GHL] Form submit error:", submitErr);
  }
}, true);`);

    // GHL form result listener: receive success/error from parent and show toast
    bridgeLines.push(`window.addEventListener("message", (e) => {
  try {
    if (e.source !== window.parent) return;
    if (!e.data || e.data.type !== "ghl-form-result") return;
    console.log("[GHL] Form result received:", e.data.success ? "SUCCESS" : "FAILED", e.data.message);

    // Restore all submit buttons — only attribute/style changes (safe for React DOM)
    var forms = document.querySelectorAll("form");
    for (var i = 0; i < forms.length; i++) {
      var btn = forms[i].querySelector('button[type="submit"], button:not([type]), input[type="submit"]');
      if (btn && btn.disabled) {
        btn.disabled = false;
        btn.style.opacity = "";
        btn.style.pointerEvents = "";
      }
    }

    // Show toast notification
    var toastContainer = document.getElementById("__ghl-toast-container");
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.id = "__ghl-toast-container";
      toastContainer.style.cssText = "position:fixed;top:0;left:0;width:100%;z-index:99999;pointer-events:none;";
      document.body.appendChild(toastContainer);
    }
    var toast = document.createElement("div");
    toast.style.cssText = "position:relative;top:20px;left:50%;transform:translateX(-50%);display:inline-block;padding:12px 24px;border-radius:8px;font-family:system-ui,sans-serif;font-size:14px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;pointer-events:auto;text-align:center;";
    if (e.data.success) {
      toast.style.background = "#10b981";
      toast.style.color = "white";
      toast.textContent = e.data.message || "Form submitted successfully!";
    } else {
      toast.style.background = "#ef4444";
      toast.style.color = "white";
      toast.textContent = e.data.message || "Submission failed. Please try again.";
    }
    toastContainer.style.textAlign = "center";
    toastContainer.appendChild(toast);
    setTimeout(function() {
      try { toast.style.opacity = "0"; } catch(ex) {}
      setTimeout(function() { try { toast.parentNode && toast.parentNode.removeChild(toast); } catch(ex) {} }, 300);
    }, 3000);

    // Reset form on success
    if (e.data.success) {
      for (var j = 0; j < forms.length; j++) { forms[j].reset(); }
    }
  } catch(resultErr) {
    console.error("[GHL] Form result handler error:", resultErr);
  }
});`);

    // Inject calendar data into iframe global so generated calendar components can read it
    if (calendarData) {
      bridgeLines.push(`window.__CALENDAR_DATA__ = ${JSON.stringify(calendarData)};`);
    } else {
      bridgeLines.push(`window.__CALENDAR_DATA__ = null;`);
    }

    bridgeLines.push('export { default } from "./src/App";');

    sfFiles["/App.tsx"] = {
      code: bridgeLines.join("\n"),
      hidden: true,
    };

    return {
      sandpackFiles: sfFiles,
      dependencies: deps,
      externalResources: extResources,
    };
  }, [files, startRoute, calendarData]);

  return (
    <SandpackErrorBoundary refreshKey={refreshKey}>
      {/* Force Sandpack internal wrappers to fill parent height */}
      <style>{`
        .sp-wrapper { height: 100% !important; }
        .sp-layout { height: 100% !important; }
        .sp-preview-container { height: 100% !important; }
        .sp-preview-iframe { height: 100% !important; }
        .sp-preview-actions { display: none !important; }
      `}</style>
      <SandpackProvider
        key={refreshKey}
        template="react-ts"
        files={sandpackFiles}
        customSetup={{
          dependencies,
        }}
        options={{
          externalResources,
        }}
      >
        <div className="relative" style={{ height: "100%" }}>
          <CompileErrorOverlay />
          <SandpackLayout
            style={{
              height: "100%",
              border: "none",
              borderRadius: 0,
              backgroundColor: "transparent",
            }}
          >
            <SandpackPreview
              style={{ height: "100%", width: "100%" }}
              showNavigator={false}
              showOpenInCodeSandbox={false}
              showRefreshButton={false}
            />
          </SandpackLayout>
        </div>
      </SandpackProvider>
    </SandpackErrorBoundary>
  );
}
