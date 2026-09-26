# Graph Report - parlour  (2026-09-24)

## Corpus Check
- 321 files · ~213,767 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 17 file(s) not represented in the graph (top: (none) 6, .entitlements 3, .plist 3)

## Summary
- 3166 nodes · 7379 edges · 170 communities (142 shown, 28 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 361 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `94c4311f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- main.rs
- Contributing guide
- ToolsPanel.tsx
- Check
- settings.rs
- decision.ts
- Sendable
- VoiceSession
- parlour/package.json
- bridge.ts
- main.ts
- session.test.ts
- StatusPanel.tsx
- connectors/index.ts
- prompts.ts
- audio.ts
- services.ts
- ConnectorAuthProvider
- App.tsx
- models.ts
- SettingsPanel.tsx
- ServerView
- testing/index.ts
- Onboarding.tsx
- Tauri Config
- server/index.ts
- Logger
- targets
- stage.ts
- Parlour Nx Project
- Router
- admin.ts
- shadcn Components Config
- Biome Config
- Architecture Design Docs
- Provider Extension Docs
- scripts
- start.ts
- ref_node_assert
- Desktop TSConfig
- homeassistant.ts
- cli/cli.test.ts
- HomeKitStore
- Parlour TSConfig
- SessionState
- Nx Workspace Config
- process.ts
- desktop/package.json
- source.ts
- StateMark
- OnboardingView
- dependencies
- timers.ts
- bundle
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
- tasks.ts
- triage.ts
- devDependencies
- View
- Vite Env Types
- parlour-dev Script
- Design System: Parlour
- parlour
- Desktop Cargo Crate
- (home)/page.tsx
- login.rs
- Data
- output.ts
- ParlourTokens
- PairingScanner
- ios/project.json
- router.ts
- RequestQueue
- desktop.mdx
- targets
- ports.ts
- ai-sdk.ts
- SwiftUI
- LocalIntelligenceState
- ParlourClient
- compilerOptions
- icons.ts
- setup.ts
- .mono
- TalkView
- site/package.json
- doctor.ts
- Rule
- scripts
- FoundServer
- scripts
- compilerOptions
- design/src/index.ts
- .transcribe
- dependencies
- Step
- setup.rs
- config.json
- design/package.json
- RecorderError
- @parlour/design
- macos-say.ts
- .read32
- Foundation
- vite.config.ts
- tuning.mdx
- Product
- core/secrets.ts
- skills.mdx
- The Mac App Store build
- AppSettings
- [[...slug]]/page.tsx
- .convert
- PairingLink
- Parlour for iOS
- docs/layout.tsx
- providers.ts
- devDependencies
- laya-worker.py
- devDependencies
- scripts
- app/layout.tsx
- ios.mdx
- scripts
- repository
- Screen
- getting-started.mdx
- homeAssistant
- parlour
- start.test.ts
- Connection
- ServerAdminTests
- next
- emit.ts
- wake-word.mdx
- set-version.mjs
- xcode/ci_scripts/ci_post_clone.sh
- Front page: heyparlour.app
- AGENTS.md
- postcss.config.mjs
- notarise.sh
- .play
- endpoint.test.ts
- embed.sh
- build.sh
- package.sh
- sign-nested.sh
- ios/ci_scripts/ci_post_clone.sh
- bin
- engines
- exports
- command

## God Nodes (most connected - your core abstractions)
1. `Logger` - 65 edges
2. `OnboardingView` - 48 edges
3. `Check` - 47 edges
4. `Text` - 42 edges
5. `loadConfig()` - 31 edges
6. `registerProvider()` - 31 edges
7. `Paths` - 30 edges
8. `Message` - 30 edges
9. `init()` - 28 edges
10. `buildAgent()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `Running the app against a checkout` --references--> `parlourBin()`  [INFERRED]
  apps/site/content/docs/desktop.mdx → packages/parlour/src/cli/service.ts
- `Speech to text` --references--> `model()`  [INFERRED]
  apps/site/content/docs/tuning.mdx → packages/parlour/src/providers/llm/ai-sdk.test.ts
- `Assembly` --references--> `Agent`  [INFERRED]
  apps/site/content/docs/architecture.mdx → packages/parlour/src/core/agent.ts
- `Ports` --references--> `WakeWordDetector`  [INFERRED]
  apps/site/content/docs/architecture.mdx → packages/parlour/src/core/ports.ts
- `Ports` --references--> `SecretStore`  [INFERRED]
  apps/site/content/docs/architecture.mdx → packages/parlour/src/core/ports.ts

## Import Cycles
- None detected.

## Communities (170 total, 28 thin omitted)

### Community 0 - "main.rs"
Cohesion: 0.15
Nodes (32): AppState, ask_to_quit(), audio_devices(), CliOutput, get_settings(), host_name(), install_cli(), logs() (+24 more)

### Community 1 - "Contributing guide"
Cohesion: 0.06
Nodes (55): Dependabot configuration, Bug report issue template, Feature or provider request template, Pull request template and merge checklist, CI check job (typecheck, lint, test, build, cargo check), CI workflow, Tauri generate_context! ordering constraint, Build the app and attach dmg to release job (+47 more)

### Community 2 - "ToolsPanel.tsx"
Cohesion: 0.09
Nodes (31): Alert(), AlertDescription(), alertVariants, addMcp(), addPlugin(), McpServer, Plugin, removeMcp() (+23 more)

### Community 3 - "Check"
Cohesion: 0.07
Nodes (19): Check, Tool, AssistResult, createHomeAssistant(), HomeAssistantOptions, HomeAssistantOptionsInput, httpTransport(), BraveOptions (+11 more)

### Community 4 - "settings.rs"
Cohesion: 0.15
Nodes (25): bin_dir(), detect_parlour(), executable(), found(), found_on(), found_on_skips_files_that_cannot_run(), found_on_walks_every_path_entry_in_order(), home() (+17 more)

### Community 5 - "decision.ts"
Cohesion: 0.16
Nodes (14): DECISION_INTENTS, DecisionInput, DecisionIntent, DecisionPlan, decisionQuestions(), DecisionVerdict, noulOf(), parseIntent() (+6 more)

### Community 6 - "Sendable"
Cohesion: 0.15
Nodes (26): AdminStatus, Limits, ManagedService, .id, .summary, .title, Memory, Pipeline (+18 more)

### Community 7 - "VoiceSession"
Cohesion: 0.17
Nodes (5): micMode(), Endpointer, AgentEvent, LocalVoice, VoiceSession

### Community 8 - "parlour/package.json"
Cohesion: 0.11
Nodes (17): description, files, homepage, @types/node, typescript, keywords, license, name (+9 more)

### Community 9 - "bridge.ts"
Cohesion: 0.09
Nodes (43): AgentState, audioDevices(), CliOutput, connectorAdd(), connectorRemove(), deviceValue(), failure(), getConnectors() (+35 more)

### Community 10 - "main.ts"
Cohesion: 0.05
Nodes (54): CliContext, Command, GLOBAL_OPTIONS, OptionSpec, parseCli(), Parsed, parseGlobals(), readStdin() (+46 more)

### Community 11 - "session.test.ts"
Cohesion: 0.16
Nodes (5): Answer, log, RecordingSink, VoiceSink, VoiceState

### Community 12 - "StatusPanel.tsx"
Cohesion: 0.12
Nodes (20): Badge(), badgeVariants, Button(), buttonVariants, Check, hostName(), Pairing, pairingCode() (+12 more)

### Community 13 - "connectors/index.ts"
Cohesion: 0.09
Nodes (24): Paths, SecretStore, addConnector(), ConnectorRow, listConnectors(), reason(), removeConnector(), memory (+16 more)

### Community 14 - "prompts.ts"
Cohesion: 0.11
Nodes (27): dim(), green(), allowBack(), answeredCount(), choiceLine(), GoBack, keysHint(), line() (+19 more)

### Community 15 - "audio.ts"
Cohesion: 0.14
Nodes (15): levels(), listen(), record(), trialOf(), utterance(), decodeToWav(), EMPTY, FRAME_MS (+7 more)

### Community 16 - "services.ts"
Cohesion: 0.12
Nodes (19): CompanionOptions, CompanionState, MAX_LOG_BYTES, Spawn, MEMORY_REFUSE, MEMORY_WARN, memoryVerdict, modelFileOf() (+11 more)

### Community 17 - "ConnectorAuthProvider"
Cohesion: 0.09
Nodes (14): connectorsIntegration, connectorTools(), createConnectorsIntegration(), ConnectorAuthProvider, providerFor(), childEnvironment(), createMcpIntegration(), mcpIntegration (+6 more)

### Community 18 - "App.tsx"
Cohesion: 0.11
Nodes (28): App(), confirmQuit(), power(), DOT, TabName, TABS, tail(), UNKNOWN (+20 more)

### Community 19 - "models.ts"
Cohesion: 0.17
Nodes (20): askedFor(), command, fetchFile(), fetchLocalModel(), fetchModels(), NotFetchable, SHARED, suggest() (+12 more)

### Community 20 - "SettingsPanel.tsx"
Cohesion: 0.07
Nodes (32): Card(), CardContent(), CardHeader(), CardTitle(), Checkbox(), Input(), Label(), Select() (+24 more)

### Community 21 - "ServerView"
Cohesion: 0.21
Nodes (10): ServerView, .body, .headline, AdminStatus, Binding, ClosedRange, Int, ManagedService (+2 more)

### Community 22 - "testing/index.ts"
Cohesion: 0.07
Nodes (27): Testing, fakeConfig(), made, paths, registerFakes(), say(), withCloud(), DecisionQuestion (+19 more)

### Community 23 - "Onboarding.tsx"
Cohesion: 0.09
Nodes (31): Readiness, SetupEvent, Stage, Trial, cn(), indexOf(), Job, Disclosure() (+23 more)

### Community 24 - "Tauri Config"
Cohesion: 0.08
Nodes (23): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+15 more)

