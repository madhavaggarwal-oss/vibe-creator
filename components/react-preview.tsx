"use client";

import {
  SandpackProvider,
  SandpackLayout,
  SandpackPreview,
} from "@codesandbox/sandpack-react";
import { useMemo, Component, type ReactNode } from "react";

interface ReactProjectPreviewProps {
  files: Record<string, string>;
  refreshKey?: number;
  startRoute?: string;
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
  result = result.replace(
    /\.reveal\s*\{[^}]*opacity:\s*0[^}]*\}/g,
    (match) =>
      match
        .replace(/opacity:\s*0/, "opacity: 1")
        .replace(/transform:\s*translateY\([^)]+\)/, "transform: translateY(0)")
  );
  return result;
}

export default function ReactProjectPreview({
  files,
  refreshKey,
  startRoute,
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

    for (const [path, code] of Object.entries(files)) {
      // Skip null/non-string values (can happen from truncated AI output)
      if (typeof code !== "string") continue;
      const normalizedPath = path.startsWith("/") ? path : `/${path}`;

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
        sfFiles[normalizedPath] = { code, hidden: true };
        continue;
      }

      if (normalizedPath === "/src/index.css") {
        hasIndexCss = true;
        sfFiles[normalizedPath] = { code: transformCssForCdn(code) };
        continue;
      }

      sfFiles[normalizedPath] = { code };
    }

    // Bridge App.tsx: imports CSS, scrolls to top on navigation, optionally navigates to a route, re-exports App
    const bridgeLines: string[] = [];
    if (hasIndexCss) bridgeLines.push('import "./src/index.css";');
    // Scroll to top on every hash-based route change
    bridgeLines.push('window.addEventListener("hashchange", () => window.scrollTo(0, 0));');
    if (startRoute && startRoute !== "/") {
      bridgeLines.push(`if (window.location.hash !== "#${startRoute}") { window.location.hash = "#${startRoute}"; }`);
    }
    // Snapshot capture listener: responds to postMessage with rendered HTML
    bridgeLines.push(`window.addEventListener("message", (e) => {
  if (e.data && e.data.type === "capture-html") {
    window.parent.postMessage({ type: "html-snapshot", html: document.documentElement.outerHTML }, "*");
  }
});`);
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
  }, [files, startRoute]);

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
      </SandpackProvider>
    </SandpackErrorBoundary>
  );
}
