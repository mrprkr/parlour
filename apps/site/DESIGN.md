---
name: Parlour
description: A reference book open at the plate of a house, with Parlour drawn where it lives.
colors:
  page: "#f5f5f1"
  plate: "#fcfcfa"
  ink: "#1c1c20"
  ink-2: "#55555e"
  rule: "#d6d6d0"
  brick: "#b5402a"
  slate: "#3d5a80"
  leaf: "#3f7a3b"
  leaf-wash: "#dcebd8"
  slate-wash: "#dfe7f0"
  code-bg: "#ecece6"
  selection: "#cfe0f5"
  wash-kitchen: "#e9efe4"
  wash-hall: "#f1efe8"
  wash-sitting: "#f4e6e2"
  wash-study: "#e3eaf1"
  wash-landing: "#efeeea"
  wash-bedroom: "#f3ecdf"
  wash-loft: "#ebebe9"
  night-plate: "#181716"
  night-page: "#131211"
  night-ink: "#e8e7e2"
  night-ink-2: "#a5a4a0"
  night-rule: "#353431"
  night-brick: "#9e5240"
  night-slate: "#8aa8cc"
  night-leaf: "#7dbb76"
  night-leaf-wash: "#22392a"
  night-slate-wash: "#23303c"
  night-code-bg: "#222120"
  night-selection: "#2f4a6b"
typography:
  display:
    fontFamily: "Alegreya, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(2.2rem, 3.9vw, 3.2rem)"
    fontWeight: 500
    lineHeight: 1.06
    letterSpacing: "-0.012em"
  headline:
    fontFamily: "Alegreya, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(1.6rem, 2.6vw, 2.05rem)"
    fontWeight: 500
    lineHeight: 1.15
  title:
    fontFamily: "Alegreya, Iowan Old Style, Georgia, serif"
    fontSize: "1.35rem"
    fontWeight: 500
    lineHeight: 1.2
  lede:
    fontFamily: "Alegreya, Iowan Old Style, Georgia, serif"
    fontSize: "1.22rem"
    fontWeight: 400
    lineHeight: 1.42
  body:
    fontFamily: "Alegreya, Iowan Old Style, Georgia, serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.5
  key:
    fontFamily: "Alegreya Sans, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "0.97rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Alegreya Sans SC, Alegreya Sans, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 700
    letterSpacing: "0.06em"
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
  sheet: "4.8rem"
  folio: "6rem"
  gutter: "clamp(1rem, 4vw, 3rem)"
  book: "76rem"
  measure: "62ch"
  doc-measure: "44rem"
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
    typography: "{typography.key}"
    rounded: "{rounded.control}"
    padding: "0.42rem 0.9rem"
  transport-play-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.plate}"
  transport-stepper:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    width: "2.2rem"
    height: "2.2rem"
  callout-disc:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.disc}"
    size: "1.45rem"
  callout-disc-lit:
    backgroundColor: "{colors.leaf}"
    textColor: "#ffffff"
    rounded: "{rounded.disc}"
  key-entry:
    textColor: "{colors.ink}"
    typography: "{typography.key}"
    padding: "0.62rem 0.3rem 0.62rem 0"
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

**Creative North Star: "The Plate in the Reference Book"**

The site is a reference book open at a plate: a house cut in section, drawn in ink on a white sheet, with the rooms tinted by an illustrator's washes and numbered callouts that match a key. The drawing is the page. Everything else on the site is the same book seen at other pages: a running head and a folio on every page, plate titles in a serif with a point of view, a key and tables set in the book's sans, room names and column heads in its small caps. The prose reads at 18px in a text serif because the visitor is reading, not scanning a pitch.

Colour is spent as a plate maker spends it. Ink and paper do nearly all the work. Brick red is what the section cut through, so only the walls carry it. Slate blue is the sound and the machines that hear it: microphones, the Mac's screen, the dotted route the sentence travels. Leaf green is the garden line, the dot in the mark, and whichever callout is lit; nothing else is green. The dark scheme is the same plate at night: a warm ink ground with pale line work and the washes dimmed to the same hues, not a second palette.

Depth is drawn, never lit. Rules separate things; boxes do not contain them. The only bordered surfaces are the plate's hairline frame, the install control, the transport buttons and code blocks, and every one is a hairline in ink or rule colour with at most a 2px corner. Everything shipped is SVG and CSS; there are no rasters, no gradients and no shadows.

