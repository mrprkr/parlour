---
name: Parlour
description: A technical document in ink on paper. Short sections, ruled lists and tables, and docs served by Fumadocs in the same ink.
colors:
  page: "#f4f3ef"
  plate: "#fbfaf7"
  ink: "#17171a"
  ink-2: "#5d5d66"
  rule: "#dedcd4"
  accent: "#1f6350"
  accent-wash: "#e0ebe6"
  code-bg: "#ebe9e2"
  selection: "#d5e5df"
  night-page: "#111110"
  night-plate: "#181715"
  night-ink: "#eceae3"
  night-ink-2: "#a09e97"
  night-rule: "#34332e"
  night-accent: "#6cc0a3"
  night-accent-wash: "#16302a"
  night-code-bg: "#201f1c"
  night-selection: "#22403a"
typography:
  display:
    fontFamily: "Alegreya, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(2.3rem, 4.6vw, 3.4rem)"
    fontWeight: 500
    lineHeight: 1.04
    letterSpacing: "-0.018em"
  headline:
    fontFamily: "Alegreya, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(1.5rem, 2.6vw, 2rem)"
    fontWeight: 500
    lineHeight: 1.18
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Alegreya, Iowan Old Style, Georgia, serif"
    fontSize: "1.3rem"
    fontWeight: 500
    lineHeight: 1.2
  lede:
    fontFamily: "Geist, ui-sans-serif, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Geist, ui-sans-serif, Helvetica Neue, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  detail:
    fontFamily: "Geist, ui-sans-serif, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Geist, ui-sans-serif, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 600
    letterSpacing: "0.1em"
    textTransform: "uppercase"
  mono:
    fontFamily: "ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "0.86em"
rounded:
  none: "0"
  control: "2px"
  disc: "50%"
spacing:
  hair: "0.4rem"
  row: "0.7rem"
  line: "1rem"
  para: "1.2rem"
  block: "2.2rem"
  sheet: "clamp(3.5rem, 7vw, 6rem)"
  folio: "7rem"
  gutter: "clamp(1.25rem, 4vw, 3rem)"
  book: "74rem"
  measure: "66ch"
  doc-measure: "42rem"
  rail: "12rem"
components:
  install-control:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.control}"
    padding: "0.6rem 0.9rem"
  install-control-hover:
    backgroundColor: "{colors.code-bg}"
  running-head-link:
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
  running-head-link-hover:
    textColor: "{colors.ink}"
  code-block:
    backgroundColor: "{colors.code-bg}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.control}"
    padding: "1rem 1.1rem"
  schedule-row-head:
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    padding: "0.7rem 1.4rem 0.7rem 0"
  schedule-column-head:
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    padding: "0.7rem 1.4rem 0.7rem 0"
---

# Design System: Parlour

## Overview

**Creative North Star: "The Specification Sheet"**

The site reads like a well-set technical document: ink on paper, a hairline
grid, a serif for the headings and a sans for everything that is read or
consulted. There is no illustration and no diagram. The front page makes its
case in words: a headline, a lede, one install command, and short ruled
sections that each state one thing and support it in a sentence or two.

Colour is spent once. Ink and paper do the structural work, and a single deep
green marks the mark's dot, the current docs page, and focus. The night
scheme is the same document under a lamp: the tokens are redefined, not added
to.

Depth is drawn, never lit. Rules separate things; boxes do not contain them.
Nothing on the front page casts a shadow or carries a gradient.

The docs are Fumadocs. Its layout, sidebar, search, table of contents and
prose styles are used as they come, with its colour tokens pointed at the
same page, ink, rule and accent, so the two halves of the site read as one
document and both follow the system colour scheme.

**Key Characteristics:**
- Rules, not boxes: hairlines separate; nothing is carded, lifted or shadowed.
- Ink carries the page and one green marks one thing at a time.
- Two faces: Alegreya names things, Geist explains them and takes every control.
- Copy is benefit first and mechanism second, in short sentences, British
  English, no em dashes.
- The front page has no controls but the install button and links.
- The docs are Fumadocs in the site's own colours, not a second design.

## Colors

Paper, ink, one grey, one rule and one accent. Nine tokens in total, each
defined twice.

### Primary
- **Accent** (`{colors.accent}`): the single spend. The dot in the mark, the
  current page in the docs sidebar, every focus ring, and Fumadocs' primary.
  Never a body text colour, never a link colour, never a button fill on the
  front page.
- **Accent wash** (`{colors.accent-wash}`): the filled state behind the
  current docs page. Never a section background.

