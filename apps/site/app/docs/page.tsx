import type { Metadata } from "next";
import Link from "next/link";
import { docPages } from "./pages";
import { DocsRail } from "./rail";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How Parlour is put together, how to extend it, how it fits Home Assistant, and how to tune the way it listens and answers.",
};

export default function DocsIndex() {
  return (
    <main className="doc docs-index">
      <DocsRail />

      <article className="prose">
        <h1>Docs</h1>
        <p className="lede">
          Seven pages, in the order they are worth reading. Start with the architecture if you want to know
          how the pieces fit, skip to Home Assistant if you would rather have it working tonight, and come
          back to tuning when you want it to listen and answer the way you like. The{" "}
          <Link href="/">front page</Link> is the short version, and the{" "}
          <a href="https://github.com/mrprkr/parlour#readme">README</a> has the install and the commands.
        </p>
        <ol className="contents">
          {docPages.map((page, index) => (
            <li key={page.slug}>
              <span className="folio-num" aria-hidden="true">
                {index + 1}
              </span>
              <Link className="doc-link" href={`/docs/${page.slug}`}>
                {page.title}
              </Link>
              <p className="summary">{page.summary}</p>
            </li>
          ))}
        </ol>
      </article>
    </main>
  );
}
