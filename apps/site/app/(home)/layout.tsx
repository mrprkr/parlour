import Link from "next/link";
import type { ReactNode } from "react";
import { githubUrl, graph, issuesUrl, npmUrl, organisation, website } from "@/lib/site";
import { JsonLd } from "../json-ld";
import { Wordmark } from "../wordmark";

// The front page: the running head, the page, and the folio under it.
export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site">
      <JsonLd data={graph(organisation, website)} />
      <header className="running-head">
        <Link className="wordmark-link" href="/">
          <Wordmark />
        </Link>
        <nav aria-label="Site">
          <Link href="/docs">Docs</Link>
          <Link href="/help">Help</Link>
          <a href={githubUrl}>GitHub</a>
        </nav>
      </header>

      {children}

      <footer className="folio">
        <p>
          Parlour is released under the MIT licence. <a href={githubUrl}>Source</a>,{" "}
          <a href={issuesUrl}>issues</a>, <a href={npmUrl}>npm</a>.
        </p>
        <a className="folio-badge" href="https://index.stuntdouble.io/d/heyparlour.app?ref=badge">
          {/* biome-ignore lint/performance/noImgElement: an external badge, sized so it cannot shift the page */}
          <img
            src="https://index.stuntdouble.io/badge/heyparlour.app.svg"
            alt="heyparlour.app Stunt Double Index agent score"
            width="220"
            height="28"
          />
        </a>
        <nav className="folio-links" aria-label="More">
          <Link href="/docs">Docs</Link>
          <Link href="/docs/getting-started">Getting started</Link>
          <Link href="/docs/commands">Commands</Link>
          <Link href="/docs/home-assistant">Home Assistant</Link>
          <Link href="/docs/clients">Clients</Link>
          <Link href="/docs/tuning">Tuning</Link>
          <Link href="/docs/api">HTTP API</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/help">Help</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </footer>
    </div>
  );
}
