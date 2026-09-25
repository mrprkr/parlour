import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
// Preview deployments inject the Vercel toolbar from vercel.live; production does not.
const isPreview = process.env.VERCEL_ENV === "preview";
const live = isPreview ? " https://vercel.live" : "";

// Everything the site loads is its own: fonts are self-hosted by next/font and
// analytics is served from /_vercel. Inline scripts stay allowed because Next's
// hydration payload and the theme script are inline, and nonces would force
// every page to render dynamically. Dev needs eval for React refresh.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${live}`,
  `style-src 'self' 'unsafe-inline'${live}`,
  // The Stunt Double Index badge in the footer is the one image from elsewhere.
  `img-src 'self' data: blob: https://index.stuntdouble.io${live}${isPreview ? " https://vercel.com" : ""}`,
  `font-src 'self'${live}${isPreview ? " https://assets.vercel.com" : ""}`,
  `connect-src 'self'${isDev ? " ws:" : ""}${isPreview ? " https://vercel.live wss://ws-us3.pusher.com" : ""}`,
  `frame-src ${isPreview ? "https://vercel.live" : "'none'"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

// The four headers vercel.json used to add, plus the CSP, applied by Next so
// that a local `next start` and Vercel agree.
const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "microphone=(), camera=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // The agent documents live at the addresses agents look for them, served
  // by plain route handlers so there is no dot directory under app/.
  async rewrites() {
    return [
      { source: "/.well-known/agents.md", destination: "/agents.md" },
      { source: "/.well-known/mcp/server-card.json", destination: "/mcp/server-card.json" },
      { source: "/.well-known/mcp.json", destination: "/mcp/server-card.json" },
      { source: "/.well-known/api-catalog", destination: "/api-catalog" },
    ];
  },
  async redirects() {
    return [
      { source: "/developers", destination: "/docs/api", permanent: false },
      { source: "/api-docs", destination: "/docs/api", permanent: false },
      { source: "/support", destination: "/help", permanent: false },
      { source: "/faq", destination: "/help", permanent: false },
    ];
  },
};

// Fumadocs compiles content/docs: GitHub tables and heading ids come with it,
// and lib/source.ts hands the code blocks to Twinkleplop.
export default createMDX()(nextConfig);
