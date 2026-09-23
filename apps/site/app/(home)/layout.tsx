import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "../wordmark";

// The front page: the running head, the page, and the folio under it.
export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site">
      <header className="running-head">
        <Link className="wordmark-link" href="/">
          <Wordmark />
        </Link>
        <nav aria-label="Site">
          <Link href="/docs">Docs</Link>
          <a href="https://github.com/mrprkr/parlour">GitHub</a>
        </nav>
      </header>

      {children}

      <footer className="folio">
        <p>
          Parlour is released under the MIT licence. <a href="https://github.com/mrprkr/parlour">Source</a>,{" "}
          <a href="https://github.com/mrprkr/parlour/issues">issues</a>,{" "}
          <a href="https://www.npmjs.com/package/parlour">npm</a>.
        </p>
        <p>
          <Link href="/privacy">Privacy</Link>
        </p>
      </footer>
    </div>
  );
}
