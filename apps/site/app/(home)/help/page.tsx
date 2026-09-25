import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { faq } from "@/lib/faq";
import { breadcrumbs, graph, issuesUrl, pageMetadata } from "@/lib/site";
import { JsonLd } from "../../json-ld";

export const metadata: Metadata = pageMetadata({
  path: "/help",
  title: "Help",
  description:
    "Answers to the common questions about Parlour: what it costs, what it needs, and what it can do.",
});

const questions = {
  "@type": "FAQPage",
  mainEntity: faq.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

export default function Help() {
  return (
    <main className="book policy">
      <JsonLd data={graph(questions, breadcrumbs([{ name: "Help", path: "/help" }]))} />
      <section className="opening" aria-labelledby="help-title">
        <h1 id="help-title">Help</h1>
        <p className="lede">
          The questions people ask first. For everything else there are <Link href="/docs">the docs</Link>,
          and for anything they do not answer, <Link href="/contact">get in touch</Link>.
        </p>
      </section>

      <section className="sheet" aria-labelledby="faq-heading">
        <h2 id="faq-heading">Questions</h2>
        {faq.map((item) => (
          <Fragment key={item.question}>
            <h3>{item.question}</h3>
            <p>
              {item.answer}
              {item.more ? (
                <>
                  {" "}
                  <Link href={item.more.href}>{item.more.label}</Link>.
                </>
              ) : null}
            </p>
          </Fragment>
        ))}
      </section>

      <section className="sheet" aria-labelledby="stuck-heading">
        <h2 id="stuck-heading">Still stuck?</h2>
        <p>
          Run <code>parlour doctor</code> first: it checks every part Parlour depends on and says what is
          missing. If that does not settle it, <a href={issuesUrl}>open an issue</a> with what it printed.
        </p>
      </section>
    </main>
  );
}