**Key Characteristics:**
- One drawing is the subject; the page is built around the plate, its key and its callouts.
- Rules, not boxes: hairlines separate; nothing is carded, lifted or shadowed.
- Ink on paper carries the page; brick, slate and leaf each have one job.
- One superfamily (Alegreya, Alegreya Sans, Alegreya Sans SC) for display, prose, key and labels; monospace only inside commands.
- Line work at fixed weights in SVG user units; on a phone the plate pans rather than shrinks.
- Motion is the sentence travelling: dashes move, a disc settles, a sound line breathes, and all of it stops under reduced motion.

## Colors

A white plate, near-black ink, one grey, one rule, and three illustrator's washes each with one job.

### Primary
- **Leaf** (`{colors.leaf}`): the single spend. The lit callout disc on the plate and in the key (fill and stroke, white numeral), the leader of the lit callout, whatever the current step lights on the drawing (route, screen frame, cloud, speech line), the garden line under the house, the lit page dot in the docs rail, and the dot in the mark. Never a text colour, never a link colour, never a button.
- **Leaf wash** (`{colors.leaf-wash}`): the tree canopy at rest, and the fill that the Mac's screen and the cloud body take when their step is lit.

### Secondary
- **Slate** (`{colors.slate}`): sound and the machines that hear it. Microphones, the device outlines, the speech and speaker arcs, the dotted route through the house, and the stays in the wall figure. A drawing colour only: never on text, never on a control.
- **Slate wash** (`{colors.slate-wash}`): the Mac's screen at rest.
- **Selection** (`{colors.selection}`): text selection only.

### Tertiary
- **Brick** (`{colors.brick}`): the poché of the cut walls, outlined in ink at 1.5 units. Nothing else is brick.

### Neutral
- **Page** (`{colors.page}`): the ground of every page, a step below plate white, so the sheets tipped into it read as sheets.
- **Plate** (`{colors.plate}`): the tipped-in sheets: the section and the plan behind their hairline frames, and every control (install, play, steppers). Also the fill of every drawn object that sits in front of a wash, so the drawing reads as ink on paper.
- **Ink** (`{colors.ink}`): all text, all line work, the floor slabs and stair in the section, the roof, the key's heading rule and the heavy rule under a table's column heads, and the pressed state of the play control.
- **Ink 2** (`{colors.ink-2}`): the second voice. Running-head links at rest, key descriptions, captions, folios, column heads, room names, notes in the drawing, comments in code, ground hatching (at 55% opacity), disabled steppers.
- **Rule** (`{colors.rule}`): every hairline: running head, folio, key rows, table rows, notes, contents, the plate frame, code block borders, link underlines at rest, scrollbar thumbs.
- **Code bg** (`{colors.code-bg}`): code blocks and inline code in the docs, and the hover fill of every bordered control; a step below page so a block still reads on it.
- **Room washes** (`{colors.wash-kitchen}` to `{colors.wash-loft}`): seven flat tints, one per room, with no stroke. Kitchen leans green, study leans slate, sitting room leans brick, bedroom leans straw; the hall, landing and loft are near-neutral. They are drawing colours only.

### The night plate
Under `prefers-color-scheme: dark` every token above is redefined on `:root`, not added to. The ground becomes a warm ink (`{colors.night-plate}`), the line becomes pale (`{colors.night-ink}`), and each wash keeps its hue at a fraction of its chroma (`{colors.night-brick}`, `{colors.night-slate}`, `{colors.night-leaf}`, and the room washes). The lit numeral stays white on either scheme.

### Named Rules
**The One Spend Rule.** Leaf green marks what is lit or what is alive: the current callout, the garden, the mark's dot. If green appears anywhere that is not one of those, it is wrong.

**The Poché Rule.** Brick is what the section cut through and nothing else. Floors, roof and stair are solid ink; walls are brick with an ink outline.

**The Sound Is Slate Rule.** Anything that hears or carries sound is slate: microphones, arcs, the route, the screen. Slate is a drawing colour, never text and never a control state.

## Typography

**Display Font:** Alegreya (with Iowan Old Style, Georgia, serif)
**Body Font:** Alegreya (same face; the prose and the plate titles are one voice)
**Label Font:** Alegreya Sans SC, 500 and 700 (with Alegreya Sans)
**Key Font:** Alegreya Sans, 400, 500 and 700, with italics
**Mono Font:** ui-monospace, SF Mono, Menlo (commands and config keys only)