### Neutral
- **Page** (`{colors.page}`): the ground of every page.
- **Plate** (`{colors.plate}`): the face of the install control, and
  Fumadocs' cards and popovers, a step above the page.
- **Ink** (`{colors.ink}`): headings, emphasis, control borders, the rule
  under a table's column heads and the rule closing a table body.
- **Ink 2** (`{colors.ink-2}`): the second voice, and the default reading
  colour for body prose, ledes, step numbers, column heads, the folio and
  comments in code.
- **Rule** (`{colors.rule}`): every hairline: running head, folio, sheet
  divisions, list rows, table rows, code block borders and link underlines.
- **Code bg** (`{colors.code-bg}`): code blocks, inline code, and the hover
  fill of the install control.
- **Selection** (`{colors.selection}`): text selection only.

### The night scheme
Under `prefers-color-scheme: dark` every token above is redefined on `:root`,
not added to. The ground becomes a warm near-black, the ink becomes warm
paper, and the accent lightens to `{colors.night-accent}` so it clears 4.5:1
against the ground. Fumadocs reads the same variables, so the docs follow
without a second palette; its theme switch is turned off so the two halves
cannot disagree.

### Named Rules
**The One Spend Rule.** The accent marks the present moment and nothing
else: the current docs page, the dot in the mark, a focus ring. Anywhere
else it is wrong.

**The Two Colour Rule.** There is no illustration palette. A new figure, if
one is ever needed, is drawn in ink, ink 2 and rule.

## Typography

**Display Font:** Alegreya (with Iowan Old Style, Georgia, serif)
**Body Font:** Geist (with ui-sans-serif, Helvetica Neue, Arial)
**Label Role:** Geist 600, tracked and capitalised
**Mono Font:** ui-monospace, SF Mono, Menlo (commands and config keys only)

**Character:** Two faces, and they divide the work cleanly. Alegreya names
things: the headline, the sheet titles, the wordmark, step numbers and table
row heads. Geist explains them and takes every control: paragraphs, ledes,
tables, the step list and the navigation. The docs use Geist throughout, as
Fumadocs sets it, with the wordmark in Alegreya at the top of the sidebar.

The base is 17px at a 1.6 line height.

### Hierarchy
- **Display** (Alegreya 500, `clamp(2.3rem, 4.6vw, 3.4rem)`, 1.04, `-0.018em`):
  the front page headline, capped at 26ch. Its second sentence takes its own
  line above 30rem (`.turn-line`); keep both sentences short enough to hold a
  line at 26ch.
- **Headline** (Alegreya 500, `clamp(1.5rem, 2.6vw, 2rem)`, 1.18): sheet
  titles, capped at 28ch.
- **Title** (Alegreya 500, 1.3rem): the wordmark. Table row heads take the
  same face at 1.05rem, step numbers at 1.25rem.
- **Lede** (Geist 400, 1.15rem, 1.5, ink 2): the paragraph beside the headline,
  capped at 46ch.
- **Body** (Geist 400, 17px, 1.6, ink 2): all prose, capped at
  `{spacing.measure}`. Paragraphs wrap `pretty`, headings `balance`.
- **Detail** (Geist 400 to 600, 0.88rem to 0.97rem): tables and the folio.
- **Label** (Geist 600, 0.78rem, 0.1em, uppercase): table column heads and the
  stacked table's cell labels.
- **Navigation** (Geist 500, 0.95rem, `-0.005em`): the running head's links,
  in sentence case. They are never capitalised.
- **Mono** (0.86em of its parent): commands and config keys.

### Named Rules
**The Two Faces Rule.** Alegreya names, Geist explains and is clicked. Do not
add a third.

**The Label Is Not A Voice Rule.** Tracked capitals label a column. They never
carry a sentence, and they never appear in the navigation.

**The Mono Is A Command Rule.** Monospace appears only inside `code`.

## Layout

The front page is one column `{spacing.book}` wide, centred, with a side
gutter of `{spacing.gutter}`. The running head sits at the top with a rule
beneath it, the folio at the foot with a rule above it. Each sheet below the
opening starts with a hairline and `{spacing.sheet}` of space.

The opening is the headline and, at 60rem and above, the lede plus the
install control beside it (`1.25fr` to `1fr`, baselines aligned at the foot).
Below it the sheets run in order: how it works, privacy, clients, Home
Assistant, swapping parts, install, open source. Two-column sheets split
evenly at 56rem and above; the installation sheet gives the commands
`1.4fr`. Tables at or below 40rem stack each row into a block, every cell
carrying its column head as a label.

The docs take Fumadocs' layout: sidebar on the left, the page in the middle,
the table of contents on the right, collapsing to a drawer on a phone.
Nothing about that layout is overridden.

