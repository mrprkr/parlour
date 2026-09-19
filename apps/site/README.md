# heyparlour.app

The marketing page, a Next.js app with a single route. Run it locally with
`pnpm dev` from this directory (or `pnpm exec nx run site:build` from the
root to build it the way Vercel does).

Edit `app/page.tsx` for words and `app/globals.css` for looks. `app/layout.tsx`
holds the metadata, the theme colours, the Young Serif font (fetched at build
time through `next/font`) and the Vercel Web Analytics component, which
injects its own script at runtime. `app/icon.svg` is the favicon by convention.

Vercel builds this directory with its Next.js builder; `vercel.json` only says
so. The security headers live in `next.config.ts` so that `next start` and
Vercel serve the same thing.
