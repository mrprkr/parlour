# heyparlour.app

The marketing page and the docs: a Next.js app with the App Router, and the
docs written in MDX and served by [Fumadocs](https://fumadocs.dev). Run it
locally with `pnpm dev` from this directory (or `pnpm exec nx run site:build`
from the root to build it the way Vercel does).

```text
app/(home)/page.tsx     the front page
app/(home)/layout.tsx   the running head and the folio around it
app/docs/layout.tsx     the Fumadocs layout: sidebar, search, table of contents
app/docs/[[...slug]]/   one route for every doc, rendered from content/docs
app/api/search/         the search index Fumadocs queries
app/layout.tsx          the html, the metadata, the fonts and the Fumadocs provider
app/globals.css         the one stylesheet, Tailwind and the Fumadocs preset included
app/wordmark.tsx        the mark and the name, in the head and the docs nav
app/install-button.tsx  the one control on the front page
app/icon.svg            the favicon, by convention
lib/source.ts           where the docs come from
lib/layout.shared.tsx   the nav Fumadocs draws
content/docs/*.mdx      the docs themselves, each with a title and a description
content/docs/meta.json  the docs in reading order
mdx-components.tsx      the components markdown becomes
```

Edit `app/(home)/page.tsx` for the front page's words and `app/globals.css`
for looks; `DESIGN.md` is the design system those two answer to.
`app/layout.tsx` holds the metadata, the theme colours, Alegreya and Geist
(fetched at build time through `next/font`) and the Vercel Web Analytics
component, which injects its own script at runtime.

The docs are Fumadocs with its tokens pointed at the site's own ink, paper
and green, so both halves follow the system colour scheme. To add a doc,
write `content/docs/<slug>.mdx` with `title` and `description` in its
frontmatter and add the slug to `meta.json`; the sidebar, the search index
and the previous and next links follow from that. Headings get ids, so
`#a-heading` links work the way they do on GitHub. Link to another doc as
`/docs/<slug>`.

Vercel builds this directory with its Next.js builder; `vercel.json` only says
so. The security headers live in `next.config.ts` so that `next start` and
Vercel serve the same thing.
