import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/app/json-ld";
import { absolute, breadcrumbs, graph, pageMetadata } from "@/lib/site";
import { source } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

interface Props {
  params: Promise<{ slug?: string[] }>;
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const trail = [{ name: "Docs", path: "/docs" }];
  if (page.url !== "/docs") trail.push({ name: page.data.title, path: page.url });
  const article = {
    "@type": "TechArticle",
    headline: page.data.title,
    description: page.data.description,
    url: absolute(page.url),
    inLanguage: "en-GB",
    publisher: { "@id": absolute("/#organization") },
  };

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <JsonLd data={graph(article, breadcrumbs(trail))} />
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents({ a: createRelativeLink(source, page) })} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return pageMetadata({ path: page.url, title: page.data.title, description: page.data.description });
}
