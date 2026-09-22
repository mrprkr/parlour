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
  `img-src 'self' data: blob:${live}${isPreview ? " https://vercel.com" : ""}`,
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
};

// Fumadocs compiles content/docs: GitHub tables, heading ids and syntax
// highlighting come with it.
export default createMDX()(nextConfig);
