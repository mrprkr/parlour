import createMDX from "@next/mdx";
import type { NextConfig } from "next";

// The same four headers vercel.json used to add, now applied by Next so that
// a local `next start` and Vercel agree.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "microphone=(), camera=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "mdx"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

// Plugins are named as strings so Turbopack can load them: a function cannot
// cross into Rust. remark-gfm is for the tables, rehype-slug gives every
// heading an id so the in-page links in the docs land somewhere.
const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
    rehypePlugins: ["rehype-slug"],
  },
});

export default withMDX(nextConfig);
