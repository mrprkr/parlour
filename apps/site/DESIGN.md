---
name: Parlour
description: A technical document, set in ink on paper, with one schematic and one accent.
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
    fontFamily: "Alegreya Sans, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "Alegreya Sans, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  detail:
    fontFamily: "Alegreya Sans, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Alegreya Sans SC, Alegreya Sans, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 700
    letterSpacing: "0.08em"
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
  transport-play:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.4rem 0.9rem"
  transport-play-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.plate}"
  transport-stepper:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.4rem 0.7rem"
  stage-disc:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.disc}"
    size: "1.4rem"
  stage-disc-lit:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.page}"
    rounded: "{rounded.disc}"
  stage-entry:
    textColor: "{colors.ink}"
    typography: "{typography.detail}"
    padding: "0.65rem 0.3rem 0.65rem 0"
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

The site reads like a well-set technical document: ink on paper, a hairline grid, a serif for the
headings and a sans for everything that is read or consulted. One drawing carries the argument, and
it is a schematic rather than an illustration. Seven numbered stages sit on a line, six of them
inside a boundary marked "on your Mac", and one dashed branch leaves that boundary. The privacy
claim is not written over a picture of a house; it is the shape of the diagram.

Colour is spent once. Ink and paper do all the structural work, and a single deep green marks
whichever stage is lit and nothing else. There is no illustration palette, no room tints and no
second accent. The night scheme is the same document under a lamp: the tokens are redefined, not
added to, and the lit numeral takes the page colour so it stays legible on either ground.

Depth is drawn, never lit. Rules separate things; boxes do not contain them. Everything shipped is
SVG and CSS: no rasters, no gradients, no shadows.

**Key Characteristics:**
- One schematic is the subject. It is built from the same data that sets the list beside it, so the
  drawing and the words cannot disagree.
- Rules, not boxes: hairlines separate; nothing is carded, lifted or shadowed.
- Ink carries the page and one green marks one thing at a time.
- One superfamily (Alegreya, Alegreya Sans, Alegreya Sans SC): serif headings, sans text, true small
  caps for labels and column heads.
- Copy is benefit first and mechanism second, in short sentences, British English, no em dashes.
- Motion is the question travelling, and it stops under reduced motion.

## Colors

Paper, ink, one grey, one rule and one accent. Nine tokens in total, each defined twice.

### Primary
- **Accent** (`{colors.accent}`): the single spend. The lit stage's disc on the diagram and in the
  list, the line the question is travelling along, the annotation on the branch when it is lit, the
  current page's ring in the docs rail, the dot in the mark, and every focus ring. Never a body text
  colour, never a link colour, never a button fill.
- **Accent wash** (`{colors.accent-wash}`): reserved for a filled state behind a lit element. Used
  sparingly and never as a section background.

### Neutral
- **Page** (`{colors.page}`): the ground of every page. Also the numeral inside a lit disc, so the
  numeral inverts correctly in both schemes.
- **Plate** (`{colors.plate}`): the sheet the drawing sits on, and the face of every control
  (install, play, steppers), a step above the page so a sheet reads as a sheet.
- **Ink** (`{colors.ink}`): headings, emphasis, control borders, the stage discs' outline, the rule
  under a list heading and under a table's column heads, and the pressed state of the play control.
- **Ink 2** (`{colors.ink-2}`): the second voice, and the site's default reading colour for body
  prose. Also the ledes, captions, the signal line and its arrowheads, the dashed branch, the
  diagram's detail labels, column heads, the folio and comments in code.
- **Rule** (`{colors.rule}`): every hairline: running head, folio, sheet divisions, list rows, table
  rows, the boundary on the diagram, the sheet's frame, code block borders and link underlines.
- **Code bg** (`{colors.code-bg}`): code blocks, inline code, and the hover fill of bordered
  controls.
- **Selection** (`{colors.selection}`): text selection only.

### The night scheme
Under `prefers-color-scheme: dark` every token above is redefined on `:root`, not added to. The
ground becomes a warm near-black, the ink becomes warm paper, and the accent lightens to
`{colors.night-accent}` so it clears 4.5:1 against the ground. Nothing else changes.

### Named Rules
**The One Spend Rule.** The accent marks what is lit and nothing else: the current stage, the line
it is travelling on, the current docs page, the dot in the mark, a focus ring. Anywhere else it is
wrong.

**The Two Colour Rule.** There is no illustration palette. A new figure is drawn in ink, ink 2 and
rule, and lights in the accent. If a drawing needs a third hue to be legible, it is the wrong
drawing.

**The Inverted Numeral Rule.** Text on the accent is `{colors.page}`, never white, so it reads in
both schemes.

## Typography

**Display Font:** Alegreya (with Iowan Old Style, Georgia, serif)
**Body Font:** Alegreya Sans (with Helvetica Neue, Helvetica, Arial)
**Label Font:** Alegreya Sans SC, 500 and 700
**Mono Font:** ui-monospace, SF Mono, Menlo (commands and config keys only)