Breakpoints, as used on the front page: 30rem (the headline's second
sentence takes its own line), 40rem (tables stack), 56rem (two-column
sheets), 60rem (the opening splits).

## Elevation & Depth

No shadows, no blur, no gradients on the front page. Surfaces separate with
hairlines; the two bordered surfaces (the install control and the code
block) are 1px lines, not raised objects. Hover on the install control is a
fill change to code bg over 160ms, never a lift. The docs keep whatever
Fumadocs draws.

### Named Rules
**The No Shadow Rule.** Nothing on the front page casts a shadow. If a
surface needs separating, rule it.

## Shapes

Square by default. Text, tables and lists have no radius. The install
control and the code block take a 2px radius. The only circle is the mark's
dot.

## Components

### Controls
There is one on the front page.
- **Install control** (`install-control`): a 1px ink box on plate with a 2px
  corner, the `$` prompt in ink 2 mono, the command in mono, and a reserved
  "copy" word that becomes "copied" for 1.8s. Hover fills code bg over
  160ms; pressed, it moves down 1px.
- **Links**: prose links are ink with a rule-colour underline offset 0.2em,
  darkening on hover. Navigation links carry no underline and move from ink
  2 to ink.
- **Focus:** every control and link takes the accent outline (2px, 3px
  offset).

### The steps
"How it works" is a ruled list of five: a serif number in ink 2 at the left,
a semibold ink phrase, then the rest of the sentence in ink 2. One rule
above each entry and one closing the list. It is the whole pipeline, and it
is the only place the front page explains mechanism in order.

### Tables (the schedule)
Ruled the way a schedule is ruled: label-role column heads on an ink rule,
Alegreya row heads, hairlines between rows, an ink rule closing the body. On
a phone, rows stack and each cell prints its `data-label`.

### The notes
The limits, set as a ruled block: a semibold ink phrase, then the
explanation in ink 2, two columns at 56rem and above. One rule above the
block, none between entries. It states a limit as plainly as a feature; that
is the point of it.

### Code blocks
Code bg with a rule border and 2px corners, `1rem 1.1rem` padding, comments
in ink 2. In the docs, Fumadocs' own code blocks with syntax highlighting.

### Navigation
- **Running head:** the mark (a house outline at 1.05em, stroked in current
  colour with its accent dot) then the wordmark in Alegreya; links in Geist
  500, sentence case, ink 2 to ink on hover.
- **Folio:** 0.92rem in ink 2 under a rule: the licence and three links.
- **Docs:** Fumadocs' sidebar with the same wordmark at its head, search, the
  page list from `meta.json`, and a GitHub link at the foot.

## Do's and Don'ts

### Do:
- **Do** separate with hairlines in rule colour; close a list or a table body
  with a rule, not a box.
- **Do** spend the accent on the current docs page, the mark and focus, and
  nothing else.
- **Do** define any new colour in both `:root` and the dark override, and
  map it to a Fumadocs token if the docs need it.
- **Do** lead a section with what the reader gets, then say how it works.
- **Do** state a limit as plainly as a feature, and in the same breath.
- **Do** let Fumadocs draw the docs; change its tokens, not its components.

### Don't:
- **Don't** add shadows, blur, gradients or a raster image to the front page.
- **Don't** add a diagram or an illustration. The site had one and reads
  better without it.
- **Don't** put a transport, arrows or tabs on the front page.
- **Don't** put a tinted background behind a block of content.
- **Don't** use the accent as a text, link or button colour.
- **Don't** introduce a third family, or set tracked capitals anywhere they
  would carry a sentence.
- **Don't** capitalise the navigation.
- **Don't** use monospace outside `code`.
- **Don't** add a kicker, eyebrow or badge above a heading.
- **Don't** card the step list, the tables or the notes.
- **Don't** restyle Fumadocs' components by hand; a docs look that drifts
  from upstream is a maintenance cost with no reader benefit.
- **Don't** write a claim the code cannot keep, or reach for an em dash.

## Departures from the brief

Carried here as the record, not as drift:
- The install command and "Read the docs" sit beside the headline, not at the
  foot of the page, so the one action is in the first viewport at 1440 x 900.
- The scroll-driven schematic of the signal path was removed. The pipeline is
  now a five-step ruled list, which says the same thing in fewer words and
  needs no JavaScript.
- The docs moved from a hand-rolled rail and prose styles to Fumadocs, which
  brought search, a table of contents and syntax highlighting for the cost of
  mapping nine colour tokens.
- One serif and one grotesque replace the single superfamily, so the face a
  reader clicks is plainer than the face that names things.
