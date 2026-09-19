import type { Metadata } from "next";
import Link from "next/link";
import { docPages } from "./pages";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How Parlour is put together, how to extend it, and which setting to turn when something is not right.",
};

export default function DocsIndex() {
  return (
    <main className="book docs-index">
      <h1>Docs</h1>
      <p className="lede">
        The short version is on the <Link href="/">front page</Link>. These are the long ones: how Parlour is
        put together, how to extend it, and which setting to turn when it keeps waking up for the television.
        The <a href="https://github.com/mrprkr/parlour#readme">README</a> has the commands and the ten minute
        setup.
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
    </main>
  );
}