### Community 25 - "server/index.ts"
Cohesion: 0.13
Nodes (31): advertise(), Advertisement, admin(), ADMIN_ROUTES, allowCors(), API_ROUTES, ask(), AskBody (+23 more)

### Community 26 - "Logger"
Cohesion: 0.09
Nodes (24): Level, Logger, order, stamp(), write(), ProviderContext, AnthropicOptions, anthropicProvider (+16 more)

### Community 27 - "targets"
Cohesion: 0.05
Nodes (45): command, continuous, options, command, options, outputs, command, options (+37 more)

### Community 28 - "stage.ts"
Cohesion: 0.18
Nodes (20): binaries, cache, desktop, download(), ffmpeg(), ggml(), here, licences() (+12 more)

### Community 29 - "Parlour Nx Project"
Cohesion: 0.12
Nodes (18): command, options, command, options, name, cwd, projectType, $schema (+10 more)

### Community 30 - "Router"
Cohesion: 0.16
Nodes (3): roomContext(), Router, TaskList

### Community 31 - "admin.ts"
Cohesion: 0.06
Nodes (34): SetupOptions, TrialContext, Admin, AdminDeps, AdminError, AdminStatus, isServiceName(), MANAGED_SERVICES (+26 more)

### Community 32 - "shadcn Components Config"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 33 - "Biome Config"
Cohesion: 0.11
Nodes (17): css, parser, files, includes, formatter, indentStyle, lineWidth, quoteStyle (+9 more)

