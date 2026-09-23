# Graph Report - parlour  (2026-09-23)

## Corpus Check
- 287 files · ~181,005 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 15 file(s) not represented in the graph (top: (none) 6, .plist 3, .css 3)

## Summary
- 2791 nodes · 6315 edges · 152 communities (136 shown, 16 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 327 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b453a42f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- main.rs
- Contributing guide
- parlour
- SearchProvider
- settings.rs
- decision.ts
- core/config.ts
- VoiceSession
- parlour/package.json
- Onboarding.tsx
- main.ts
- session.test.ts
- StatusPanel.tsx
- ref_node_assert
- output.ts
- audio.ts
- ai-sdk.ts
- connectors/index.ts
- App.tsx
- Testing
- SettingsPanel.tsx
- yap.ts
- ports.ts
- cn
- Tauri Config
- server/index.ts
- Logger
- targets
- agent.test.ts
- Parlour Nx Project
- Router
- server/index.test.ts
- shadcn Components Config
- Biome Config
- Architecture Design Docs
- Provider Extension Docs
- scripts
- satellite.ts
- ref_node_fs
- Desktop TSConfig
- prompts.ts
- cli/cli.test.ts
- HomeKitStore
- Parlour TSConfig
- SessionState
- Nx Workspace Config
- process.ts
- desktop/package.json
- source.ts
- launchd.ts
- OnboardingView
- dependencies
- timers.ts
- AccessoryCard
- architecture.mdx
- init.ts
- Phone Push-to-Talk Page
- Build TSConfig
- css.ts
- Site Vercel Config
- clients.mdx
- site/project.json
- migrate.test.ts
- dependencies
- Supervisor
- Desktop App Icon
- Documentation Index
- laya-mlx.ts
- Tauri Capabilities
- macos-say.ts
- triage.ts
- devDependencies
- .body
- Vite Env Types
- parlour-dev Script
- Design System: Parlour
- parlour
- Desktop Cargo Crate
- (home)/page.tsx
- services.test.ts
- Data
- plugins.test.ts
- ParlourTokens
- PairingScanner
- ios/project.json
- router.ts
- RequestQueue
- desktop.mdx
- targets
- parlour/src/index.ts
- Check
- SwiftUI
- LocalIntelligenceState
- ParlourClient
- compilerOptions
- icons.ts
- models.ts
- FakeWakeWordEngine
- TalkView
- site/package.json
- doctor.ts
- Text
- scripts
- ServerDiscovery
- scripts
- compilerOptions
- design/src/index.ts
- .transcribe
- dependencies
- core/text.ts
- setup.rs
- config.json
- design/package.json
- RecorderError
- @parlour/design
- kokoro.ts
- ffmpeg.ts
- Foundation
- vite.config.ts
- tuning.mdx
- Product
- pair.ts
- skills.mdx
- afplay.ts
- AppSettings
- [[...slug]]/page.tsx
- ai-sdk.test.ts
- PairingLink
- Parlour for iOS
- docs/layout.tsx
- defineProvider
- devDependencies
- laya-worker.py
- devDependencies
- emitCss
- app/layout.tsx
- ios.mdx
- scripts
- repository
- home-assistant.mdx
- parlour
- next.config.ts
- emit.ts
- wake-word.mdx
- Front page: heyparlour.app
- AGENTS.md
- postcss.config.mjs
- notarise.sh

## God Nodes (most connected - your core abstractions)
1. `Logger` - 57 edges
2. `OnboardingView` - 48 edges
3. `Check` - 40 edges
4. `Text` - 36 edges
5. `registerProvider()` - 30 edges
6. `Message` - 30 edges
7. `init()` - 28 edges
8. `Completion` - 28 edges
9. `ChatModel` - 27 edges
10. `defineProvider()` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Running the app against a checkout` --references--> `parlourBin()`  [INFERRED]
  apps/site/content/docs/desktop.mdx → packages/parlour/src/cli/service.ts
- `Plugins` --references--> `Plugin`  [INFERRED]
  apps/site/content/docs/skills.mdx → packages/parlour/src/core/plugins.ts
- `Providers` --references--> `service()`  [INFERRED]
  apps/site/content/docs/architecture.mdx → packages/parlour/src/cli/doctor.ts
- `The other kinds` --references--> `service()`  [INFERRED]
  apps/site/content/docs/providers.mdx → packages/parlour/src/cli/doctor.ts
- `Assembly` --references--> `Agent`  [INFERRED]
  apps/site/content/docs/architecture.mdx → packages/parlour/src/core/agent.ts

## Import Cycles
- None detected.

## Communities (152 total, 16 thin omitted)

### Community 0 - "main.rs"
Cohesion: 0.16
Nodes (29): AppState, audio_devices(), CliOutput, get_settings(), host_name(), install_cli(), logs(), main() (+21 more)

### Community 1 - "Contributing guide"
Cohesion: 0.06
Nodes (55): Dependabot configuration, Bug report issue template, Feature or provider request template, Pull request template and merge checklist, CI check job (typecheck, lint, test, build, cargo check), CI workflow, Tauri generate_context! ordering constraint, Build the app and attach dmg to release job (+47 more)

### Community 2 - "parlour"
Cohesion: 0.23
Nodes (14): connectorAdd(), connectorRemove(), failure(), getConnectors(), pairingCode(), parlour(), run(), runDoctor() (+6 more)

### Community 3 - "SearchProvider"
Cohesion: 0.12
Nodes (14): SearchProvider, SearchResult, searchTool(), BraveOptions, braveProvider, BraveSchema, BraveSearch, createBrave() (+6 more)

### Community 4 - "settings.rs"
Cohesion: 0.14
Nodes (22): detect_parlour(), executable(), found(), found_on(), found_on_skips_files_that_cannot_run(), found_on_walks_every_path_entry_in_order(), home(), login_shell() (+14 more)

### Community 5 - "decision.ts"
Cohesion: 0.16
Nodes (14): DECISION_INTENTS, DecisionInput, DecisionIntent, DecisionPlan, decisionQuestions(), DecisionVerdict, noulOf(), parseIntent() (+6 more)

### Community 6 - "core/config.ts"
Cohesion: 0.14
Nodes (16): home, listed, pathsWith(), ConfigSchema, parseConfig(), home, pathsIn(), updateConfig() (+8 more)

### Community 7 - "VoiceSession"
Cohesion: 0.23
Nodes (3): micMode(), LocalVoice, VoiceSession

### Community 8 - "parlour/package.json"
Cohesion: 0.10
Nodes (19): bin, parlour, description, engines, node, exports, ./testing, files (+11 more)

### Community 9 - "Onboarding.tsx"
Cohesion: 0.11
Nodes (34): AgentState, audioDevices(), Check, CliOutput, deviceValue(), getNetwork(), getSettings(), hostName() (+26 more)

### Community 10 - "main.ts"
Cohesion: 0.07
Nodes (45): Command, GLOBAL_OPTIONS, OptionSpec, parseCli(), Parsed, parseGlobals(), readStdin(), splitCommand() (+37 more)

### Community 11 - "session.test.ts"
Cohesion: 0.16
Nodes (5): Answer, pipeline(), RecordingSink, VoiceSink, VoiceState

### Community 12 - "StatusPanel.tsx"
Cohesion: 0.09
Nodes (26): Alert(), AlertDescription(), alertVariants, Badge(), badgeVariants, Button(), buttonVariants, Card() (+18 more)

### Community 13 - "ref_node_assert"
Cohesion: 0.08
Nodes (14): quiet, options, memory, paths, secrets, memory, paths, secrets (+6 more)

### Community 14 - "output.ts"
Cohesion: 0.12
Nodes (21): bold(), EventKind, green(), humanReporter(), porcelainReporter(), red(), yellow(), allowBack() (+13 more)

### Community 15 - "audio.ts"
Cohesion: 0.22
Nodes (10): decodeToWav(), EMPTY, FRAME_MS, FRAME_SAMPLES, FrameCutter, frameFrom(), rms(), toWav() (+2 more)

### Community 16 - "ai-sdk.ts"
Cohesion: 0.17
Nodes (13): stripThinking(), AiSdkModel, AiSdkModelOptions, AiSdkOptions, aiSdkProvider, AiSdkSchema, asArgs(), createAiSdk() (+5 more)

### Community 17 - "connectors/index.ts"
Cohesion: 0.05
Nodes (39): addConnector(), ConnectorRow, listConnectors(), reason(), removeConnector(), connectorsIntegration, ConnectorsOptions, connectorTools() (+31 more)

### Community 18 - "App.tsx"
Cohesion: 0.12
Nodes (22): App(), power(), DOT, TabName, TABS, tail(), UNKNOWN, Tabs() (+14 more)

### Community 19 - "Testing"
Cohesion: 0.22
Nodes (7): Testing, ServiceSpec, ServiceState, FakeAudioSink, FakeServiceManager, triageAnswers(), wakeFrame()

### Community 20 - "SettingsPanel.tsx"
Cohesion: 0.10
Nodes (23): Checkbox(), Select(), SelectContent(), SelectItem(), SelectTrigger(), SelectValue(), AgentConfig, setSecret() (+15 more)

### Community 21 - "yap.ts"
Cohesion: 0.27
Nodes (7): run(), createYap(), joinTranscript(), yap, yapArgs(), YapOptions, yapSchema

### Community 22 - "ports.ts"
Cohesion: 0.06
Nodes (31): Ports, The other kinds, SetupOptions, keepListening(), frame(), frames(), Agent, Config (+23 more)

### Community 23 - "cn"
Cohesion: 0.23
Nodes (11): cn(), Disclosure(), Heading(), Mark(), Note(), Optional(), Row(), StepMeta (+3 more)

### Community 24 - "Tauri Config"
Cohesion: 0.08
Nodes (23): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+15 more)

### Community 25 - "server/index.ts"
Cohesion: 0.15
Nodes (27): allowCors(), API_ROUTES, ask(), AskBody, authorised(), body(), clientId(), completions() (+19 more)

### Community 26 - "Logger"
Cohesion: 0.08
Nodes (23): Level, Logger, order, stamp(), write(), FallbackTextToSpeech, AnthropicOptions, anthropicProvider (+15 more)

### Community 27 - "targets"
Cohesion: 0.06
Nodes (38): command, continuous, options, command, options, outputs, command, options (+30 more)

### Community 28 - "agent.test.ts"
Cohesion: 0.21
Nodes (10): fakeConfig(), made, paths, registerFakes(), say(), withCloud(), clearProviders(), registerProvider() (+2 more)

### Community 29 - "Parlour Nx Project"
Cohesion: 0.12
Nodes (18): command, options, command, options, name, cwd, projectType, $schema (+10 more)

### Community 30 - "Router"
Cohesion: 0.15
Nodes (4): roomContext(), Router, same(), TaskList

### Community 31 - "server/index.test.ts"
Cohesion: 0.16
Nodes (9): ServerDeps, fakeAgent(), Raw, say(), serve(), ServeOptions, testConfig(), FakeSpeechToText (+1 more)

### Community 32 - "shadcn Components Config"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 33 - "Biome Config"
Cohesion: 0.11
Nodes (17): css, parser, files, includes, formatter, indentStyle, lineWidth, quoteStyle (+9 more)

### Community 36 - "scripts"
Cohesion: 0.06
Nodes (34): devDependencies, @biomejs/biome, @changesets/cli, nx, engines, node, name, packageManager (+26 more)

### Community 37 - "satellite.ts"
Cohesion: 0.09
Nodes (22): command, log, RETRY_MS, USAGE, Endpointer, emit(), onShutdown(), ProviderKind (+14 more)

### Community 38 - "ref_node_fs"
Cohesion: 0.13
Nodes (17): SecretStore, log, secrets, createFileStore(), fileStore, paths, NamedSecretStore, onPath() (+9 more)

### Community 39 - "Desktop TSConfig"
Cohesion: 0.12
Nodes (16): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 40 - "prompts.ts"
Cohesion: 0.14
Nodes (27): CANDIDATE_URLS, findHomeAssistant(), looksLikeHomeAssistant(), mcpServerPresent(), setupHomeAssistant(), tokenWorks(), trim(), confirmOr() (+19 more)

### Community 41 - "cli/cli.test.ts"
Cohesion: 0.12
Nodes (13): BIN, Run, call(), AGENT_LABEL, WHISPER_LABEL, manifest, packageFile, VERSION (+5 more)

### Community 42 - "HomeKitStore"
Cohesion: 0.11
Nodes (23): Any, Screen, house, settings, talk, Accessory, HomeKitStore, Room (+15 more)

### Community 43 - "Parlour TSConfig"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+7 more)

### Community 44 - "SessionState"
Cohesion: 0.11
Nodes (19): ColourRole, bracken, hearth, lamp, Motion, SessionState, idle, listening (+11 more)

### Community 45 - "Nx Workspace Config"
Cohesion: 0.13
Nodes (14): analytics, cache, dependsOn, outputs, defaultBase, cache, $schema, targetDefaults (+6 more)

### Community 46 - "process.ts"
Cohesion: 0.22
Nodes (8): execFileAsync, findOnPath(), killOnExit(), orphans(), parseOrphans(), RunOptions, SHUTDOWN_SIGNALS, Microphone

### Community 47 - "desktop/package.json"
Cohesion: 0.11
Nodes (17): description, react, react-dom, tailwindcss, @types/react, @types/react-dom, typescript, license (+9 more)

### Community 48 - "source.ts"
Cohesion: 0.20
Nodes (10): GET, docs, source, fumadocs-core, @twinkleplop/bash, @twinkleplop/json, @twinkleplop/markdown, @twinkleplop/rehype (+2 more)

### Community 49 - "launchd.ts"
Cohesion: 0.20
Nodes (12): createLaunchd(), launch(), loaded(), state(), launchd, LaunchdOptions, renderPlist(), run (+4 more)

### Community 50 - "OnboardingView"
Cohesion: 0.07
Nodes (43): AnyTransition, URL, Connection, checking, connected, failed, untried, ConnectStage (+35 more)

### Community 51 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, ai, @ai-sdk/anthropic, @ai-sdk/openai-compatible, @anthropic-ai/sdk, bonjour-service, kokoro-js, @modelcontextprotocol/sdk (+4 more)

### Community 52 - "timers.ts"
Cohesion: 0.27
Nodes (7): describe(), log, fakeClock(), setUp(), Timer, Timers, TimersOptions

### Community 53 - "AccessoryCard"
Cohesion: 0.22
Nodes (10): Content, Wall, .body, AccessoryCard, .body, RoomView, .body, .room (+2 more)

### Community 54 - "architecture.mdx"
Cohesion: 0.20
Nodes (9): Assembly, Configuration, secrets and paths, The action agent, The pipeline, The queue, The session, The task list, Triage (+1 more)

### Community 55 - "init.ts"
Cohesion: 0.15
Nodes (26): HomeAssistantAnswers, afterword(), Answers, applyAnswers(), askedFor(), command, Context, init() (+18 more)

### Community 56 - "Phone Push-to-Talk Page"
Cohesion: 0.20
Nodes (13): chunks, params, play(), send(), start(), status(), stop(), store (+5 more)

### Community 57 - "Build TSConfig"
Cohesion: 0.20
Nodes (9): compilerOptions, declaration, noEmit, outDir, rewriteRelativeImportExtensions, rootDir, exclude, extends (+1 more)

### Community 58 - "css.ts"
Cohesion: 0.21
Nodes (16): Scheme, Duotone, hairline, leading, measure, motion, radius, SessionState (+8 more)

### Community 60 - "clients.mdx"
Cohesion: 0.18
Nodes (9): Events, A phone, A satellite, Automations and scripts, Bonjour, Custom hardware, Home Assistant satellites, The iPhone app (+1 more)

### Community 61 - "site/project.json"
Cohesion: 0.11
Nodes (20): command, options, outputs, command, continuous, options, command, options (+12 more)

### Community 62 - "migrate.test.ts"
Cohesion: 0.40
Nodes (8): offerMigration(), isLegacyConfig(), isObject(), migrateLegacyConfig(), migrateLegacyEnv(), Raw, House, withProvider()

### Community 63 - "dependencies"
Cohesion: 0.20
Nodes (10): dependencies, class-variance-authority, clsx, cn, lucide-react, radix-ui, react, react-dom (+2 more)

### Community 64 - "Supervisor"
Cohesion: 0.11
Nodes (23): agent_command(), agent_command_leaves_log_level_to_secrets_env(), apply(), LOG_LINES, AppHandle, Default, Mutex, Option (+15 more)

### Community 65 - "Desktop App Icon"
Cohesion: 0.33
Nodes (7): Parlour Desktop App Icon, Three-Bar Audio Waveform Motif, Dark Charcoal and Mint Green Palette, Rounded Square Icon Container, Tauri Desktop App (apps/desktop), Voice / Wake Word Product Identity, Site Favicon (apps/site/app/icon.svg)

### Community 67 - "laya-mlx.ts"
Cohesion: 0.17
Nodes (10): DecisionInstructions, createLayaMlx(), defaultWorkerPath(), flattenInstructions(), LayaMlxDecisionModel, LayaMlxOptions, layaMlxProvider, LayaMlxSchema (+2 more)

### Community 68 - "Tauri Capabilities"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 69 - "macos-say.ts"
Cohesion: 0.29
Nodes (9): withTempWav(), args(), createMacosSay(), execFileAsync, installedVoices(), macosSay, MacosSayOptions, macosSaySchema (+1 more)

### Community 70 - "triage.ts"
Cohesion: 0.26
Nodes (11): extract(), fastTriage(), log, parseTriage(), recent(), simple(), triage, TriageContext (+3 more)

### Community 71 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, tailwindcss, @tailwindcss/vite, @tauri-apps/cli, tw-animate-css, @types/react, @types/react-dom, typescript (+2 more)

### Community 72 - ".body"
Cohesion: 0.25
Nodes (7): HouseView, .body, RoomCard, .body, .summary, Int, String

### Community 76 - "Design System: Parlour"
Cohesion: 0.08
Nodes (25): Code blocks, Colors, Components, Controls, Departures from the brief, Design System: Parlour, Do:, Do's and Don'ts (+17 more)

### Community 77 - "parlour"
Cohesion: 0.09
Nodes (24): ./config.js, ./connectors.js, ./doctor.js, ./init.js, ./mcp.js, ./models.js, COMMANDS, help() (+16 more)

### Community 79 - "(home)/page.tsx"
Cohesion: 0.11
Nodes (13): asked, ConfigFile(), DesktopSettings(), line, PhoneHouse(), PhoneTalk(), PrivacyDiagram(), RoomScene() (+5 more)

### Community 80 - "services.test.ts"
Cohesion: 0.22
Nodes (5): Providers, provider(), managed, paths, model()

### Community 81 - "Data"
Cohesion: 0.13
Nodes (15): Data, Recorder, .permission, Bool, Double, T, WAV, Int (+7 more)

### Community 82 - "plugins.test.ts"
Cohesion: 0.25
Nodes (5): context, paths, root, registeredProviders(), silent

### Community 83 - "ParlourTokens"
Cohesion: 0.08
Nodes (30): Animation, ButtonStyle, .hearth, HearthButtonStyle, StateMark, .body, .mark, .pulse (+22 more)

### Community 84 - "PairingScanner"
Cohesion: 0.15
Nodes (15): Coordinator, PairingScanner, .body, .caption, .unavailable, ScannerView, Bool, String (+7 more)

### Community 85 - "ios/project.json"
Cohesion: 0.10
Nodes (22): command, dependsOn, options, command, options, outputs, name, cwd (+14 more)

### Community 86 - "router.ts"
Cohesion: 0.06
Nodes (49): DecisionMode, ActionAgent, CLOUD_DOWN, cloudTurn(), DecisionSettings, dispatch(), Dispatched, LOCAL_DOWN (+41 more)

### Community 87 - "RequestQueue"
Cohesion: 0.16
Nodes (7): Job, Lane, QueueOptions, RequestQueue, SupersededError, deferred(), harness()

### Community 88 - "desktop.mdx"
Cohesion: 0.22
Nodes (8): Building it, Deliberate choices, How it fits together, Running the app against a checkout, Setting up, Signing, The tabs, Two things to know

### Community 89 - "targets"
Cohesion: 0.11
Nodes (21): command, options, command, options, command, options, name, cwd (+13 more)

### Community 90 - "parlour/src/index.ts"
Cohesion: 0.08
Nodes (48): CliContext, everySkill(), buildAgent(), BuildOptions, log, ProviderSlice, AgentEvent, enableEvents() (+40 more)

### Community 91 - "Check"
Cohesion: 0.09
Nodes (14): checksOf(), Check, Tool, ApiToolCall, createOpenAiCompatible(), localModelCheck(), LocalModelOptions, OpenAiCompatibleModel (+6 more)

### Community 92 - "SwiftUI"
Cohesion: 0.19
Nodes (8): App, ParlourApp, .body, RootView, AVFoundation, Scene, SwiftUI, VisionKit

### Community 93 - "LocalIntelligenceState"
Cohesion: 0.12
Nodes (15): AnyObject, LocalIntelligence, .session, LocalIntelligenceState, .explanation, failed, modelNotReady, notEnabled (+7 more)

### Community 94 - "ParlourClient"
Cohesion: 0.16
Nodes (18): Answer, ClientError, .errorDescription, noServer, server, unauthorised, Health, ParlourClient (+10 more)

### Community 95 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 96 - "icons.ts"
Cohesion: 0.15
Nodes (16): emitAppIconContents(), emitFaviconSvg(), IconShape, iconSvg(), LAMP, MARK, shapes, chunk() (+8 more)

### Community 97 - "models.ts"
Cohesion: 0.09
Nodes (36): HouseOptions, InitOptions, command, DEFAULT_WAKE_WORDS, DEFAULT_WHISPER_MODEL, fetchFile(), fetchLocalModel(), fetchModels() (+28 more)

### Community 99 - "TalkView"
Cohesion: 0.14
Nodes (11): SharedAudioSession, Sendable, Speaker, Bool, String, Void, TalkView, .talkButton (+3 more)

### Community 100 - "site/package.json"
Cohesion: 0.11
Nodes (17): description, react, react-dom, tailwindcss, @types/node, @types/react, @types/react-dom, typescript (+9 more)

### Community 101 - "doctor.ts"
Cohesion: 0.12
Nodes (26): command, diagnose(), forgottenConnectors(), reachable(), satellite(), server(), service(), USAGE (+18 more)

### Community 102 - "Text"
Cohesion: 0.10
Nodes (32): .body, Heading, .body, Panel, .body, Rule, .body, String (+24 more)

### Community 103 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, app, build, build:locked, build:ui, dev, icons, typecheck

### Community 104 - "ServerDiscovery"
Cohesion: 0.20
Nodes (11): FoundServer, .id, ServerDiscovery, String, URL, Identifiable, NWBrowser, NWConnection (+3 more)

### Community 105 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, clean, dev, lint, test, typecheck

### Community 106 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+7 more)

### Community 107 - "design/src/index.ts"
Cohesion: 0.33
Nodes (5): Components, emitAccentColour(), cssBanner, swiftBanner, palette

### Community 108 - ".transcribe"
Cohesion: 0.18
Nodes (11): OnceBox, OnDeviceSpeech, OnDeviceSpeechError, .errorDescription, notAllowed, notAvailable, nothingHeard, Bool (+3 more)

### Community 109 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, fumadocs-core, fumadocs-mdx, fumadocs-ui, next, react, react-dom, @twinkleplop/bash (+7 more)

### Community 110 - "core/text.ts"
Cohesion: 0.67
Nodes (4): isNoise(), sentences(), speakable(), tidy()

### Community 111 - "setup.rs"
Cohesion: 0.26
Nodes (16): emit(), Event, inspect(), install_cli(), output(), Readiness, AppHandle, Option (+8 more)

### Community 112 - "config.json"
Cohesion: 0.14
Nodes (13): access, baseBranch, changelog, commit, fixed, format, ignore, linked (+5 more)

### Community 113 - "design/package.json"
Cohesion: 0.10
Nodes (20): description, devDependencies, @resvg/resvg-js, @types/node, typescript, exports, @types/node, typescript (+12 more)

### Community 114 - "RecorderError"
Cohesion: 0.29
Nodes (7): RecorderError, denied, .errorDescription, noInput, tooShort, String, LocalizedError

### Community 115 - "@parlour/design"
Cohesion: 0.17
Nodes (11): Changing something, Ink on a limewashed wall, with one lit thing, The icons, The states are part of the design system, Adding a surface, Adding a token, Icons, @parlour/design (+3 more)

### Community 116 - "kokoro.ts"
Cohesion: 0.23
Nodes (9): createKokoro(), kokoro, KokoroOptions, kokoroSchema, loadKokoro(), renderKokoro(), VoiceId, isKokoroVoiceId() (+1 more)

### Community 117 - "ffmpeg.ts"
Cohesion: 0.27
Nodes (11): audioInputs(), createFfmpeg(), execFileAsync, ffmpegDefinition, FfmpegOptions, FfmpegSchema, findInput(), parseAudioInputs() (+3 more)

### Community 118 - "Foundation"
Cohesion: 0.12
Nodes (11): AnswerTests, OnboardingTests, UserDefaults, CoreGraphics, dnssd, Foundation, FoundationModels, Network (+3 more)

### Community 119 - "vite.config.ts"
Cohesion: 0.50
Nodes (3): @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 120 - "tuning.mdx"
Cohesion: 0.17
Nodes (11): Audio, Decision model (optional), Logging, Search, Speech to text, The models, The pipeline, The voice (+3 more)

### Community 121 - "Product"
Cohesion: 0.17
Nodes (11): Accessibility & Inclusion, Brand Commitments, Capabilities and Constraints, Evidence on Hand, Operating Context, Platform, Positioning, Product (+3 more)

### Community 122 - "pair.ts"
Cohesion: 0.18
Nodes (15): command, PAIR_SCHEME, Pairing, pairingLink(), qrModules(), reachableHost(), svgCode(), terminalCode() (+7 more)

### Community 123 - "skills.mdx"
Cohesion: 0.50
Nodes (3): MCP servers, Plugins, Skills

### Community 124 - "afplay.ts"
Cohesion: 0.26
Nodes (7): Afplay, afplayDefinition, AfplayOptions, AfplaySchema, createAfplay(), context, warnings

### Community 125 - "AppSettings"
Cohesion: 0.12
Nodes (13): AppSettings, .onboarded, .preferOnDevice, .serverURL, .token, Key, Bool, String (+5 more)

### Community 126 - "[[...slug]]/page.tsx"
Cohesion: 0.27
Nodes (6): Page(), Props, getMDXComponents(), useMDXComponents, fumadocs-ui, ref_mdx

### Community 127 - "ai-sdk.test.ts"
Cohesion: 0.33
Nodes (4): nothingUsed, spec, silentLogger, @ai-sdk/provider

### Community 128 - "PairingLink"
Cohesion: 0.33
Nodes (4): PairingLink, String, URL, PairingTests

### Community 129 - "Parlour for iOS"
Cohesion: 0.22
Nodes (8): How it finds the server, Pairing, Parlour for iOS, Running it, The design system, The first run, The model on the phone, What it asks for, and why

### Community 130 - "docs/layout.tsx"
Cohesion: 0.33
Nodes (4): Layout(), Wordmark(), baseOptions(), next

### Community 131 - "defineProvider"
Cohesion: 0.19
Nodes (11): A secret of your own, An integration, How a name becomes a provider, The definition, Trying it against a checkout, Worked example: Piper as a voice, defineProvider(), createWhisperCpp() (+3 more)

### Community 132 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, postcss, tailwindcss, @tailwindcss/postcss, @types/mdx, @types/node, @types/react, @types/react-dom (+1 more)

### Community 133 - "laya-worker.py"
Cohesion: 0.25
Nodes (8): json, os, main(), normalize_answers(), Warm Laya-MLX worker for Parlour. Reads one JSON request per stdin line, writes…, Map Laya's answer objects onto Parlour's DecisionAnswer shape., sys, traceback

### Community 134 - "devDependencies"
Cohesion: 0.40
Nodes (5): devDependencies, @ai-sdk/provider, @types/node, @types/ws, typescript

### Community 135 - "emitCss"
Cohesion: 0.67
Nodes (4): colours(), emitCss(), invariants(), kebab()

### Community 136 - "app/layout.tsx"
Cohesion: 0.25
Nodes (6): apps_site_app_globals, alegreya, geist, metadata, viewport, @vercel/analytics

### Community 137 - "ios.mdx"
Cohesion: 0.25
Nodes (7): Building it, Finding the server, HomeKit, Pairing with your Mac, The first run, The model on the phone, What it asks for

### Community 138 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, prebuild, pretypecheck, start, typecheck

### Community 139 - "repository"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 142 - "home-assistant.mdx"
Cohesion: 0.33
Nodes (5): Home Assistant as a client, Muting, Set it up, What Parlour can do with it, What the doctor checks

### Community 143 - "parlour"
Cohesion: 0.33
Nodes (5): 0.3.0, 0.3.1, Minor Changes, parlour, Patch Changes

### Community 147 - "next.config.ts"
Cohesion: 0.40
Nodes (4): contentSecurityPolicy, nextConfig, securityHeaders, fumadocs-mdx

### Community 148 - "emit.ts"
Cohesion: 0.29
Nodes (8): main(), root, stale(), targets, double(), emitSwift(), parse(), opens()

### Community 149 - "wake-word.mdx"
Cohesion: 0.50
Nodes (3): Install it, Train it, Tune it

## Ambiguous Edges - Review These
- `Repository layout (packages/parlour, apps/desktop, apps/site, docs)` → `CLAUDE.md graphify rules`  [AMBIGUOUS]
  CLAUDE.md · relation: conceptually_related_to
- `Parlour Desktop App Icon` → `Site Favicon (apps/site/app/icon.svg)`  [AMBIGUOUS]
  apps/desktop/src-tauri/icon.png · relation: semantically_similar_to

## Knowledge Gaps
- **796 isolated node(s):** `$schema`, `baseBranch`, `access`, `ignore`, `fixed` (+791 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1107 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Repository layout (packages/parlour, apps/desktop, apps/site, docs)` and `CLAUDE.md graphify rules`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Parlour Desktop App Icon` and `Site Favicon (apps/site/app/icon.svg)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `lucide-react` connect `SettingsPanel.tsx` to `Onboarding.tsx`, `StatusPanel.tsx`, `cn`, `desktop/package.json`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `@tailwindcss/vite` connect `vite.config.ts` to `desktop/package.json`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `@vitejs/plugin-react` connect `vite.config.ts` to `desktop/package.json`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `OnboardingView` (e.g. with `.body` and `.body`) actually correct?**
  _`OnboardingView` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `baseBranch`, `access` to the rest of the system?**
  _796 weakly-connected nodes found - possible documentation gaps or missing edges._