**Character:** The serif names things and the sans explains them. Headings, the wordmark, contents
entries and table row heads are Alegreya; every paragraph, list, caption, table cell and label on
the diagram is Alegreya Sans; the small caps set the running head, the column heads and the place
name on the drawing. Everything is a true face, including the small caps; nothing is synthesised
with `text-transform`. The base is 17px at a 1.6 line height, so the page reads as a document
rather than a dashboard.

### Hierarchy
- **Display** (500, `clamp(2.3rem, 4.6vw, 3.4rem)`, 1.04, `-0.018em`): the front page headline,
  capped at 24ch. Its second sentence takes its own line above 30rem (`.turn-line`) so the break
  falls at the full stop rather than wherever the measure runs out. The docs reading page uses a
  lighter cut of the same role.
- **Headline** (500, `clamp(1.5rem, 2.6vw, 2rem)`, 1.18): sheet titles, capped at 28ch so they hold
  a shape. Docs `h2` is 1.55rem and `h3` is 1.2rem.
- **Title** (500, 1.3rem, 1.2): the wordmark, contents entries and their folio numbers, previous and
  next links. Table row heads take the same face at 1.05rem.
- **Lede** (400, 1.15rem, 1.5, ink 2): the paragraph beside the headline, capped at 46ch.
- **Body** (400, 17px, 1.6, ink 2): all prose, capped at `{spacing.measure}` on the front page and
  `{spacing.doc-measure}` in the docs. Paragraphs wrap `pretty`, headings `balance`.
- **Detail** (400 to 600, 0.88rem to 0.97rem): the stage list, captions, tables and the docs rail.
  Semibold ink for a name, ink 2 for the sentence under it.
- **Label** (700, 0.85rem to 0.95rem, 0.07em to 0.09em): true small caps for the running head, the
  stage list's heading, table captions and column heads, the place name on the diagram, and the
  docs rail's home link.
- **Mono** (0.86em of its parent): commands, config keys, the `$` prompt.
- **On the diagram**: stage names at 16 units semibold, details at 13.5 in ink 2, the place name at
  14 in small caps, the branch annotation at 13.5 italic. The drawing is capped at 60rem so its type
  lands at roughly the size of the page's type.

### Named Rules
**The Two Voices Rule.** Serif names, sans explains, small caps label. Do not add a fourth face.

**The Mono Is A Command Rule.** Monospace appears only inside `code`. Never for labels, kickers,
numbers or emphasis.

## Layout

One column `{spacing.book}` wide, centred, with a side gutter of `{spacing.gutter}`. The running
head sits at the top of every page with a rule beneath it, the folio at the foot with a rule above
it and `{spacing.folio}` of air before it. Each sheet below the opening starts with a hairline and
`{spacing.sheet}` of space.

The front page opens with the headline and, at 60rem and above, the lede plus the install control
beside it (`1.25fr` to `1fr`, baselines aligned at the foot). The diagram runs the full column width
below it on its own sheet, capped at 60rem and centred, with a caption beneath. The seven stages
follow as a ruled list under a heading that shares its rule with the transport: one column, two at
52rem, three at 76rem. Below 52rem the diagram keeps a 42rem minimum width and pans sideways inside
its frame, with a cue above the caption, so the line weights never thin.

Two-column sheets split evenly at 56rem and above; the installation sheet gives the commands
`1.4fr`. Tables at or below 40rem stack each row into a block, every cell carrying its column head
as a small-caps label.

The docs index is a contents list at 44rem. A docs reading page is a `{spacing.doc-measure}` column
of prose; at 64rem and above a `{spacing.rail}` rail sits to its left, sticky, and below that width
it wraps inline above the text.

Breakpoints, as used: 30rem (the headline's second sentence takes its own line), 40rem (tables
stack), 52rem (the diagram pans, stages go to two columns), 56rem (two-column sheets), 60rem (the
opening splits), 64rem (the docs rail goes sticky), 76rem (stages go to three columns).

## Elevation & Depth

No shadows, no blur, no gradients. Depth is line weight and fill: the spine is 1.5 units, the
boundary 1.5 in rule colour, a disc's outline 1.8 in ink, and the thing that matters is lit in the
accent. Surfaces separate with hairlines; the four bordered surfaces (the drawing's sheet, the
install control, the transport buttons and code blocks) are 1px lines, not raised objects. Hover on
a bordered control is a fill change to code bg over 160ms, never a lift.

### Named Rules
**The No Shadow Rule.** Nothing casts a shadow. If a surface needs separating, rule it; if it needs
attention, light it in the accent.

## Shapes

Square by default. Text, tables, lists and the drawing's frame have no radius. Controls that must
read as pressable take a 2px radius. The only circles are the stage discs on the diagram (radius 15
units, 1.8-unit stroke), their inline twins in the stage list (1.4rem, 1.5px), the rail's page dots
and the mark's dot. Line ends and joins are round. Dashes carry meaning: the one branch that leaves
the machine is dashed `5 6`; every line that stays inside it is solid.

