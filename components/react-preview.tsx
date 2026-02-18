"use client";

import {
  SandpackProvider,
  SandpackLayout,
  SandpackPreview,
} from "@codesandbox/sandpack-react";
import { useMemo } from "react";

interface ReactProjectPreviewProps {
  files: Record<string, string>;
  refreshKey?: number;
  startRoute?: string;
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
    <>
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
    </>
  );
}