### Community 36 - "scripts"
Cohesion: 0.06
Nodes (35): devDependencies, @biomejs/biome, @changesets/cli, nx, engines, node, name, packageManager (+27 more)

### Community 37 - "start.ts"
Cohesion: 0.08
Nodes (34): command, SUBCOMMANDS, USAGE, command, log, RETRY_MS, USAGE, RESTART_EXIT_CODE (+26 more)

### Community 38 - "ref_node_assert"
Cohesion: 0.07
Nodes (37): home, listed, pathsWith(), quiet, resolvePaths(), context, paths, root (+29 more)

### Community 39 - "Desktop TSConfig"
Cohesion: 0.12
Nodes (16): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 40 - "homeassistant.ts"
Cohesion: 0.22
Nodes (18): CANDIDATE_URLS, findHomeAssistant(), looksLikeHomeAssistant(), mcpServerPresent(), setupHomeAssistant(), tokenWorks(), trim(), confirmOr() (+10 more)

### Community 41 - "cli/cli.test.ts"
Cohesion: 0.16
Nodes (8): BIN, Run, call(), AGENT_LABEL, manifest, packageFile, VERSION, ref_node_http

### Community 42 - "HomeKitStore"
Cohesion: 0.12
Nodes (20): Any, Accessory, HomeKitStore, Room, .id, Bool, ClosedRange, Double (+12 more)

