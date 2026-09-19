---
name: Parlour
description: A technical document in ink on paper, with one schematic the scroll draws in.
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
    padding: "1.1rem 0"
  stage-entry-passive:
    opacity: 0.45
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

The drawing is not a widget with buttons on it. It sticks beside its stages and the page's own
scroll drives it: as each stage passes the trigger line the path fills in behind it, that stage's
disc lights, and the others step back. There is nothing to press, so there is nothing to explain.

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
- Two faces: Alegreya names things, Geist explains them and takes every control.
- Copy is benefit first and mechanism second, in short sentences, British English, no em dashes.
- Scroll is the only control on the front page: no transport, no arrows, no tabs.
- Motion is the question travelling, and it stops under reduced motion.

## Colors

Paper, ink, one grey, one rule and one accent. Nine tokens in total, each defined twice.

### Primary
- **Accent** (`{colors.accent}`): the single spend. The stretch of path the question has already
  travelled, the current stage's disc on the diagram and in the list, the annotation on the branch
  while it is lit, the current page's ring in the docs rail, the dot in the mark, and every focus
  ring. Never a body text colour, never a link colour, never a button fill.
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
**The One Spend Rule.** The accent marks progress and the present moment, and nothing else: the
path already travelled, the current stage, the current docs page, the dot in the mark, a focus
ring. Anywhere else it is wrong.

**The One Disc Rule.** The path fills cumulatively as the reader scrolls, but only one disc is ever
lit. Progress is a line; attention is a disc. Filling every disc behind the reader turns the whole
drawing green and loses the thing to look at.

**The Two Colour Rule.** There is no illustration palette. A new figure is drawn in ink, ink 2 and
rule, and lights in the accent. If a drawing needs a third hue to be legible, it is the wrong
drawing.

**The Inverted Numeral Rule.** Text on the accent is `{colors.page}`, never white, so it reads in
both schemes.

## Typography

**Display Font:** Alegreya (with Iowan Old Style, Georgia, serif)
**Body Font:** Geist (with ui-sans-serif, Helvetica Neue, Arial)
**Label Role:** Geist 600, tracked and capitalised
**Mono Font:** ui-monospace, SF Mono, Menlo (commands and config keys only)

**Character:** Two faces, and they divide the work cleanly. Alegreya names things: the headline, the
sheet titles, the wordmark, contents entries and table row heads. Geist explains them and takes
every control: paragraphs, ledes, captions, tables, the stage list, the labels on the drawing and
the navigation. A grotesque beside a serif with this much character keeps the page from reading as
a pamphlet, and it is the face the reader clicks, so it is the one that has to be plain.

There is no third family and no small-caps cut. Where a line names a column, a place or a direction
it is Geist at 600, 0.1em tracked and set in capitals, small enough that it labels rather than
speaks. The base is 17px at a 1.6 line height.

### Hierarchy
- **Display** (Alegreya 500, `clamp(2.3rem, 4.6vw, 3.4rem)`, 1.04, `-0.018em`): the front page
  headline, capped at 26ch. Its second sentence takes its own line above 30rem (`.turn-line`) so
  the break falls at the full stop; keep both sentences short enough to hold a line at 26ch.
- **Headline** (Alegreya 500, `clamp(1.5rem, 2.6vw, 2rem)`, 1.18): sheet titles, capped at 28ch.
  Docs `h2` is 1.55rem and `h3` is 1.2rem.
- **Title** (Alegreya 500, 1.3rem): the wordmark, contents entries and their folio numbers,
  previous and next links. Table row heads take the same face at 1.05rem.
- **Lede** (Geist 400, 1.15rem, 1.5, ink 2): the paragraph beside the headline, capped at 46ch, and
  the paragraph under the docs title.
- **Body** (Geist 400, 17px, 1.6, ink 2): all prose, capped at `{spacing.measure}` on the front page
  and `{spacing.doc-measure}` in the docs. Paragraphs wrap `pretty`, headings `balance`.
- **Detail** (Geist 400 to 600, 0.88rem to 0.97rem): the stage list, captions, tables and the docs
  rail. Semibold ink for a name, ink 2 for the sentence under it.
- **Label** (Geist 600, 0.7rem to 0.78rem, 0.1em, uppercase): the stage list's heading, table
  captions and column heads, the stacked table's cell labels, the place name on the drawing, the
  docs rail's home link, and "Previous" and "Next".
- **Navigation** (Geist 500, 0.95rem, `-0.005em`): the running head's links, in sentence case. They
  are the plainest thing on the page on purpose; they are not labels and are never capitalised.