**Character:** One superfamily is the book's three voices: the serif sets titles and the reading text, the sans sets the key, tables and captions, and its small caps set the running heads, room names and column heads. Everything is a true face, including the small caps; nothing is synthesised with `text-transform`. The base is 18px (17px under 40rem), so the prose reads like a page, not a dashboard.

### Hierarchy
- **Display** (500, `clamp(2.2rem, 3.9vw, 3.2rem)`, 1.06, `-0.012em`): the plate title on the front page, balanced and capped at 26ch. The docs reading page uses a lighter cut of the same role (`clamp(2rem, 4.5vw, 2.7rem)`, 1.1, `-0.01em`).
- **Headline** (500, `clamp(1.6rem, 2.6vw, 2.05rem)`, 1.15): sheet titles on the front page. Docs `h2` is 1.55rem and `h3` is 1.2rem.
- **Title** (500, 1.35rem, 1.2): the wordmark, contents entries and their folio numbers, and previous/next links (1.15rem). Row heads in a schedule take the same face at 1.05rem.
- **Lede** (400, 1.22rem, 1.42): the paragraph under a plate title, capped at 50ch.
- **Body** (400, 18px, 1.5): all prose, capped at `{spacing.measure}` on the front page and `{spacing.doc-measure}` in the docs. Paragraphs wrap `pretty`, headings `balance`.
- **Key** (400 and 700, 0.97rem to 1rem, 1.38 to 1.45): the key column, captions, tables, notes, the docs rail and the summary lines in the contents. Bold for the "what", ink 2 for the "how".
- **Label** (700, 0.85rem to 1rem, 0.06em to 0.08em): true small caps for running-head navigation, the key heading, table captions and column heads, room names on the plate (15 SVG units), "Previous" and "Next", and the docs rail's home link.
- **Mono** (0.86em of its parent; 0.9rem to 0.95rem in blocks and the install control): commands, config keys, the `$` prompt.
- **On the plate**: labels 14 units italic sans, the spoken line 17 units serif italic, notes 12.5 units ink 2, callout numerals 15 units sans 700 with tabular figures. Labels scale with the drawing, not the page.

### Named Rules
**The Three Voices Rule.** Serif for what is read, sans for what is consulted, small caps for what names a place or a column. Do not add a fourth face.

**The Mono Is A Command Rule.** Monospace appears only inside `code`. It is never used for labels, kickers, numbers or emphasis.

**The Italic Is A Label Rule.** Italics on the plate name things ("the Mac", "Hey Parlour", "800 ms of quiet"). In prose, italics are the face's own and are not a display device.

## Layout

The page is a book: one column `{spacing.book}` wide, centred, with a side gutter of `{spacing.gutter}`. The running head sits at the top of every page with a rule beneath it, the folio at the foot with a rule above it and `{spacing.folio}` of air before it. Each sheet below the plate opens with a rule of its own (4.4rem above, 3rem beneath), the way a book divides its pages.

The front page opens with the head as a two-column grid at 64rem and above (`1.35fr` title to `1fr` lede and actions), stacking below. The walk beneath it is a grid of the plate and a 21rem key column at 64rem and above; the key is sticky (`top: 1.5rem`) and holds the transport at its head. Below 48rem the plate keeps a 46rem minimum width and pans sideways inside its frame (a cue line appears above the caption), so the line weights never thin. Sheets further down are separated by `{spacing.sheet}` of top padding, not rules, and their body sits at `{spacing.measure}`. Two-column sheets split evenly at 56rem and above; the installation sheet gives the commands `1.5fr`.

The docs index is the same book with a contents list at 44rem. A docs reading page is a `{spacing.doc-measure}` column of prose; at 64rem and above a `{spacing.rail}` rail sits to its left (sticky, `top: 2rem`) with the list of pages, and below that width the rail wraps inline above the text.

Rhythm is set in rems off the 18px base: `{spacing.hair}` between transport buttons, `{spacing.row}` for table and note rows, `{spacing.line}` between paragraphs, `{spacing.para}` under a lede or code block, `{spacing.block}` between the head and the plate. Tables at or below 40rem stack each row into a block, every cell carrying its column head as a small-caps label.

