import type { Metadata } from "next";
import Link from "next/link";
import {
  absolute,
  breadcrumbs,
  githubUrl,
  graph,
  issuesUrl,
  newIssueUrl,
  pageMetadata,
  securityReportUrl,
  siteUrl,
} from "@/lib/site";
import { JsonLd } from "../../json-ld";

export const metadata: Metadata = pageMetadata({
  path: "/contact",
  title: "Contact",
  description:
    "How to reach the people behind Parlour: bugs, questions and ideas on GitHub, and security problems in private.",
});

const page = {
  "@type": "ContactPage",
  name: "Contact Parlour",
  url: absolute("/contact"),
  about: { "@id": `${siteUrl}/#organization` },
};

export default function Contact() {
  return (
    <main className="book policy">
      <JsonLd data={graph(page, breadcrumbs([{ name: "Contact", path: "/contact" }]))} />
      <section className="opening" aria-labelledby="contact-title">
        <h1 id="contact-title">Contact</h1>
        <p className="lede">
          Parlour is an open source project, and it is run in the open on GitHub. That is where to find us.
        </p>
      </section>

      <section className="sheet" aria-labelledby="ways-heading">
        <h2 id="ways-heading">Ways to reach us</h2>
        <ul>
          <li>
            <strong>A bug, a question or an idea.</strong> <a href={newIssueUrl}>Open an issue</a>, or look
            through <a href={issuesUrl}>the ones already open</a> in case someone has asked before.
          </li>
          <li>
            <strong>A security problem.</strong> <a href={securityReportUrl}>Report it privately</a>, not in a
            public issue, so it can be fixed before anyone else knows. You will hear back within a week.
          </li>
          <li>
            <strong>Privacy.</strong> Open an issue, or use the private report for anything you would rather
            not say in public. The <Link href="/privacy">privacy policy</Link> says what is collected, which
            is very little.
          </li>
          <li>
            <strong>A contribution.</strong> Pull requests are welcome on <a href={githubUrl}>GitHub</a>. The
            most useful thing to add is a <Link href="/docs/providers">provider</Link>.
          </li>
        </ul>
      </section>

      <section className="sheet" aria-labelledby="first-heading">
        <h2 id="first-heading">Before you write</h2>
        <p>
          <Link href="/help">Help</Link> answers the common questions, and <Link href="/docs">the docs</Link>{" "}
          cover the rest. If Parlour is misbehaving, <code>parlour doctor</code> usually says why.
        </p>
      </section>
    </main>
  );
}
