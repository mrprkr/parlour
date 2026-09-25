import { notFound } from "next/navigation";
import { markdownFor, markdownPaths } from "@/lib/llms";
import { absolute } from "@/lib/site";

// The markdown twin of a page. proxy.ts sends `/<page>.md`, and any request
// that prefers `Accept: text/markdown`, here.
export const dynamic = "force-static";

export async function GET(_request: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const slug = (await params).slug ?? [];
  const markdown = await markdownFor(slug);
  if (markdown === null) notFound();
  return new Response(markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      link: `<${absolute(`/${slug.join("/")}`)}>; rel="canonical"`,
      vary: "Accept",
    },
  });
}

export function generateStaticParams() {
  return markdownPaths().map((slug) => ({ slug }));
}
