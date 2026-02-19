export interface ScrapeResult {
  screenshot: string;
  markdown: string;
  html: string;
  links: string[];
  images: string[];
  branding: {
    colors: string[];
    fonts: string[];
    typography: Record<string, unknown>;
    spacing: Record<string, unknown>;
    components: unknown[];
  } | null;
  metadata: {
    title: string;
    description: string;
  };
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY environment variable is not set");
  }

  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: [
        "markdown",
        "html",
        "links",
        "images",
        "branding",
        { type: "screenshot", fullPage: true },
      ],
      onlyMainContent: false,
      waitFor: 3000,
      actions: [
        // Step 1: Scroll the entire page to trigger ALL lazy/scroll-animated content
        { type: "scroll", direction: "down" },
        { type: "wait", milliseconds: 800 },
        { type: "scroll", direction: "down" },
        { type: "wait", milliseconds: 800 },
        { type: "scroll", direction: "down" },
        { type: "wait", milliseconds: 800 },
        { type: "scroll", direction: "down" },
        { type: "wait", milliseconds: 800 },
        { type: "scroll", direction: "down" },
        { type: "wait", milliseconds: 800 },
        // Scroll back to top
        {
          type: "executeJavascript",
          script: `window.scrollTo(0, 0);`,
        },
        { type: "wait", milliseconds: 1000 },
        // Step 2: Nuclear option — force EVERYTHING visible by rewriting inline styles
        {
          type: "executeJavascript",
          script: `
            (function() {
              // 1. Inject highest-priority CSS override
              var s = document.createElement('style');
              s.textContent = [
                '*, *::before, *::after {',
                '  transition-duration: 0s !important;',
                '  transition-delay: 0s !important;',
                '  animation-duration: 0s !important;',
                '  animation-delay: 0s !important;',
                '  animation-play-state: paused !important;',
                '}',
              ].join('\\n');
              document.head.appendChild(s);

              // 2. Walk every element and strip inline opacity/transform/visibility
              var all = document.querySelectorAll('*');
              for (var i = 0; i < all.length; i++) {
                var el = all[i];
                var ist = el.style;
                // Remove inline styles that hide content
                if (ist.opacity && ist.opacity !== '1') ist.opacity = '1';
                if (ist.visibility === 'hidden') ist.visibility = 'visible';
                if (ist.display === 'none' && !el.matches('script,style,link,meta,head,noscript')) ist.display = '';
                // Remove transforms that offset elements (slide-in animations stuck mid-way)
                if (ist.transform) ist.transform = 'none';
                // Handle clip-path hiding
                if (ist.clipPath && ist.clipPath !== 'none') ist.clipPath = 'none';

                // Also check computed style for elements hidden by stylesheets
                var cs = window.getComputedStyle(el);
                if (parseFloat(cs.opacity) < 0.1) el.style.setProperty('opacity', '1', 'important');
                if (cs.visibility === 'hidden') el.style.setProperty('visibility', 'visible', 'important');
                if (cs.transform && cs.transform !== 'none') el.style.setProperty('transform', 'none', 'important');
                if (cs.clipPath && cs.clipPath !== 'none') el.style.setProperty('clip-path', 'none', 'important');
              }

              // 3. Force lazy images
              document.querySelectorAll('img[loading="lazy"], img[data-src], img[data-lazy-src]').forEach(function(img) {
                if (img.dataset.src) img.src = img.dataset.src;
                if (img.dataset.lazySrc) img.src = img.dataset.lazySrc;
                img.loading = 'eager';
              });

              // 4. Framework-specific handlers

              // Framer: appear animations
              document.querySelectorAll('[data-framer-appear-id], [data-framer-component-type]').forEach(function(el) {
                el.style.setProperty('opacity', '1', 'important');
                el.style.setProperty('transform', 'none', 'important');
              });

              // GSAP / ScrollTrigger / ScrollMagic
              if (window.gsap) {
                try { window.gsap.globalTimeline.progress(1); } catch(e) {}
                try { window.ScrollTrigger && window.ScrollTrigger.getAll().forEach(function(t) { t.progress(1); t.kill(); }); } catch(e) {}
              }
              if (window.ScrollMagic) {
                try { window.ScrollMagic.Controller && window.ScrollMagic.Controller().destroy(true); } catch(e) {}
              }

              // AOS (Animate On Scroll)
              document.querySelectorAll('[data-aos]').forEach(function(el) {
                el.classList.add('aos-animate');
                el.style.setProperty('opacity', '1', 'important');
                el.style.setProperty('transform', 'none', 'important');
              });

              // WOW.js
              document.querySelectorAll('.wow').forEach(function(el) {
                el.classList.add('animated');
                el.style.setProperty('opacity', '1', 'important');
                el.style.setProperty('visibility', 'visible', 'important');
                el.style.setProperty('animation-name', 'none', 'important');
              });

              // Webflow interactions
              document.querySelectorAll('[data-w-id], .w-condition-invisible').forEach(function(el) {
                el.style.setProperty('opacity', '1', 'important');
                el.style.setProperty('transform', 'none', 'important');
                el.style.setProperty('visibility', 'visible', 'important');
                el.classList.remove('w-condition-invisible');
              });

              // Elementor (WordPress)
              document.querySelectorAll('.elementor-invisible, [data-settings*="animation"]').forEach(function(el) {
                el.classList.remove('elementor-invisible');
                el.classList.add('elementor-visible');
                el.style.setProperty('opacity', '1', 'important');
                el.style.setProperty('transform', 'none', 'important');
              });

              // Wix (Thunderbolt renderer)
              document.querySelectorAll('[data-motion-enter], [data-animate-on-scroll]').forEach(function(el) {
                el.style.setProperty('opacity', '1', 'important');
                el.style.setProperty('transform', 'none', 'important');
              });

              // Squarespace
              document.querySelectorAll('.preFade, .preSlide').forEach(function(el) {
                el.classList.add('fadeIn', 'slideIn');
                el.style.setProperty('opacity', '1', 'important');
                el.style.setProperty('transform', 'none', 'important');
              });

              // Generic reveal/animate classes used by many libraries
              document.querySelectorAll('.reveal, .fade-in, .slide-up, .slide-in, .animate-on-scroll, .scroll-animate, .is-hidden, .not-visible, [data-scroll], [data-reveal], [data-animate], [data-inview]').forEach(function(el) {
                el.classList.add('is-visible', 'is-revealed', 'is-inview', 'visible', 'animated', 'active');
                el.classList.remove('is-hidden', 'not-visible');
                el.style.setProperty('opacity', '1', 'important');
                el.style.setProperty('transform', 'none', 'important');
                el.style.setProperty('visibility', 'visible', 'important');
              });

              // Lottie animations — pause at last frame
              if (window.lottie) {
                try { window.lottie.getRegisteredAnimations().forEach(function(a) { a.goToAndStop(a.totalFrames - 1, true); }); } catch(e) {}
              }

              // Lazy background images (common in WordPress themes)
              document.querySelectorAll('[data-bg], [data-background-image]').forEach(function(el) {
                var bg = el.dataset.bg || el.dataset.backgroundImage;
                if (bg) el.style.backgroundImage = 'url(' + bg + ')';
              });
            })();
          `,
        },
        { type: "wait", milliseconds: 1500 },
        // Step 3: Final pass — catch anything that re-animated after our fix
        {
          type: "executeJavascript",
          script: `
            document.querySelectorAll('*').forEach(function(el) {
              var cs = window.getComputedStyle(el);
              if (parseFloat(cs.opacity) < 0.5) el.style.setProperty('opacity', '1', 'important');
              if (cs.visibility === 'hidden') el.style.setProperty('visibility', 'visible', 'important');
            });
          `,
        },
        { type: "wait", milliseconds: 500 },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Firecrawl API error (${res.status}): ${errBody}`);
  }

  const json = await res.json();

  if (!json.success) {
    throw new Error(`Firecrawl scrape failed: ${json.error || "Unknown error"}`);
  }

  const data = json.data || {};

  // Download screenshot and convert to base64 data URL
  let screenshotDataUrl = "";
  if (data.screenshot) {
    try {
      const imgRes = await fetch(data.screenshot);
      if (imgRes.ok) {
        const buffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const contentType = imgRes.headers.get("content-type") || "image/png";
        screenshotDataUrl = `data:${contentType};base64,${base64}`;
      }
    } catch {
      // If screenshot download fails, continue without it
      console.warn("Failed to download Firecrawl screenshot");
    }
  }

  return {
    screenshot: screenshotDataUrl,
    markdown: data.markdown || "",
    html: data.html || "",
    links: data.links || [],
    images: data.images || [],
    branding: data.branding || null,
    metadata: {
      title: data.metadata?.title || "",
      description: data.metadata?.description || "",
    },
  };
}