- **Mono** (0.86em of its parent): commands, config keys, the `$` prompt.
- **On the drawing**: stage names at 17 units semibold, details at 14 in ink 2, the place name at 13
  capitalised and tracked, numerals at 13.

### Named Rules
**The Two Faces Rule.** Alegreya names, Geist explains and is clicked. Do not add a third.

**The Label Is Not A Voice Rule.** Tracked capitals label a column, a place or a direction. They
never carry a sentence, and they never appear in the navigation.

**The Mono Is A Command Rule.** Monospace appears only inside `code`.

## Layout

One column `{spacing.book}` wide, centred, with a side gutter of `{spacing.gutter}`. The running
head sits at the top of every page with a rule beneath it, the folio at the foot with a rule above
it. Each sheet below the opening starts with a hairline and `{spacing.sheet}` of space.

The front page opens with the headline and, at 60rem and above, the lede plus the install control
beside it (`1.25fr` to `1fr`, baselines aligned at the foot).

Below it is the scroll-driven section, and it is the shape of the page. At 64rem and above it is
two columns, `26rem` for the drawing and the rest for the stages. The drawing sticks at `17vh` and
the stages scroll past it; each stage is given `22vh` of minimum height so it has room to cross the
trigger line on its own. Below 64rem the two stack and the drawing sticks to the top of the
viewport with the page's own background behind it, which is why it is capped by height (`58vh`)
rather than by width: it can never grow taller than the screen it is pinned to. The drawing is
portrait, so nothing pans sideways at any width.

Two-column sheets split evenly at 56rem and above; the installation sheet gives the commands
`1.4fr`. Tables at or below 40rem stack each row into a block, every cell carrying its column head
as a label.

The docs are one shape: a rail of every page on the left and what is being read on the right, on
the index and on each page alike. At 64rem and above the rail is `{spacing.rail}` wide and sticky;
below that it wraps inline above the text. The index puts the contents list where a doc puts its
prose.

Breakpoints, as used: 30rem (the headline's second sentence takes its own line), 40rem (tables
stack), 56rem (two-column sheets), 60rem (the opening splits), 64rem (the scroll section and the
docs go side by side, and both rails go sticky).

## Elevation & Depth

No shadows, no blur, no gradients. Depth is line weight and fill: the spine is 1.5 units, the
boundary 1.5 in rule colour, a disc's outline 1.8 in ink, and the thing that matters is lit in the
accent. On the drawing, the only thing that moves is a disc growing 12% as it becomes current. Surfaces separate with hairlines; the four bordered surfaces (the drawing's sheet, the
install control and code blocks) are 1px lines, not raised objects. Hover on
a bordered control is a fill change to code bg over 160ms, never a lift.

### Named Rules
**The No Shadow Rule.** Nothing casts a shadow. If a surface needs separating, rule it; if it needs
attention, light it in the accent.

## Shapes

Square by default. Text, tables, lists and the drawing's frame have no radius. Controls that must
read as pressable take a 2px radius. The only circles are the stage discs on the diagram (radius 15
units, 1.8-unit stroke), their inline twins in the stage list (1.4rem, 1.5px), the rail's page dots
and the mark's dot. Line ends and joins are round. Dashes carry meaning: the one branch that leaves
the machine is dashed `5 6` and runs while it is current; every line that stays inside it is
solid.

## Components

### Controls
There are two on the whole site, and neither is on the drawing.
- **Install control** (`install-control`): a 1px ink box on plate with a 2px corner, the `$` prompt
  in ink 2 mono, the command in mono, and a reserved "copy" word that becomes "copied" for 1.8s.
  Hover fills code bg over 160ms; pressed, it moves down 1px.
- **Links**: prose links are ink with a rule-colour underline offset 0.2em, darkening on hover.
  Navigation, rail and contents links carry no underline and move from ink 2 to ink.
- **Focus:** every control and link takes the accent outline (2px, 3px offset).

The front page has no buttons, no tabs and no transport. The scroll is the only thing that drives
the drawing, so there is nothing to press and nothing to explain.

### The drawing (signature)
An SVG signal path at `viewBox 0 0 440 580`, built from `steps.ts` and lit by `data-step` on the
wrapper. It runs top to bottom, the way the page is read. A hairline boundary labelled "on your
Mac" holds six stages on one vertical spine at `x 246`; each stage is a disc with its name and the
part that does it ranged right against the spine, so the words stack in a clean column and the line
stays clear. Segments are drawn one per stage, each with a chevron at its midpoint pointing down.
The seventh stage sits outside the boundary to the right, reached by a dashed branch drawn crossing
the boundary line, and is named above its disc with "text only, when asked" beneath it. Every mark
is a stage, a signal or a boundary; nothing is decorative.