### Community 43 - "Parlour TSConfig"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+7 more)

### Community 44 - "SessionState"
Cohesion: 0.09
Nodes (22): ServiceAction, restart, start, stop, ColourRole, bracken, hearth, lamp (+14 more)

### Community 45 - "Nx Workspace Config"
Cohesion: 0.13
Nodes (14): analytics, cache, dependsOn, outputs, defaultBase, cache, $schema, targetDefaults (+6 more)

### Community 46 - "process.ts"
Cohesion: 0.08
Nodes (20): BoundedLog, startCompanions(), execFileAsync, findOnPath(), killOnExit(), orphans(), parseOrphans(), run() (+12 more)

### Community 47 - "desktop/package.json"
Cohesion: 0.11
Nodes (17): description, react, react-dom, tailwindcss, @types/react, @types/react-dom, typescript, license (+9 more)

### Community 48 - "source.ts"
Cohesion: 0.20
Nodes (10): GET, docs, source, fumadocs-core, @twinkleplop/bash, @twinkleplop/json, @twinkleplop/markdown, @twinkleplop/rehype (+2 more)

### Community 49 - "StateMark"
Cohesion: 0.17
Nodes (14): Animation, ButtonStyle, .hearth, HearthButtonStyle, StateMark, .body, .mark, .pulse (+6 more)

### Community 50 - "OnboardingView"
Cohesion: 0.08
Nodes (38): AnyTransition, URL, Text, ConnectStage, find, pair, OnboardingView, .body (+30 more)

### Community 51 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, ai, @ai-sdk/anthropic, @ai-sdk/openai-compatible, @anthropic-ai/sdk, bonjour-service, kokoro-js, @modelcontextprotocol/sdk (+4 more)

### Community 52 - "timers.ts"
Cohesion: 0.27
Nodes (7): describe(), log, fakeClock(), setUp(), Timer, Timers, TimersOptions

### Community 53 - "bundle"
Cohesion: 0.17
Nodes (11): bundle, externalBin, macOS, resources, targets, entitlements, hardenedRuntime, minimumSystemVersion (+3 more)

### Community 54 - "architecture.mdx"
Cohesion: 0.20
Nodes (9): Assembly, Configuration, secrets and paths, The action agent, The pipeline, The queue, The session, The task list, Triage (+1 more)

### Community 55 - "init.ts"
Cohesion: 0.16
Nodes (21): HomeAssistantAnswers, afterword(), agentServiceInstalled(), Answers, applyAnswers(), command, Context, init() (+13 more)

### Community 56 - "Phone Push-to-Talk Page"
Cohesion: 0.20
Nodes (13): chunks, params, play(), send(), start(), status(), stop(), store (+5 more)

### Community 57 - "Build TSConfig"
Cohesion: 0.20
Nodes (9): compilerOptions, declaration, noEmit, outDir, rewriteRelativeImportExtensions, rootDir, exclude, extends (+1 more)

