# heyparlour.app

The marketing page and the docs. A Next.js app with the App Router, and the
docs written in MDX. Vercel builds it from `main`, and every pull request
gets a preview.

```text
app/page.tsx          the front page
app/docs/page.tsx     the list of docs
app/docs/[slug]/      one route for every doc, rendered from content/docs
app/docs/pages.ts     the docs in reading order: slug, title, summary
app/globals.css       the one stylesheet
content/docs/*.mdx    the docs themselves
mdx-components.tsx    how markdown becomes elements: links, tables
```

To add a doc, write `content/docs/<slug>.mdx` and add it to `pages.ts`; the
index, the list on every page and the previous and next links follow from
that. Headings get ids from `rehype-slug`, so `#a-heading` links work the
way they do on GitHub. Link to another doc as `/docs/<slug>`.

```sh
pnpm -C apps/site dev       # http://localhost:3000
pnpm exec nx run site:build
```

`vercel.json` only names the framework. The security headers are in
`next.config.ts`.
