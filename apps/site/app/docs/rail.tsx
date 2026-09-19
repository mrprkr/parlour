import Link from "next/link";
import { docPages } from "./pages";

/**
 * The list of docs, in reading order. It sits to the left of whatever is
 * being read, on the index and on every page, so the whole section is one
 * shape and the page you are on is always marked.
 */
export function DocsRail({ current }: { current?: string }) {
  return (
    <nav className="rail" aria-label="Docs">
      <Link className="rail-home" href="/docs">
        Docs
      </Link>
      <ol>
        {docPages.map((entry) => (
          <li key={entry.slug} className={entry.slug === current ? "lit" : undefined}>
            <Link
              className="rail-link"
              href={`/docs/${entry.slug}`}
              aria-current={entry.slug === current ? "page" : undefined}
            >
              {entry.title}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