### Community 58 - "css.ts"
Cohesion: 0.18
Nodes (19): Scheme, double(), emitSwift(), parse(), Duotone, hairline, leading, measure (+11 more)

### Community 60 - "clients.mdx"
Cohesion: 0.17
Nodes (10): Events, A phone, A satellite, Automations and scripts, Bonjour, Custom hardware, Home Assistant satellites, Managing the server (+2 more)

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
Cohesion: 0.10
Nodes (26): a_restarting_event_marks_the_status_so_the_exit_is_followed_by_a_start(), agent_command(), agent_command_leaves_log_level_to_secrets_env(), apply(), LOG_LINES, AppHandle, Default, Mutex (+18 more)

### Community 65 - "Desktop App Icon"
Cohesion: 0.33
Nodes (7): Parlour Desktop App Icon, Three-Bar Audio Waveform Motif, Dark Charcoal and Mint Green Palette, Rounded Square Icon Container, Tauri Desktop App (apps/desktop), Voice / Wake Word Product Identity, Site Favicon (apps/site/app/icon.svg)

### Community 67 - "laya-mlx.ts"
Cohesion: 0.16
Nodes (11): DecisionAnswer, DecisionInstructions, createLayaMlx(), defaultWorkerPath(), flattenInstructions(), LayaMlxDecisionModel, LayaMlxOptions, layaMlxProvider (+3 more)

### Community 68 - "Tauri Capabilities"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 69 - "tasks.ts"
Cohesion: 0.24
Nodes (7): only(), same(), Task, TaskKind, TaskOutcome, TaskRequest, TaskStatus

### Community 70 - "triage.ts"
Cohesion: 0.26
Nodes (11): extract(), fastTriage(), log, parseTriage(), recent(), simple(), triage, TriageContext (+3 more)

### Community 71 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, tailwindcss, @tailwindcss/vite, @tauri-apps/cli, tw-animate-css, @types/react, @types/react-dom, typescript (+2 more)

### Community 72 - "View"
Cohesion: 0.12
Nodes (21): View, RootView, Heading, .body, Panel, .body, Content, String (+13 more)

### Community 76 - "Design System: Parlour"
Cohesion: 0.08
Nodes (25): Code blocks, Colors, Components, Controls, Departures from the brief, Design System: Parlour, Do:, Do's and Don'ts (+17 more)

### Community 77 - "parlour"
Cohesion: 0.09
Nodes (24): ./config.js, ./connectors.js, ./doctor.js, ./init.js, ./mcp.js, ./models.js, COMMANDS, help() (+16 more)

### Community 79 - "(home)/page.tsx"
Cohesion: 0.11
Nodes (13): asked, ConfigFile(), DesktopSettings(), line, PhoneHouse(), PhoneTalk(), PrivacyDiagram(), RoomScene() (+5 more)

### Community 80 - "login.rs"
Cohesion: 0.36
Nodes (8): enabled(), login_item(), Option, Result, String, set(), set_login_item(), objc2_service_management

### Community 81 - "Data"
Cohesion: 0.23
Nodes (8): Data, Recorder, .permission, SharedAudioSession, Double, T, WAV, AVAudioApplication

### Community 82 - "output.ts"
Cohesion: 0.33
Nodes (8): bold(), EventKind, headline(), humanReporter(), porcelainReporter(), red(), yellow(), describe()

### Community 83 - "ParlourTokens"
Cohesion: 0.14
Nodes (16): Color, Palette, Radius, Space, Double, UInt32, UIColor, Leading (+8 more)

### Community 84 - "PairingScanner"
Cohesion: 0.15
Nodes (15): Coordinator, PairingScanner, .body, .caption, .unavailable, ScannerView, Bool, String (+7 more)

### Community 85 - "ios/project.json"
Cohesion: 0.10
Nodes (22): command, dependsOn, options, command, options, outputs, name, cwd (+14 more)

### Community 86 - "router.ts"
Cohesion: 0.06
Nodes (44): DecisionMode, ActionAgent, CLOUD_DOWN, cloudTurn(), DecisionSettings, dispatch(), Dispatched, LOCAL_DOWN (+36 more)

