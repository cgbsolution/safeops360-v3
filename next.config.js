/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Production: cache-friendly + smaller bundles
  compress: true,
  poweredByHeader: false,
  // Self-contained server build for the on-prem Docker image (deploy/Dockerfile.frontend
  // sets DOCKER_BUILD=1). Left undefined on Vercel so the existing cloud build is
  // unaffected.
  ...(process.env.DOCKER_BUILD ? { output: "standalone" } : {}),
  // Skips re-running ESLint on every build. Lint is run in CI / pre-commit.
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }]
  },
  // ── Analytics Navigation Reset ──────────────────────────────────────────
  //
  // Every route below was a standalone analytics screen or a dashboard that
  // has been folded into a register workspace tab. They are DELETED, not
  // hidden: the page files are gone. These redirects exist because a URL that
  // worked yesterday is in someone's bookmarks, in a Slack message and in the
  // browser history of everyone who used it, and a 404 tells them the feature
  // was removed rather than moved.
  //
  // `permanent: false` (307) on purpose. A 308 is cached by the browser
  // indefinitely and would survive a later change of mind about the IA; these
  // are cheap to keep and cost one hop.
  //
  // Internal links were repointed at the new URLs directly rather than left to
  // bounce through here — see the grep in the build notes.
  async redirects() {
    const toTab = (from, to) => ({ source: from, destination: to, permanent: false });
    return [
      toTab("/observations/analytics", "/observations?tab=analytics"),
      toTab("/near-miss/analytics", "/near-miss?tab=analytics"),
      toTab("/incidents/analytics", "/incidents?tab=analytics"),
      toTab("/capa/analytics", "/capa?tab=analytics"),
      toTab("/hira/analytics", "/hira?tab=analytics"),
      toTab("/eai/analytics", "/eai?tab=analytics"),
      toTab("/moc/analytics", "/moc?tab=analytics"),
      toTab("/inspections/analytics", "/inspections?tab=analytics"),
      toTab("/training/analytics", "/training?tab=analytics"),
      // Audit Analytics & Benchmarking split across two tabs of one workspace;
      // the old URL lands on the lifecycle half, which is what it opened with.
      toTab("/cams/analytics", "/cams/audits?tab=analytics"),
      // The combined register lists HIRA + EAI, so its Analytics tab is the
      // aggregation dashboard. The contract's EnterpriseRisk flow moved to the
      // ERM register, where its population actually lives.
      toTab("/risk-register/analytics", "/erm/register?tab=analytics"),
      toTab("/risk-dashboard", "/risk-register?tab=analytics"),
      // MIS Dashboard + Multi-period Trends merged into one page with a grain
      // toggle; each old URL lands on the grain it used to show.
      toTab("/manhours/mis-dashboard", "/manhours/performance"),
      toTab("/manhours/trends", "/manhours/performance?view=trends"),
      // The Analytics Explorer is gone. Its drill-down is every register's
      // Analytics tab; its backlog band is now on Cross-Module Signals.
      toTab("/analytics", "/signals"),
    ];
  },
  async headers() {
    // Baseline security headers on every response. CSP is intentionally
    // omitted here — a strict Content-Security-Policy needs per-route testing
    // against Next.js inline styles/scripts and should be rolled out as a
    // Report-Only policy first, then enforced.
    const securityHeaders = [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
      { key: "X-DNS-Prefetch-Control", value: "on" }
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    // Tree-shake icon + Radix barrel imports. Without this every page that
    // imports a single icon from lucide-react pulls thousands of others into
    // the dev build, which is a major reason `next dev` feels slow on
    // first-visit to a route. Production bundles also shrink noticeably.
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-avatar",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast",
      "@radix-ui/react-tooltip",
      "date-fns",
      "recharts"
    ]
  }
};

module.exports = nextConfig;