Breakpoints, as used: 40rem (base size drops, tables stack), 48rem (the plate pans), 56rem (two columns), 64rem (head splits, key and rail go sticky).

## Elevation & Depth

There are no shadows, no blur and no gradients anywhere on the site. Depth is drawn the way a section is drawn: a heavier line is nearer (roof at 12 units, thick edges at 3.5, ordinary line at 2, hatching and leaders at 1 to 1.5), a filled shape sits in front of a wash because its fill is plate, and the thing that matters is lit in leaf. Surfaces are separated by hairlines in rule colour; the four bordered surfaces (plate frame, install control, transport buttons, code blocks) are 1px lines, not raised objects. Hover on a bordered control is a fill change to code bg over 160ms, never a lift.

### Named Rules
**The No Shadow Rule.** Nothing casts a shadow. If a surface needs separating, rule it; if it needs attention, light it in leaf.

**The Line Weight Is Depth Rule.** On the plate, nearness is stroke width, in SVG user units that do not scale with the page.

## Shapes

Square by default. Text, tables, notes and the plate frame have no radius. Controls that must read as pressable (install control, play, steppers, code blocks, inline code) take a 2px radius, just enough to soften the corner of a hairline box. The only circles are the callout discs on the plate (radius 13 units, 2-unit stroke), their inline twins in the key and caption (1.45rem, 1.5px stroke), the rail's page dots (7px, 1.5px stroke) and the mark's leaf dot. Line ends and joins are round throughout the drawing. Dashes carry meaning: the sound route is a dotted line (`0.1 7` at 2.6 units), the cloud's leader a dashed line (`6 6` at 1.5), the wall figure's "sentence" a `5 5` dash.

## Components

### Buttons
Every control is a hairline box on the plate with an ink border, or a ruled row with no box at all.
- **Shape:** near-square (`{rounded.control}`), 1px solid ink. Pressed: the control moves down 1px, nothing else.
- **Install control** (`install-control`): the `$` prompt in ink 2 mono, the command in mono, and a reserved "copy" word in 0.85rem sans that becomes "copied" for 1.8s. Hover fills code bg over 160ms.
- **Play** (`transport-play`): sans 500, `0.42rem 0.9rem`, labelled "Follow one sentence", "Pause" or "Again". When pressed it inverts to ink on plate.
- **Steppers** (`transport-stepper`): the words "Back" and "Next" in sans 500, `0.42rem 0.7rem`; no icon. Disabled: ink 2 text, rule border.
- **Key entries** (`key-entry`): no box. A full-width ruled row with a disc, a bold "what" and an ink 2 "how"; hover underlines the "what" in rule colour; the active entry lights its disc.
- **Focus:** every control and link takes the global leaf outline (2px, 3px offset), so interaction has one accent.

### Links
Prose links are ink with a 1px underline in rule colour offset 0.2em; hover darkens the underline to the text colour. Running-head, rail and contents links carry no underline; they move from ink 2 to ink on hover, or underline on hover where they are serif titles.

### Callout discs
- **On the plate:** a plate-filled circle with a 2-unit ink stroke, a bold tabular numeral, and a 1.2-unit ink leader to the thing it names.
- **In text** (`callout-disc`): the same disc at 1.45rem with a 1.5px border, used in the key list and the caption line.
- **Lit** (`callout-disc-lit`): fill and stroke leaf, numeral white, leader leaf at 2 units. Only one is lit at a time. With motion allowed the plate's disc settles from 1.45 scale over 420ms.

### Tables (the schedule)
Ruled the way a schedule in a book is ruled. Row heads in the schedule of parts carry the plate's callout disc when the slot has one (1, 3, 4, 5, 6), so the table and the drawing are one system. Sans at 0.97rem; a small-caps caption above in ink 2; small-caps column heads on an ink rule; serif row heads at 1.05rem; rule-colour hairlines between rows; an ink rule closing the body. Cells pad `0.7rem 1.4rem 0.7rem 0` with no right padding on the last column. On a phone rows stack and each cell prints its `data-label` in small caps.

### Notes and contents
Lists with no bullets. The notes sit under one rule as a two-column grid at 56rem and above (`0.9rem 3rem` gaps), one column below, each entry capped at `{spacing.measure}`; no rules between entries. The docs contents keeps ruled rows (`{spacing.row}` vertical, a hairline above, a hairline closing the last) with a 2.6rem column of serif folio numbers in ink 2.