### Community 87 - "RequestQueue"
Cohesion: 0.16
Nodes (7): Job, Lane, QueueOptions, RequestQueue, SupersededError, deferred(), harness()

### Community 88 - "desktop.mdx"
Cohesion: 0.22
Nodes (8): Building it, Deliberate choices, How it fits together, Running the app against a checkout, Setting up, Signing, The tabs, Two things to know

### Community 89 - "targets"
Cohesion: 0.11
Nodes (21): command, options, command, options, command, options, name, cwd (+13 more)

### Community 90 - "ports.ts"
Cohesion: 0.05
Nodes (64): Ports, The other kinds, inspect(), everySkill(), command, DEFAULT_SECONDS, resolver(), Stage (+56 more)

### Community 91 - "ai-sdk.ts"
Cohesion: 0.09
Nodes (23): stripThinking(), AiSdkModel, AiSdkModelOptions, AiSdkOptions, aiSdkProvider, AiSdkSchema, asArgs(), createAiSdk() (+15 more)

### Community 92 - "SwiftUI"
Cohesion: 0.19
Nodes (7): App, ParlourApp, .body, AVFoundation, Scene, SwiftUI, VisionKit

### Community 93 - "LocalIntelligenceState"
Cohesion: 0.12
Nodes (16): AnyObject, LocalIntelligence, .session, LocalIntelligenceState, .explanation, failed, modelNotReady, notEnabled (+8 more)

### Community 94 - "ParlourClient"
Cohesion: 0.12
Nodes (21): Answer, ClientError, .errorDescription, noServer, refused, server, unauthorised, Health (+13 more)

### Community 95 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 96 - "icons.ts"
Cohesion: 0.15
Nodes (16): emitAppIconContents(), emitFaviconSvg(), IconShape, iconSvg(), LAMP, MARK, shapes, chunk() (+8 more)

### Community 97 - "setup.ts"
Cohesion: 0.20
Nodes (13): HouseOptions, InitOptions, DEFAULT_WAKE_WORDS, DEFAULT_WHISPER_MODEL, FetchModelsOptions, Reporter, formulaeFor(), HOMEBREW_FORMULAE (+5 more)

### Community 98 - ".mono"
Cohesion: 0.39
Nodes (4): Ramp, CGFloat, Configuration, Font

### Community 99 - "TalkView"
Cohesion: 0.24
Nodes (7): Bool, String, Void, TalkView, .talkButton, .viaLabel, Never

### Community 100 - "site/package.json"
Cohesion: 0.11
Nodes (17): description, react, react-dom, tailwindcss, @types/node, @types/react, @types/react-dom, typescript (+9 more)

### Community 101 - "doctor.ts"
Cohesion: 0.08
Nodes (34): command, diagnose(), forgottenConnectors(), reachable(), satellite(), server(), service(), USAGE (+26 more)

### Community 102 - "Rule"
Cohesion: 0.16
Nodes (14): .body, Rule, .body, SettingsView, .body, .found, .onDevice, .permissions (+6 more)

### Community 103 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, app, build, build:locked, build:ui, dev, icons, typecheck

### Community 104 - "FoundServer"
Cohesion: 0.22
Nodes (10): FoundServer, .id, ServerDiscovery, String, URL, NWBrowser, NWConnection, NWEndpoint (+2 more)

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

### Community 110 - "Step"
Cohesion: 0.25
Nodes (8): Step, connect, extras, finish, .label, voice, welcome, Comparable

### Community 111 - "setup.rs"
Cohesion: 0.32
Nodes (14): emit(), Event, inspect(), install_cli(), output(), Readiness, AppHandle, Option (+6 more)

### Community 112 - "config.json"
Cohesion: 0.14
Nodes (13): access, baseBranch, changelog, commit, fixed, format, ignore, linked (+5 more)

### Community 113 - "design/package.json"
Cohesion: 0.14
Nodes (13): description, devDependencies, @resvg/resvg-js, @types/node, typescript, exports, @types/node, typescript (+5 more)

