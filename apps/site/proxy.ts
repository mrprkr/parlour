import { isMarkdownPreferred } from "fumadocs-core/negotiation";
import { type NextRequest, NextResponse } from "next/server";

// Every page has a markdown twin under /md. Ask for `/<page>.md`, or for the
// page itself with `Accept: text/markdown`, and that is what comes back.
// Browsers never ask for markdown, so people see the same pages as before.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.endsWith(".md")) {
    const page = pathname === "/index.md" ? "" : pathname.slice(0, -".md".length);
    return NextResponse.rewrite(new URL(`/md${page}`, request.nextUrl));
  }

  if (isMarkdownPreferred(request)) {
    return NextResponse.rewrite(new URL(`/md${pathname === "/" ? "" : pathname}`, request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  // Only the pages: /.well-known/agents.md is a document of its own, not a twin.
  matcher: [
    "/",
    "/pricing",
    "/help",
    "/contact",
    "/docs",
    "/docs/:path*",
    "/index.md",
    "/pricing.md",
    "/help.md",
    "/contact.md",
    "/docs.md",
  ],
};