### Code blocks
Code bg with a rule border and 2px corners, `1rem 1.1rem` padding, mono at 0.86rem to 0.9rem, comments in ink 2. Inline code in the docs takes the same fill with a `0.08em 0.3em` pad.

### Navigation
- **Running head:** the mark (the house in section at 1.15em, stroked in current colour with its leaf dot) then the wordmark in serif 500 at 1.35rem; navigation in small caps 500 at 1rem, 0.06em tracking, ink 2 to ink on hover; a rule beneath. No mobile variant; there are two links.
- **Folio:** sans 0.95rem in ink 2 under a rule: the licence and the three links, nothing else. The version is stated once, in the Open source prose.
- **Docs rail:** small-caps home link, then the pages as a list with a 7px ring before each; the current page's ring fills leaf and its text turns ink.
- **Turn:** previous and next at the foot of a doc, serif 1.15rem under a small-caps label, right-aligned on the right.

### The plan (second figure)
The same six rooms in plan at `viewBox 0 0 860 220`, on its own tipped-in sheet above the clients table: rooms as 2.5-unit ink rectangles with small-caps names, a slate microphone in each client room with an italic label beneath, and a dotted slate wire (the route's `0.1 7` dash) from every microphone to the Mac in the study. The Mac is the hub: a frame and slate-wash screen, its own microphone beside it. Nothing in it is lit; it explains topology, not sequence.

### The plate (signature)
An SVG house in section at `viewBox 0 0 960 640`, drawn once and lit by `data-step` on the wrapper. Layers in order: washes (flat, no stroke), the cut (ink slabs, ink stair, brick walls with ink outline), the ink roof at 12 units, the line group at 2 units with round caps, labels, callouts. Devices and microphones are slate; the Mac's screen is slate wash and turns leaf wash when its step is lit. The sound route is a dotted slate line that runs leaf and animates towards the Mac on step 2 and back on step 7; the cloud sits above the roof on a dashed ink 2 leader that runs leaf on step 5. The wall figure ("Fig. 2") reuses the same conventions at `364 x 150`: an ink cut, slate arcs, a dashed line for the sentence, small-caps side labels. Every figure carries a serif "Fig." caption in sans below it.

## Do's and Don'ts

### Do:
- **Do** separate with hairlines in rule colour (1px); close a list or a table body with a rule, not a box.
- **Do** spend leaf on exactly one thing at a time: the lit callout, the current page, the garden line.
- **Do** draw new figures as SVG with the plate's conventions: ink line at 2 units with round caps, plate fills, slate for sound, brick for cut walls, small caps for place names, a "Fig." caption beneath.
- **Do** set anything that names a place or a column in true small caps (Alegreya Sans SC), ink 2, 0.06em tracked.
- **Do** keep controls as 1px ink boxes on plate with a 2px corner, hover to code bg, pressed to inverted ink.
- **Do** define any new colour in both `:root` and the dark override; the night plate is the same tokens, dimmed.
- **Do** keep the reading measure at 62ch on the front page and 44rem in the docs.
- **Do** let a drawing pan on a phone rather than shrink its line weights.

### Don't:
- **Don't** add shadows, blur, gradients or a raster image; the site ships none.
- **Don't** put a tinted background behind a block of content; washes belong to rooms on a drawing, not to sections of a page.
- **Don't** use leaf, slate or brick as text or link colour, or leaf as a button.
- **Don't** introduce a fourth face or fake small caps with `text-transform: uppercase`.
- **Don't** use monospace outside `code`.
- **Don't** add a kicker, eyebrow or badge above a heading; the plate title stands alone and sheet titles are one serif line.
- **Don't** card the key, the tables or the notes; the key and tables are ruled rows, the notes a ruled block.
- **Don't** animate anything that is not the sentence travelling, and never outside `prefers-reduced-motion: no-preference`.

## Departures from the brief

Cited at the finish review and carried here as the record, not as drift:
- The install command and "Read the docs" sit under the lede in the head, not at the foot of the key, so the one action is in the first viewport at 1440 x 900.
- The walk transport (play, back, next) sits at the head of the key column for the same reason, with the step caption under the plate.
- One superfamily (Alegreya, Alegreya Sans, Alegreya Sans SC) serves display, text, labels and small caps rather than two unrelated faces.