### Community 114 - "RecorderError"
Cohesion: 0.29
Nodes (7): RecorderError, denied, .errorDescription, noInput, tooShort, String, LocalizedError

### Community 115 - "@parlour/design"
Cohesion: 0.17
Nodes (11): Changing something, Ink on a limewashed wall, with one lit thing, The icons, The states are part of the design system, Adding a surface, Adding a token, Icons, @parlour/design (+3 more)

### Community 116 - "macos-say.ts"
Cohesion: 0.14
Nodes (19): isNoise(), sentences(), speakable(), tidy(), createKokoro(), kokoro, KokoroOptions, kokoroSchema (+11 more)

### Community 117 - ".read32"
Cohesion: 0.39
Nodes (4): Int, UInt32, WAVTests, UInt16

### Community 118 - "Foundation"
Cohesion: 0.16
Nodes (8): AnswerTests, CoreGraphics, dnssd, Foundation, Network, Observation, Parlour, Testing

### Community 119 - "vite.config.ts"
Cohesion: 0.50
Nodes (3): @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 120 - "tuning.mdx"
Cohesion: 0.12
Nodes (14): Providers, Audio, Decision model (optional), Keeping the Mac responsive, Logging, Search, Speech to text, The models (+6 more)

### Community 121 - "Product"
Cohesion: 0.17
Nodes (11): Accessibility & Inclusion, Brand Commitments, Capabilities and Constraints, Evidence on Hand, Operating Context, Platform, Positioning, Product (+3 more)

### Community 122 - "core/secrets.ts"
Cohesion: 0.16
Nodes (17): command, PAIR_SCHEME, Pairing, pairingLink(), qrModules(), reachableHost(), svgCode(), terminalCode() (+9 more)

### Community 123 - "skills.mdx"
Cohesion: 0.50
Nodes (3): MCP servers, Plugins, Skills

### Community 124 - "The Mac App Store build"
Cohesion: 0.29
Nodes (6): Building it in Xcode Cloud, Not done yet, The files, The Mac App Store build, Things App Review will ask about, Trying it on your own Mac

### Community 125 - "AppSettings"
Cohesion: 0.10
Nodes (15): AppSettings, .onboarded, .preferOnDevice, .serverURL, .token, Key, Bool, String (+7 more)

### Community 126 - "[[...slug]]/page.tsx"
Cohesion: 0.27
Nodes (6): Page(), Props, getMDXComponents(), useMDXComponents, fumadocs-ui, ref_mdx

### Community 127 - ".convert"
Cohesion: 0.29
Nodes (4): Sendable, AVAudioConverter, AVAudioFormat, AVAudioPCMBuffer

### Community 128 - "PairingLink"
Cohesion: 0.33
Nodes (4): PairingLink, String, URL, PairingTests

### Community 129 - "Parlour for iOS"
Cohesion: 0.22
Nodes (8): How it finds the server, Pairing, Parlour for iOS, Running it, The design system, The first run, The model on the phone, What it asks for, and why

### Community 130 - "docs/layout.tsx"
Cohesion: 0.53
Nodes (3): Layout(), Wordmark(), baseOptions()

### Community 131 - "providers.ts"
Cohesion: 0.05
Nodes (50): A secret of your own, An integration, How a name becomes a provider, The definition, Trying it against a checkout, Worked example: Piper as a voice, defineProvider(), importProvider() (+42 more)

### Community 132 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, postcss, tailwindcss, @tailwindcss/postcss, @types/mdx, @types/node, @types/react, @types/react-dom (+1 more)

### Community 133 - "laya-worker.py"
Cohesion: 0.21
Nodes (11): json, os, main(), normalize_answers(), Warm Laya-MLX worker for Parlour. Reads one JSON request per stdin line, writes…, Map Laya's answer objects onto Parlour's DecisionAnswer shape., emit(), main() (+3 more)

