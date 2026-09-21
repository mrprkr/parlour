# @parlour/design

The palette, the type ramp and the state vocabulary, in one file, emitted into
every surface Parlour has. Nothing else in the repository declares a colour.

```sh
pnpm exec nx run design:emit      # after editing src/tokens.ts
pnpm exec nx run design:test      # contrast, and whether anything is stale
```

`src/tokens.ts` is the source. The emitters write:

| File | Read by |
| --- | --- |
| `apps/site/app/tokens.css` | The site and the docs |
| `apps/desktop/src/tokens.css` | The menu bar app, under shadcn's token names |
| `packages/parlour/src/server/web/tokens.css` | The phone page the CLI serves |
| `apps/ios/Parlour/DesignSystem/Tokens.swift` | The iOS app |
| `apps/ios/.../AccentColor.colorset/Contents.json` | iOS controls the app never styles |

The generated files are checked in, so a checkout builds without running the
emitter first. `design:test` fails when one of them has drifted, which means
`pnpm check` catches a token change that was not emitted.

## What is in it

**Ink on a limewashed wall, with one lit thing.** Paper, ink, bracken and a
hairline rule carry the interface; `hearth` green says the house is alive and
`lamp` amber says it is thinking. Those two are the only colours, which is what
makes them legible at a glance from across a room.

**The session states are part of the design system, not of each app.** Every
surface renders `stopped`, `idle`, `listening`, `thinking` and `speaking`, and
each one has a colour, a cadence and a word here. The cadence quickens as the
turn approaches its answer: 1100 ms listening, 700 ms thinking, 500 ms
speaking. The menu bar dot, the site's lamp, the phone page's talk button and
the iOS state mark all breathe in step because they read the same numbers.

## Adding a surface

Add a `Target` to `src/emit.ts` and a line to the list in `emit.test.ts`. If
the surface needs a shape none of the emitters produce, write another emitter
next to `css.ts` and `swift.ts` rather than hand-maintaining the values there.

## Adding a token

Put it in `src/tokens.ts`, run the emitter, and commit the generated files with
it. A colour that carries text needs to clear 4.5:1 against the paper it sits
on in both schemes; `tokens.test.ts` checks that, and it is why `lampText`
exists alongside `lamp`.
