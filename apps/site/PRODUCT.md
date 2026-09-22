# Product

<!-- impeccable:product-schema 1 -->

This file describes the site at heyparlour.app: the front page and the docs
in `apps/site`. The product it presents is Parlour, the npm package in
`packages/parlour` and the menu bar app in `apps/desktop`. Product facts here
are the ones the site is allowed to state; the code is the source of truth
for how Parlour actually behaves.

## Platform

web

## Users

Primary: people who already run Home Assistant and own a Mac (Apple silicon)
that is on most of the time. They are comfortable in a terminal, can run
`npm install -g` and paste a long-lived token, and have usually tried, or been
put off by, a cloud speaker. Their job on the site is to decide whether to
install Parlour instead of, or alongside, the voice setup they have.

Secondary, not led with: developers who might write a provider, an
integration or the Linux port. The docs serve them; the front page does not.

## Product Purpose

Parlour is a voice assistant for the house that runs on a Mac the household
already owns. Say the wake word, ask, and it answers out loud: lights,
heating, timers, the calendar, and anything Home Assistant has exposed. A
small local model handles the house; a cloud model (Claude) is asked only
when the local model decides a question is beyond it, and it receives the
transcribed sentence, never audio.

The site exists so a visitor understands exactly what Parlour does, what it
deliberately does not do, and how the audio stays on their Mac, then copies
one install command. Success for the site, in the owner's words: installs,
GitHub stars and watchers, and understanding. A visitor who leaves without
installing but knowing precisely how it works is a good outcome.

## Positioning

The claim a neighbouring product cannot truthfully make: the whole voice
pipeline (wake word, speech to text, the model with tools, text to speech)
runs in process on one Mac you own, with no account and no server of ours in
the middle, and the cloud is a per-question escalation the local model
chooses, sending text only.

Supporting mechanisms that are true and specific:

- Every stage is a provider behind a small interface, chosen by name in one
  config file; an unregistered name is an npm package, so swapping any part
  needs no change to Parlour itself.
- One Mac is the server. Every other microphone (another Mac, a phone page,
  a Voice PE through Home Assistant, custom hardware on a raw PCM socket, an
  automation posting text) is a client of it, and the server's own
  microphone has no special privileges.
- Home Assistant's MCP Server integration is the permission boundary: Parlour
  can do exactly what has been exposed to voice assistants and nothing more.
  The mute switch lives in Home Assistant, so the house can silence Parlour.

Neighbours, for orientation only: Home Assistant Assist and Voice PE (Parlour
can be their brain rather than a rival), cloud speakers (Alexa, Google, Siri),
and self-hosted assistants such as Rhasspy and Wyoming pipelines.

## Operating Context

- Install: a Mac with Node 22+ and Homebrew. `npm install -g parlour`, then
  `parlour init`, which fetches ffmpeg, whisper.cpp and the models through
  brew, asks for the Home Assistant address and token, optionally an Anthropic
  key, the wake word and the voice, writes `~/.config/parlour/config.json`
  and `secrets.env`, offers to run at login, and finishes with
  `parlour doctor`.
- The local model runs in LM Studio or anything speaking the OpenAI chat
  completions API. `init` offers to install LM Studio.
- Day to day: `parlour start`, `parlour text` (terminal conversation, no
  microphone), `parlour doctor`, `parlour service`, `parlour connectors`,
  `parlour models fetch`, `parlour config`, `parlour secrets`.
- The menu bar app (Tauri) does the same things with buttons and only ever
  shells out to the CLI.
- Everything on the network needs `PARLOUR_TOKEN`; without it the server
  binds loopback only and does not advertise over Bonjour.
- Repository: github.com/mrprkr/parlour. Package: npmjs.com/package/parlour.
  The site is deployed on Vercel from `apps/site`.
- The site's own pages: the front page at `/`, the docs index at `/docs`, and
  seven docs pages in reading order: Architecture, Writing a provider,
  Clients, Home Assistant, The menu bar app, Tuning, Your own wake word.

## Capabilities and Constraints

Confirmed product facts the site may state:

- Pipeline: openWakeWord (in process) -> energy endpointing, stopping after
  800 ms of silence -> whisper.cpp `small.en`, kept warm -> a local model with
  tools over the OpenAI API -> Kokoro text to speech, in process, speaking the
  first sentence while the rest is generated -> the speakers of whichever
  room asked.
- Tools: Home Assistant over MCP, timers, search, and connectors (remote MCP
  servers signed in per household, tokens in the Keychain).
- Escalation: `ask_the_clever_one` hands the question to Claude with
  server-side web search and no house tools.
- Wake word: "Hey Parlour" is the intended wake word and the one the site
  leads with. The shipped default in config is the stock `hey_jarvis` model;
  a custom "hey parlour" model is documented on the wake word page. Until a
  Parlour model ships by default this is a known gap between the site and the
  install, not something to paper over with a claim that it ships.
- Terminology to keep: wake word, satellite, the server, provider, port,
  integration, connector, the phone page, `parlour doctor`, the menu bar app,
  Voice PE, MCP.

Deliberate non-features. Future site work must not imply otherwise:

- It does not tell voices apart; everyone in the house is one user.
- It does not cancel its own echo; barge-in is off by default.
- It does not fail over; one server, satellites wait for it.
- No per-person connectors; tokens belong to the household.
- No Linux yet; the platform parts sit behind interfaces and it is a
  contribution the project would welcome.

Stage: version 0.1.0 on npm, one maintainer, MIT licence, September 2026.

## Brand Commitments

The owner has said none of the current identity is fixed except the name.

- Binding: the name "Parlour", British spelling.
- Not binding, and open to replacement: the lamp mark (gold dot with a soft
  ring on a dark green square, currently favicon and app icon), the Young
  Serif wordmark, the current palette, and the current copy voice.
- Conventions that apply to the repository as a whole and therefore to site
  copy unless the owner changes them: British English and no em dashes.

## Evidence on Hand

- Real: the code, the README, the docs, the CLI command list and its actual
  flags, the shipped config defaults, and the architecture (ports, provider
  registry, session state machine).
- Absent, and not to be invented: screenshots of the menu bar app,
  recordings or demos of Parlour answering in a room, testimonials, user
  counts, benchmark numbers beyond those the code makes true (800 ms
  endpointing, whisper "under a second" with a warm model), press, and any
  claim of a community. The product is 0.1.0 and the site should read as
  such.

## Product Principles

1. Say what the machine does, not what the visitor will feel. The mechanism
   is the pitch; every claim on the site must be true of the shipped code.
2. Lead with the pipeline. The path from wake word to speakers, and where the
   cloud does and does not enter it, is the thing a Home Assistant owner is
   deciding on.
3. State the limits as plainly as the features. The non-features are part of
   the product's honesty and part of why a careful person would trust it.
4. The install command is the call to action. Nothing on the front page
   should compete with copying it and reading the docs.
5. Contributors are welcomed in the docs, not sold to on the front page.

## Accessibility & Inclusion

No product-specific standard has been set. The site's audience uses a
terminal and a Mac, and the existing implementation already respects
`prefers-color-scheme`, keeps visible focus rings and labels the copy button;
future work should keep those and not regress keyboard use of the docs rail.
