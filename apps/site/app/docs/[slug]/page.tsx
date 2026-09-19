import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { docPage, docPages, neighbours } from "../pages";
import { DocsRail } from "../rail";

interface Params {
  params: Promise<{ slug: string }>;
}

// Every page is known ahead of time, so the whole section is static and an
// unknown slug is a 404 rather than a build at request time.
export const dynamicParams = false;

export function generateStaticParams() {
  return docPages.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const page = docPage(slug);
  if (!page) return {};
  return { title: page.title, description: page.summary };
}

export default async function DocPage({ params }: Params) {
  const { slug } = await params;
  const page = docPage(slug);
  if (!page) notFound();

  const { default: Content } = await import(`@/content/docs/${slug}.mdx`);
  const { previous, next } = neighbours(slug);

  return (
    <main className="doc">
      <DocsRail current={slug} />

      <article className="prose">
        <h1>{page.title}</h1>
        <Content />
      </article>

      <nav className="turn" aria-label="Previous and next">
        {previous ? (
          <Link className="turn-link" href={`/docs/${previous.slug}`} rel="prev">
            <span className="label">Previous</span>
            {previous.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link className="turn-link" href={`/docs/${next.slug}`} rel="next">
            <span className="label">Next</span>
            {next.title}
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
