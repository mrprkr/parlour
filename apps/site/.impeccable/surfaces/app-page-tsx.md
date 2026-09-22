---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["app/globals.css","app/layout.tsx","app/docs/page.tsx","app/walk.tsx","app/house.tsx"]
---

# Front page: heyparlour.app

Scope: `app/page.tsx` with `app/globals.css`, the docs index at `app/docs/page.tsx`, and the shared header and footer in `app/layout.tsx`. Docs reading pages keep their structure and take only the tokens.

Visitor mode: Persuade on `/`; Read on `/docs`.

Audience and job: a Home Assistant owner with an Apple silicon Mac deciding whether to install. Action: copy `npm install -g parlour`, read the docs. Proof: the mechanism shown with its real numbers; the non-features stated plainly. No screenshots, quotes, counts or benchmarks exist and none are invented.

Constraints: Next.js App Router, MDX docs, Vercel. British English, no em dashes. Biome. Light JS: SVG plus one small client component for the walk. Facts fixed, structure and copy free. Anti-goals: SaaS landing shapes, claims beyond 0.1.0, blurry or thin drawing, motion that hides content.

Unresolved: whether `.impeccable/live/config.json` is committed; the wake word gap ("Hey Parlour" on the page, `hey_jarvis` shipped) is stated on the page, not hidden.

## Direction contract

THESIS: The page is a cross-section plate from a reference book: the house cut open so you can see where every part of Parlour lives and watch one sentence travel through the walls to the Mac and back. It refuses the headline-plus-three-cards landing page; the drawing is the page and the house, not the terminal, is the subject.

OWN-WORLD: White plate ground, near-black ink, an illustrator's wash palette: brick red for the walls, slate blue for the sound and the Mac, leaf green for the garden line and the lit callout. Dark scheme is the night plate: ink ground, pale line, same washes dimmed. Pen line at two weights, wash fills with no gradients, numbered callout discs with leader lines, a ruled key column, running heads and folios in small caps. Display face with a point of view from the reference-book world; a workhorse text face for prose; a monospace only inside commands. Rules, not boxes; no cards.

STORY: Within seconds the visitor sees a house with a Mac in the study and microphones in the other rooms, a person speaking in the kitchen, and a cloud on one thin line labelled text only. They understand that audio never leaves the house and that the cloud is asked one question at a time, then they copy the install command or step through the walk to see each stage with its real numbers.

FIRST VIEWPORT: Plate title top-left, two lines, the offer. Header as the running head. The section fills the left three quarters: two storeys, roof off, kitchen and sitting room below, study and bedroom above; the Mac on the study desk; phone on the sofa; Voice PE on the kitchen shelf; a small board in the loft; a person in the kitchen with a speech line; sound arcs through the doorway and up the stairs to the Mac; a cloud above the roof with one thin dashed line down to the Mac. Callout discs 1 to 7 on the drawing. The key column on the right, sticky: the seven callouts with their one-line facts, then the install command as the one control with a copy action, then "Read the docs". Signature interaction: a walk control (play, step, arrow keys, or scroll position) moves the sentence through the house; the active callout lights green on the drawing and in the key and a text line names the step. Reduced motion shows stepped keyframes; without JS the full plate and key render static.

ADAPTATIONS (cited at the finish review): the install command and "Read the docs" sit under the lede in the head, not at the foot of the key, because at 1440x900 the key's foot falls near y=1200 and the one action must be in the first viewport; the walk transport (play, back, next) sits at the head of the key column for the same reason, with the step caption under the plate. One superfamily (Alegreya and Alegreya Sans) serves as both display and text face.

FORM: The Cutaway House, candidate 2 of the grounded list, chosen by the user from the safer hand after two re-rolls. Seed key dfc4c9d3. Code-led build; no comp.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
