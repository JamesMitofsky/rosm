import type { NextConfig } from "next";

// Two build targets from one codebase:
//   - default (Vercel): full Next.js — pages, API routes, PWA service worker.
//   - capacitor: static export of the frontend only (`out/`), bundled into the
//     native iOS app, which calls the Vercel-hosted `/api/*` over HTTPS.
// The Capacitor build excludes `app/api` via scripts/build-capacitor.mjs (route
// handlers can't be statically exported), and skips the service worker (the
// bundled assets are the shell — no SW under the capacitor:// scheme).
const isCapacitor = process.env.BUILD_TARGET === "capacitor";

const nextConfig: NextConfig = isCapacitor
  ? {
      output: "export",
      distDir: "out",
      images: { unoptimized: true },
    }
  : {
      async redirects() {
        return [
          // Old URL for the fountain browser — keep bookmarks/PWA shortcuts alive.
          { source: "/public-fountains", destination: "/fountains", permanent: true },
          // Sign-in moved from the planner-scoped URL to an app-wide gate.
          { source: "/plan/login", destination: "/login?returnTo=/plan", permanent: true },
        ];
      },
      async headers() {
        return [
          {
            // Service worker must not be cached so updates ship immediately.
            source: "/sw.js",
            headers: [
              { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
              { key: "Service-Worker-Allowed", value: "/" },
            ],
          },
        ];
      },
    };

export default nextConfig;
