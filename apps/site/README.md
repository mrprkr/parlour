# heyparlour.app

The marketing page and the docs: a Next.js app with the App Router, and the
docs written in MDX. Run it locally with `pnpm dev` from this directory (or
`pnpm exec nx run site:build` from the root to build it the way Vercel does).

```text
app/page.tsx          the front page
app/diagram.tsx       the signal path, drawn from steps.ts
app/flow.tsx          the diagram and its stages, lit by the scroll
app/steps.ts          the seven stages: the one source for the drawing and the list
app/docs/page.tsx     the list of docs
app/docs/[slug]/      one route for every doc, rendered from content/docs
app/docs/pages.ts     the docs in reading order: slug, title, summary
app/docs/rail.tsx     the list of docs, beside the index and every page
app/layout.tsx        the header, the footer, the metadata and the font
app/globals.css       the one stylesheet
app/icon.svg          the favicon, by convention
content/docs/*.mdx    the docs themselves
mdx-components.tsx    how markdown becomes elements: links, tables
```

Edit `app/page.tsx` for the front page's words and `app/globals.css` for
looks; `DESIGN.md` is the design system those two answer to. `app/layout.tsx`
holds the metadata, the theme colours, Alegreya and Geist (fetched at build
time through `next/font`) and the Vercel Web Analytics component, which
injects its own script at runtime.

The front page has one drawing, and it is a schematic rather than an
illustration. It and the stage list beside it are both built from
`app/steps.ts`, so a change to a stage lands in both. The scroll is what
lights it: `flow.tsx` watches where the stage entries sit in the viewport and
sets `data-step`, and the CSS does the rest. There are no buttons.

To add a doc, write `content/docs/<slug>.mdx` and add it to `pages.ts`; the
index, the list on every page and the previous and next links follow from
that. Headings get ids from `rehype-slug`, so `#a-heading` links work the
way they do on GitHub. Link to another doc as `/docs/<slug>`.

Vercel builds this directory with its Next.js builder; `vercel.json` only says
so. The security headers live in `next.config.ts` so that `next start` and
Vercel serve the same thing.
