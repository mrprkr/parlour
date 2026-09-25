import type { Metadata } from "next";
import Link from "next/link";
import { application, breadcrumbs, downloadUrl, graph, pageMetadata } from "@/lib/site";
import { JsonLd } from "../../json-ld";

export const metadata: Metadata = pageMetadata({
  path: "/pricing",
  title: "Pricing",
  description:
    "Parlour is free and open source: the CLI, the menu bar app and the source cost nothing, with no account and no subscription.",
});

export default function Pricing() {
  return (
    <main className="book policy">
      <JsonLd data={graph(application, breadcrumbs([{ name: "Pricing", path: "/pricing" }]))} />
      <section className="opening" aria-labelledby="pricing-title">
        <h1 id="pricing-title">Pricing</h1>
        <p className="lede">
          Parlour is free. It costs $0 to install and run, with no account, no subscription and no trial that
          runs out.
        </p>
      </section>

      <section className="sheet" aria-labelledby="free-heading">
        <h2 id="free-heading">What is free</h2>
        <ul>
          <li>
            <strong>The npm package, $0.</strong> The <code>parlour</code> CLI and server, everything it runs
            on your Mac, and every update.
          </li>
          <li>
            <strong>The menu bar app, $0.</strong> Parlour Server for macOS does the same setup with buttons.{" "}
            <a href={downloadUrl}>Download it</a> for a Mac with Apple silicon.
          </li>
          <li>
            <strong>The source, under the MIT licence.</strong> Use it, change it and share it, at home or at
            work.
          </li>
        </ul>
        <p>
          <Link href="/docs/getting-started">Getting started</Link> has it running in minutes.
        </p>
      </section>

      <section className="sheet" aria-labelledby="optional-heading">
        <h2 id="optional-heading">What you might pay someone else for</h2>
        <p>
          Nothing here is required. Leave them out and Parlour runs entirely on your Mac, at no cost and with
          nothing leaving the house.
        </p>
        <ul>
          <li>
            <strong>A cloud model.</strong> If you add an Anthropic key, Claude answers the questions the
            local model hands it, and Anthropic bills you for them at its own rates.
          </li>
          <li>
            <strong>A search provider.</strong> Some web search APIs charge for their use. Parlour passes on
            nothing and adds nothing.
          </li>
        </ul>
      </section>

      <section className="sheet" aria-labelledby="cloud-heading">
        <h2 id="cloud-heading">Parlour Cloud</h2>
        <p>
          We may one day offer Parlour Cloud, an optional paid service. It does not exist yet. If it launches
          it will be opt-in, and everything above stays free. The <Link href="/privacy">privacy policy</Link>{" "}
          says how it would handle your data.
        </p>
      </section>
    </main>
  );
}