### The stages, and how the scroll drives them
The seven stages are a ruled list beside the drawing, and they are also the scroll. A stage becomes
current when its entry passes 58% of the viewport height, measured on scroll behind a
`requestAnimationFrame`. From `data-step` the CSS does three things at once:
- **The path fills.** Every segment up to the current stage runs in the accent, so scrolling draws
  the line in behind the reader. The branch lights only while the cloud is current.
- **One disc lights.** The current stage's disc fills with the accent, its numeral takes the page
  colour, and it scales to 1.12.
- **The rest step back.** Entries that are not current drop to `0.45` opacity. Before the section is
  reached (`data-step="0"`) every entry reads at full strength, so the list is never dim on arrival.

Every line on the drawing takes its stroke from one inherited `--line` property, so lighting a
stretch of path is a single declaration on the group rather than a selector per stroke.

### Stage discs
- **On the drawing:** a plate-filled circle with a 1.8-unit ink stroke and a semibold numeral.
- **In text** (`stage-disc`): the same disc at 1.4rem with a 1.5px border.
- **Lit** (`stage-disc-lit`): fill and stroke accent, numeral in page colour.

### Tables (the schedule)
Ruled the way a schedule is ruled. Row heads in the schedule of parts carry the stage disc when the
slot has one (1, 3, 4, 5, 6), so the table and the drawing are one system. A label-role caption
above, label-role column heads on an ink rule, Alegreya row heads, hairlines between rows, an ink
rule closing the body. On a phone, rows stack and each cell prints its `data-label`.

### The security list
What makes Parlour safe, and where that safety stops, set as a bulleted-free ruled block: a
semibold ink phrase, then the explanation in ink 2, two columns at 56rem and above. One rule above
the block, none between entries. It states a limit as plainly as a feature; that is the point of it.

### Code blocks
Code bg with a rule border and 2px corners, `1rem 1.1rem` padding, comments in ink 2. Inline code in
the docs takes the same fill with a `0.08em 0.3em` pad.

### Navigation
- **Running head:** the mark (a house outline at 1.05em, stroked in current colour with its accent
  dot) then the wordmark in Alegreya; links in Geist 500, sentence case, ink 2 to ink on hover.
- **Folio:** 0.92rem in ink 2 under a rule: the licence and three links.
- **Docs rail:** a label-role home link, then every page with a ring before it; the current page's
  ring fills with the accent. One component (`DocsRail`), used by the index and by every page.
- **Turn:** previous and next at the foot of a doc, Alegreya under a label.

## Do's and Don'ts

### Do:
- **Do** separate with hairlines in rule colour; close a list or a table body with a rule, not a box.
- **Do** spend the accent on the path already travelled and the stage at hand, and nothing else.
- **Do** let the scroll drive the front page. If a section needs stepping through, give it distance,
  not buttons.
- **Do** draw new figures as schematics in ink, ink 2 and rule, running the way the page is read.
- **Do** build a figure from the same data that sets the prose beside it.
- **Do** define any new colour in both `:root` and the dark override.
- **Do** lead a section with what the reader gets, then say how it works.
- **Do** state a limit as plainly as a feature, and in the same breath.

### Don't:
- **Don't** add shadows, blur, gradients or a raster image; the site ships none.
- **Don't** draw the product as a picture of a house, a room or a device. The drawing explains the
  mechanism; it does not illustrate a scene.
- **Don't** put a transport, arrows or tabs on the front page.
- **Don't** put a tinted background behind a block of content.
- **Don't** use the accent as a text, link or button colour.
- **Don't** introduce a third family, or set tracked capitals anywhere they would carry a sentence.
- **Don't** capitalise the navigation.
- **Don't** use monospace outside `code`.
- **Don't** add a kicker, eyebrow or badge above a heading.
- **Don't** card the stage list, the tables or the security list.
- **Don't** animate anything but the question travelling, and never outside
  `prefers-reduced-motion: no-preference`.
- **Don't** write a claim the code cannot keep, or reach for an em dash.

## Departures from the brief

Carried here as the record, not as drift:
- The install command and "Read the docs" sit beside the headline, not at the foot of the page, so
  the one action is in the first viewport at 1440 x 900.
- The stage list sits beside the drawing rather than under it, and is taller than it needs to be for
  reading alone, because it is also the scroll distance the section runs on.
- The drawing is portrait rather than landscape: it matches the direction of the scroll, fits the
  column it sticks in, and removes the sideways pan a wide drawing needed on a phone.
- One serif and one grotesque replace the single superfamily, so the face a reader clicks is plainer
  than the face that names things.