### Community 134 - "devDependencies"
Cohesion: 0.40
Nodes (5): devDependencies, @ai-sdk/provider, @types/node, @types/ws, typescript

### Community 135 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, emit, emit:check, icons, lint, test, typecheck

### Community 136 - "app/layout.tsx"
Cohesion: 0.25
Nodes (6): apps_site_app_globals, alegreya, geist, metadata, viewport, @vercel/analytics

### Community 137 - "ios.mdx"
Cohesion: 0.22
Nodes (8): Building it, Finding the server, HomeKit, Managing the server, Pairing with your Mac, The first run, The model on the phone, What it asks for

### Community 138 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, prebuild, pretypecheck, start, typecheck

### Community 139 - "repository"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 140 - "Screen"
Cohesion: 0.33
Nodes (6): Screen, house, server, settings, talk, Hashable

### Community 141 - "getting-started.mdx"
Cohesion: 0.33
Nodes (5): Home Assistant, Next, The cloud is optional, The local model comes with it, What `init` asks

### Community 142 - "homeAssistant"
Cohesion: 0.18
Nodes (8): Assist, Home Assistant as a client, Muting, Set it up, What Parlour can do with it, What the doctor checks, assistTool(), homeAssistant

### Community 143 - "parlour"
Cohesion: 0.15
Nodes (12): 0.3.0, 0.3.1, 0.4.0, 0.5.0, 0.6.0, Minor Changes, Minor Changes, Minor Changes (+4 more)

### Community 145 - "Connection"
Cohesion: 0.40
Nodes (5): Connection, checking, connected, failed, untried

### Community 147 - "next"
Cohesion: 0.18
Nodes (6): metadata, contentSecurityPolicy, nextConfig, securityHeaders, fumadocs-mdx, next

### Community 148 - "emit.ts"
Cohesion: 0.31
Nodes (8): colours(), emitCss(), invariants(), kebab(), main(), root, stale(), targets

### Community 149 - "wake-word.mdx"
Cohesion: 0.50
Nodes (3): Install it, Train it, Tune it

### Community 150 - "set-version.mjs"
Cohesion: 0.50
Nodes (4): crateName(), root, TARGETS, usage()

### Community 151 - "xcode/ci_scripts/ci_post_clone.sh"
Cohesion: 0.67
Nodes (3): fetch(), PATH, ci_post_clone.sh script

## Ambiguous Edges - Review These
- `Repository layout (packages/parlour, apps/desktop, apps/site, docs)` → `CLAUDE.md graphify rules`  [AMBIGUOUS]
  CLAUDE.md · relation: conceptually_related_to
- `Parlour Desktop App Icon` → `Site Favicon (apps/site/app/icon.svg)`  [AMBIGUOUS]
  apps/desktop/src-tauri/icon.png · relation: semantically_similar_to

## Knowledge Gaps
- **887 isolated node(s):** `$schema`, `baseBranch`, `access`, `ignore`, `fixed` (+882 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1239 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Repository layout (packages/parlour, apps/desktop, apps/site, docs)` and `CLAUDE.md graphify rules`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Parlour Desktop App Icon` and `Site Favicon (apps/site/app/icon.svg)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `lucide-react` connect `SettingsPanel.tsx` to `ToolsPanel.tsx`, `Onboarding.tsx`, `StatusPanel.tsx`, `desktop/package.json`?**
  _High betweenness centrality (0.230) - this node is a cross-community bridge._
- **Why does `View` connect `View` to `TalkView`, `Rule`, `StatusPanel.tsx`, `StateMark`, `OnboardingView`, `ParlourTokens`, `PairingScanner`, `ServerView`?**
  _High betweenness centrality (0.222) - this node is a cross-community bridge._
- **Why does `@tailwindcss/vite` connect `vite.config.ts` to `desktop/package.json`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **What connects `$schema`, `baseBranch`, `access` to the rest of the system?**
  _887 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Contributing guide` be split into smaller, more focused modules?**
  _Cohesion score 0.05974025974025974 - nodes in this community are weakly interconnected._