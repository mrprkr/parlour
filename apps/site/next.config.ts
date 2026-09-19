import { createMDX } from "fumadocs-mdx/next";
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
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

// Fumadocs compiles content/docs: GitHub tables, heading ids and syntax
// highlighting come with it.
export default createMDX()(nextConfig);