## Components

### Buttons
Every control is a hairline box on plate, or a ruled row with no box at all.
- **Shape:** near-square (`{rounded.control}`), 1px solid ink. Pressed: the control moves down 1px.
- **Install control** (`install-control`): the `$` prompt in ink 2 mono, the command in mono, and a
  reserved "copy" word that becomes "copied" for 1.8s.
- **Play** (`transport-play`): labelled "Follow a question", "Pause" or "Again". Pressed, it inverts
  to plate on ink.
- **Steppers** (`transport-stepper`): the words "Back" and "Next"; no icon. Disabled: ink 2 text,
  rule border.
- **Stage entries** (`stage-entry`): no box. A ruled row with a disc, a semibold name and an ink 2
  sentence; hover underlines the name; the current entry lights its disc.
- **Focus:** every control and link takes the global accent outline (2px, 3px offset).

### Stage discs
- **On the diagram:** a plate-filled circle with a 1.8-unit ink stroke and a bold tabular numeral.
- **In text** (`stage-disc`): the same disc at 1.4rem with a 1.5px border.
- **Lit** (`stage-disc-lit`): fill and stroke accent, numeral in page colour. Only one at a time.
  With motion allowed, the disc settles from 1.4 scale over 420ms.

### Tables (the schedule)
Ruled the way a schedule is ruled. Row heads in the schedule of parts carry the stage disc when the
slot has one (1, 3, 4, 5, 6), so the table and the drawing are one system. A small-caps caption
above, small-caps column heads on an ink rule, serif row heads, hairlines between rows, an ink rule
closing the body. On a phone, rows stack and each cell prints its `data-label`.

### The limits list
What Parlour does not do, set as a bulleted-free ruled block: a semibold ink phrase, then the
explanation in ink 2, two columns at 56rem and above. No rules between entries; one rule above the
block.

### Code blocks
Code bg with a rule border and 2px corners, `1rem 1.1rem` padding, comments in ink 2. Inline code in
the docs takes the same fill with a `0.08em 0.3em` pad.

### Navigation
- **Running head:** the mark (a house outline at 1.05em, stroked in current colour with its accent
  dot) then the wordmark in serif; navigation in small caps, ink 2 to ink on hover; a rule beneath.
- **Folio:** 0.92rem in ink 2 under a rule: the licence and three links, nothing else.
- **Docs rail:** small-caps home link, then the pages with a ring before each; the current page's
  ring fills with the accent.
- **Turn:** previous and next at the foot of a doc, serif under a small-caps label.

### The diagram (signature)
An SVG signal path at `viewBox 0 10 960 276`, built from `steps.ts` and lit by `data-step` on the
wrapper. A hairline boundary labelled "on your Mac" in small caps holds six stages on one spine;
each stage is a disc, a name and a detail. Segments are drawn one per stage so the segment arriving
at the lit stage runs with it, each carrying a chevron at its midpoint. The seventh stage sits above
the boundary, joined by a dashed branch that is drawn crossing the boundary line, annotated "text
only, and only when asked". Nothing in the drawing is decorative: every mark is a stage, a signal or
a boundary.

## Do's and Don'ts

### Do:
- **Do** separate with hairlines in rule colour; close a list or a table body with a rule, not a box.
- **Do** spend the accent on exactly one thing at a time.
- **Do** draw new figures as schematics in ink, ink 2 and rule, with small caps for anything that
  names a place and a caption beneath.
- **Do** build a figure from the same data that sets the prose beside it.
- **Do** keep controls as 1px ink boxes on plate with a 2px corner, hover to code bg.
- **Do** define any new colour in both `:root` and the dark override.
- **Do** let a drawing pan on a phone rather than shrink its line weights.
- **Do** lead a section with what the reader gets, then say how it works.

### Don't:
- **Don't** add shadows, blur, gradients or a raster image; the site ships none.
- **Don't** draw the product as a picture of a house, a room or a device. The diagram explains the
  mechanism; it does not illustrate a scene.
- **Don't** put a tinted background behind a block of content.
- **Don't** use the accent as a text, link or button colour.
- **Don't** introduce a fourth face or fake small caps with `text-transform: uppercase`.
- **Don't** use monospace outside `code`.
- **Don't** add a kicker, eyebrow or badge above a heading.
- **Don't** card the stage list, the tables or the limits.
- **Don't** animate anything but the question travelling, and never outside
  `prefers-reduced-motion: no-preference`.
- **Don't** write a claim the code cannot keep, or reach for an em dash.

## Departures from the brief

Carried here as the record, not as drift:
- The install command and "Read the docs" sit beside the headline, not at the foot of the page, so
  the one action is in the first viewport at 1440 x 900.
- The stage list sits below the diagram rather than beside it: seven entries are taller than the
  drawing, and a side rail left the sheet lopsided.
- One superfamily serves display, text, labels and small caps rather than two unrelated faces.
