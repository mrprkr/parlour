# Graph Report - parlour  (2026-09-23)

## Corpus Check
- 287 files · ~180,506 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 15 file(s) not represented in the graph (top: (none) 6, .plist 3, .css 3)

## Summary
- 2781 nodes · 6282 edges · 151 communities (133 shown, 18 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 321 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `05461e99`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- main.rs
- Contributing guide
- parlour
- zod
- settings.rs
- router.ts
- ref_node_path
- connectorStore
- parlour/package.json
- Onboarding.tsx
- main.ts
- testing/index.ts
- StatusPanel.tsx
- ref_node_assert
- output.ts
- oauth.ts
- models.ts
- mcp/index.ts
- App.tsx
- core/secrets.ts
- SettingsPanel.tsx
- doctor.ts
- agent.ts
- cn
- Tauri Config
- server/index.ts
- openwakeword.ts
- targets
- homeAssistant
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
- services.ts
- Accessory
- Parlour TSConfig
- Sendable
- Nx Workspace Config
- buildAgent
- desktop/package.json
- Reveal
- launchd.ts
- OnboardingView
- ConnectorAuthProvider
- Tool
- AccessoryCard
- architecture.mdx
- init.ts
- Phone Push-to-Talk Page
- Build TSConfig
- css.ts
- Site Vercel Config
- clients.mdx
- site/project.json
- connectors/index.ts
- dependencies
- Supervisor
- Desktop App Icon
- Documentation Index
- laya-mlx.ts
- Tauri Capabilities
- ref_node_url
- triage.ts
- devDependencies
- HomeKitStore
- Vite Env Types
- parlour-dev Script
- Design System: Parlour
- parlour
- Desktop Cargo Crate
- (home)/page.tsx
- topology.tsx
- Data
- core/plugins.ts
- ParlourTokens
- PairingScanner
- ios/project.json
- ports.ts
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
- setup.ts
- defineTool
- TalkView
- site/package.json
- service.ts
- Text
- scripts
- ServerDiscovery
- Components.swift
- compilerOptions
- design/src/index.ts
- .transcribe
- dependencies
- .mark
- setup.rs
- config.json
- design/package.json
- RecorderError
- @parlour/design
- macos-say.ts
- ffmpeg.ts
- Foundation
- vite.config.ts
- tuning.mdx
- Product
- pair.ts
- skills.mdx
- process.ts
- AppSettings
- [[...slug]]/page.tsx
- PairingLink
- Parlour for iOS
- docs/layout.tsx
- registerProvider
- devDependencies
- laya-worker.py
- .read32
- app/layout.tsx
- ios.mdx
- scripts
- scripts
- SettingsTests
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
2. `Check` - 40 edges
3. `OnboardingView` - 38 edges
4. `Text` - 32 edges
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

## Communities (151 total, 18 thin omitted)

### Community 0 - "main.rs"
Cohesion: 0.16
Nodes (29): AppState, audio_devices(), CliOutput, get_settings(), host_name(), install_cli(), logs(), main() (+21 more)

### Community 1 - "Contributing guide"
Cohesion: 0.06
Nodes (55): Dependabot configuration, Bug report issue template, Feature or provider request template, Pull request template and merge checklist, CI check job (typecheck, lint, test, build, cargo check), CI workflow, Tauri generate_context! ordering constraint, Build the app and attach dmg to release job (+47 more)

### Community 2 - "parlour"
Cohesion: 0.23
Nodes (14): connectorAdd(), connectorRemove(), failure(), getConnectors(), pairingCode(), parlour(), run(), runDoctor() (+6 more)

### Community 3 - "zod"
Cohesion: 0.13
Nodes (11): BraveOptions, braveProvider, BraveSchema, BraveSearch, createBrave(), createSearxng(), SearxngOptions, searxngProvider (+3 more)

### Community 4 - "settings.rs"
Cohesion: 0.14
Nodes (22): detect_parlour(), executable(), found(), found_on(), found_on_skips_files_that_cannot_run(), found_on_walks_every_path_entry_in_order(), home(), login_shell() (+14 more)

### Community 5 - "router.ts"
Cohesion: 0.07
Nodes (38): DECISION_INTENTS, DecisionInput, DecisionIntent, DecisionMode, DecisionPlan, decisionQuestions(), DecisionVerdict, noulOf() (+30 more)

### Community 6 - "ref_node_path"
Cohesion: 0.11
Nodes (27): home, listed, pathsWith(), command, SUBCOMMANDS, USAGE, command, everySkill() (+19 more)

### Community 7 - "connectorStore"
Cohesion: 0.13
Nodes (12): SecretStore, addConnector(), listConnectors(), reason(), removeConnector(), memory, paths, secrets (+4 more)

### Community 8 - "parlour/package.json"
Cohesion: 0.04
Nodes (48): bin, parlour, dependencies, ai, @ai-sdk/anthropic, @ai-sdk/openai-compatible, @anthropic-ai/sdk, bonjour-service (+40 more)

### Community 9 - "Onboarding.tsx"
Cohesion: 0.11
Nodes (34): AgentState, audioDevices(), Check, CliOutput, deviceValue(), getNetwork(), getSettings(), hostName() (+26 more)

### Community 10 - "main.ts"
Cohesion: 0.08
Nodes (35): CliContext, Command, GLOBAL_OPTIONS, OptionSpec, parseCli(), Parsed, parseGlobals(), readStdin() (+27 more)

### Community 11 - "testing/index.ts"
Cohesion: 0.08
Nodes (22): Testing, fakeConfig(), made, paths, registerFakes(), say(), withCloud(), clearProviders() (+14 more)

### Community 12 - "StatusPanel.tsx"
Cohesion: 0.09
Nodes (26): Alert(), AlertDescription(), alertVariants, Badge(), badgeVariants, Button(), buttonVariants, Card() (+18 more)

### Community 13 - "ref_node_assert"
Cohesion: 0.10
Nodes (11): frame(), frames(), escalateSpec, languageName(), PromptOptions, systemPrompt(), require, FakeSecretStore (+3 more)

### Community 14 - "output.ts"
Cohesion: 0.11
Nodes (25): bold(), dim(), EventKind, green(), headline(), humanReporter(), porcelainReporter(), red() (+17 more)

### Community 15 - "oauth.ts"
Cohesion: 0.43
Nodes (6): authorise(), log, openInBrowser(), withTimeout(), ref_node_http, ref_node_net

### Community 16 - "models.ts"
Cohesion: 0.14
Nodes (24): askedFor(), modelChoices(), chosenLocalModel(), command, fetchFile(), fetchLocalModel(), fetchModels(), FetchModelsOptions (+16 more)

### Community 17 - "mcp/index.ts"
Cohesion: 0.15
Nodes (17): createHomeAssistant(), HomeAssistantOptions, HomeAssistantOptionsInput, childEnvironment(), createMcpIntegration(), httpTransport(), INHERITED_ENV, log (+9 more)

### Community 18 - "App.tsx"
Cohesion: 0.12
Nodes (22): App(), power(), DOT, TabName, TABS, tail(), UNKNOWN, Tabs() (+14 more)

### Community 19 - "core/secrets.ts"
Cohesion: 0.31
Nodes (8): command, USAGE, loadSecrets(), parseEnvFile(), readSecretsFile(), paths, unquote(), ref_node_readline

### Community 20 - "SettingsPanel.tsx"
Cohesion: 0.10
Nodes (23): Checkbox(), Select(), SelectContent(), SelectItem(), SelectTrigger(), SelectValue(), AgentConfig, setSecret() (+15 more)

### Community 21 - "doctor.ts"
Cohesion: 0.17
Nodes (13): command, diagnose(), forgottenConnectors(), reachable(), satellite(), server(), USAGE, ProviderContextFactory (+5 more)

### Community 22 - "agent.ts"
Cohesion: 0.07
Nodes (28): Ports, The other kinds, SetupOptions, Agent, BuildOptions, checksOf(), log, Config (+20 more)

### Community 23 - "cn"
Cohesion: 0.23
Nodes (11): cn(), Disclosure(), Heading(), Mark(), Note(), Optional(), Row(), StepMeta (+3 more)

### Community 24 - "Tauri Config"
Cohesion: 0.08
Nodes (23): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+15 more)

### Community 25 - "server/index.ts"
Cohesion: 0.05
Nodes (46): micMode(), decodeToWav(), EMPTY, FRAME_MS, FRAME_SAMPLES, FrameCutter, frameFrom(), rms() (+38 more)

### Community 26 - "openwakeword.ts"
Cohesion: 0.13
Nodes (10): createOpenWakeWord(), OpenWakeWord, openWakeWordDefinition, OpenWakeWordOptions, OpenWakeWordSchema, run(), Sessions, SHARED_MODELS (+2 more)

### Community 27 - "targets"
Cohesion: 0.06
Nodes (38): command, continuous, options, command, options, outputs, command, options (+30 more)

### Community 29 - "Parlour Nx Project"
Cohesion: 0.12
Nodes (18): command, options, command, options, name, cwd, projectType, $schema (+10 more)

### Community 30 - "Router"
Cohesion: 0.17
Nodes (3): roomContext(), Router, TaskList

### Community 31 - "server/index.test.ts"
Cohesion: 0.12
Nodes (13): AiSdkModel, model(), nothingUsed, spec, ServerDeps, opens(), Raw, say() (+5 more)

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
Cohesion: 0.14
Nodes (15): command, keepListening(), log, RETRY_MS, USAGE, emit(), onShutdown(), log (+7 more)

### Community 38 - "ref_node_fs"
Cohesion: 0.17
Nodes (15): createFileStore(), fileStore, paths, NamedSecretStore, onPath(), pickSecretStore(), paths, createKeychainStore() (+7 more)

### Community 39 - "Desktop TSConfig"
Cohesion: 0.12
Nodes (16): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 40 - "prompts.ts"
Cohesion: 0.15
Nodes (25): CANDIDATE_URLS, findHomeAssistant(), looksLikeHomeAssistant(), mcpServerPresent(), setupHomeAssistant(), tokenWorks(), trim(), confirmOr() (+17 more)

### Community 41 - "services.ts"
Cohesion: 0.11
Nodes (17): BIN, Run, MANAGED_LLM_PORT, call(), AGENT_LABEL, defaultWhich(), firstWhisperModel(), LLM_LABEL (+9 more)

### Community 42 - "Accessory"
Cohesion: 0.17
Nodes (14): Screen, house, settings, talk, Accessory, Room, .id, Bool (+6 more)

### Community 43 - "Parlour TSConfig"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+7 more)

### Community 44 - "Sendable"
Cohesion: 0.11
Nodes (23): Colour, ColourRole, bracken, hearth, lamp, Duotone, Motion, SessionState (+15 more)

### Community 45 - "Nx Workspace Config"
Cohesion: 0.13
Nodes (14): analytics, cache, dependsOn, outputs, defaultBase, cache, $schema, targetDefaults (+6 more)

### Community 46 - "buildAgent"
Cohesion: 0.23
Nodes (13): buildAgent(), LoadedSkills, loadSkills(), parseSkill(), READ_SKILL_TOOL, skillChecks(), skillFiles(), SkillProblem (+5 more)

### Community 47 - "desktop/package.json"
Cohesion: 0.11
Nodes (17): description, react, react-dom, tailwindcss, @types/react, @types/react-dom, typescript, license (+9 more)

### Community 48 - "Reveal"
Cohesion: 0.19
Nodes (12): Connection, checking, connected, failed, untried, .content, Reveal, .body (+4 more)

### Community 49 - "launchd.ts"
Cohesion: 0.11
Nodes (16): ServiceManager, ServiceSpec, ServiceState, createLaunchd(), launch(), loaded(), state(), launchd (+8 more)

### Community 50 - "OnboardingView"
Cohesion: 0.09
Nodes (26): URL, OnboardingView, .body, .connected, .connectionRow, .footer, .header, .isChecking (+18 more)

### Community 51 - "ConnectorAuthProvider"
Cohesion: 0.18
Nodes (3): ConnectorRow, ConnectorAuthProvider, Connector

### Community 52 - "Tool"
Cohesion: 0.12
Nodes (10): Tool, describe(), log, fakeClock(), setUp(), Timer, Timers, TimersOptions (+2 more)

### Community 53 - "AccessoryCard"
Cohesion: 0.33
Nodes (6): AccessoryCard, .body, RoomView, .body, Double, String

### Community 54 - "architecture.mdx"
Cohesion: 0.17
Nodes (10): Assembly, Configuration, secrets and paths, Providers, The action agent, The pipeline, The queue, The session, The task list (+2 more)

### Community 55 - "init.ts"
Cohesion: 0.12
Nodes (26): HomeAssistantAnswers, afterword(), Answers, applyAnswers(), command, Context, init(), offerMigration() (+18 more)

### Community 56 - "Phone Push-to-Talk Page"
Cohesion: 0.20
Nodes (13): chunks, params, play(), send(), start(), status(), stop(), store (+5 more)

### Community 57 - "Build TSConfig"
Cohesion: 0.20
Nodes (9): compilerOptions, declaration, noEmit, outDir, rewriteRelativeImportExtensions, rootDir, exclude, extends (+1 more)

### Community 58 - "css.ts"
Cohesion: 0.17
Nodes (20): colours(), emitCss(), invariants(), kebab(), Scheme, Duotone, hairline, leading (+12 more)

### Community 60 - "clients.mdx"
Cohesion: 0.18
Nodes (9): Events, A phone, A satellite, Automations and scripts, Bonjour, Custom hardware, Home Assistant satellites, The iPhone app (+1 more)

### Community 61 - "site/project.json"
Cohesion: 0.11
Nodes (20): command, options, outputs, command, continuous, options, command, options (+12 more)

### Community 62 - "connectors/index.ts"
Cohesion: 0.25
Nodes (9): connectorsIntegration, ConnectorsOptions, connectorTools(), createConnectorsIntegration(), log, memory, paths, secrets (+1 more)

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
Cohesion: 0.14
Nodes (15): DecisionAnswer, DecisionInstructions, DecisionQuestion, DecisionResult, DecisionState, createLayaMlx(), defaultWorkerPath(), flattenInstructions() (+7 more)

### Community 68 - "Tauri Capabilities"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 69 - "ref_node_url"
Cohesion: 0.40
Nodes (5): ref_node_url, crateName(), root, TARGETS, usage()

### Community 70 - "triage.ts"
Cohesion: 0.26
Nodes (11): extract(), fastTriage(), log, parseTriage(), recent(), simple(), triage, TriageContext (+3 more)

### Community 71 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, tailwindcss, @tailwindcss/vite, @tauri-apps/cli, tw-animate-css, @types/react, @types/react-dom, typescript (+2 more)

### Community 72 - "HomeKitStore"
Cohesion: 0.22
Nodes (9): Any, HomeKitStore, String, .room, HMAccessory, HMCharacteristic, HMHomeManager, HMHomeManagerAuthorizationStatus (+1 more)

### Community 76 - "Design System: Parlour"
Cohesion: 0.08
Nodes (25): Code blocks, Colors, Components, Controls, Departures from the brief, Design System: Parlour, Do:, Do's and Don'ts (+17 more)

### Community 77 - "parlour"
Cohesion: 0.09
Nodes (24): ./config.js, ./connectors.js, ./doctor.js, ./init.js, ./mcp.js, ./models.js, COMMANDS, help() (+16 more)

### Community 79 - "(home)/page.tsx"
Cohesion: 0.20
Nodes (9): asked, ConfigFile(), DesktopSettings(), line, PhoneHouse(), PhoneTalk(), PrivacyDiagram(), RoomScene() (+1 more)

### Community 80 - "topology.tsx"
Cohesion: 0.20
Nodes (4): Icon, rooms, stroke, Topology()

### Community 81 - "Data"
Cohesion: 0.16
Nodes (12): Data, Recorder, .permission, SharedAudioSession, Double, Sendable, T, WAV (+4 more)

### Community 82 - "core/plugins.ts"
Cohesion: 0.15
Nodes (17): inspect(), definePlugin(), isPlainObject(), isPlugin(), LoadedPlugins, loadPlugins(), mergeIntegrations(), Plugin (+9 more)

### Community 83 - "ParlourTokens"
Cohesion: 0.12
Nodes (21): Animation, StateMark, .body, .mark, .pulse, .shouldBreathe, .body, Bool (+13 more)

### Community 84 - "PairingScanner"
Cohesion: 0.14
Nodes (16): Coordinator, PairingScanner, .body, .caption, .unavailable, ScannerView, Bool, String (+8 more)

### Community 85 - "ios/project.json"
Cohesion: 0.10
Nodes (22): command, dependsOn, options, command, options, outputs, name, cwd (+14 more)

### Community 86 - "ports.ts"
Cohesion: 0.11
Nodes (19): log, NO_CLOUD, OUT_OF_TIME, FakeChatModel, TurnResult, ChatModel, ESCALATE_TOOL, CONTEXT_TTL_MS (+11 more)

### Community 87 - "RequestQueue"
Cohesion: 0.16
Nodes (7): Job, Lane, QueueOptions, RequestQueue, SupersededError, deferred(), harness()

### Community 88 - "desktop.mdx"
Cohesion: 0.18
Nodes (9): Building it, Deliberate choices, How it fits together, Running the app against a checkout, Setting up, Signing, The tabs, Two things to know (+1 more)

### Community 89 - "targets"
Cohesion: 0.11
Nodes (21): command, options, command, options, command, options, name, cwd (+13 more)

### Community 90 - "parlour/src/index.ts"
Cohesion: 0.12
Nodes (19): ProviderSlice, AgentEvent, enableEvents(), PluginContext, importProvider(), isDefinition(), keyOf(), NOT_FOUND (+11 more)

### Community 91 - "Check"
Cohesion: 0.10
Nodes (22): Check, stripThinking(), AiSdkModelOptions, AiSdkOptions, aiSdkProvider, AiSdkSchema, asArgs(), createAiSdk() (+14 more)

### Community 92 - "SwiftUI"
Cohesion: 0.14
Nodes (10): App, ParlourApp, .body, RootView, .body, HouseView, AVFoundation, Scene (+2 more)

### Community 93 - "LocalIntelligenceState"
Cohesion: 0.12
Nodes (16): AnyObject, LocalIntelligence, .session, LocalIntelligenceState, .explanation, failed, modelNotReady, notEnabled (+8 more)

### Community 94 - "ParlourClient"
Cohesion: 0.16
Nodes (17): Answer, ClientError, .errorDescription, noServer, server, unauthorised, Health, ParlourClient (+9 more)

### Community 95 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 96 - "icons.ts"
Cohesion: 0.16
Nodes (15): emitAppIconContents(), emitFaviconSvg(), IconShape, iconSvg(), LAMP, MARK, shapes, chunk() (+7 more)

### Community 97 - "setup.ts"
Cohesion: 0.18
Nodes (13): HouseOptions, InitOptions, DEFAULT_WAKE_WORDS, DEFAULT_WHISPER_MODEL, Reporter, formulaeFor(), HOMEBREW_FORMULAE, keepWarm() (+5 more)

### Community 98 - "defineTool"
Cohesion: 0.36
Nodes (5): SearchProvider, SearchResult, defineTool(), searchTool(), FakeSearchProvider

### Community 99 - "TalkView"
Cohesion: 0.19
Nodes (9): Speaker, Bool, String, Void, TalkView, .talkButton, .viaLabel, AVAudioPlayer (+1 more)

### Community 100 - "site/package.json"
Cohesion: 0.09
Nodes (27): GET, docs, source, description, react, react-dom, tailwindcss, @types/node (+19 more)

### Community 101 - "service.ts"
Cohesion: 0.18
Nodes (14): service(), agentServiceInstalled(), command, describeState(), everyService(), isExecutable(), parlourBin(), print() (+6 more)

### Community 102 - "Text"
Cohesion: 0.11
Nodes (33): Heading, .body, Panel, .body, Rule, .body, Content, String (+25 more)

### Community 103 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, app, build, build:locked, build:ui, dev, icons, typecheck

### Community 104 - "ServerDiscovery"
Cohesion: 0.20
Nodes (11): FoundServer, .id, ServerDiscovery, String, URL, Identifiable, NWBrowser, NWConnection (+3 more)

### Community 105 - "Components.swift"
Cohesion: 0.21
Nodes (9): ButtonStyle, .hearth, HearthButtonStyle, StateRow, Ramp, CGFloat, .header, Configuration (+1 more)

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

### Community 111 - "setup.rs"
Cohesion: 0.26
Nodes (16): emit(), Event, inspect(), install_cli(), output(), Readiness, AppHandle, Option (+8 more)

### Community 112 - "config.json"
Cohesion: 0.14
Nodes (13): access, baseBranch, changelog, commit, fixed, format, ignore, linked (+5 more)

### Community 113 - "design/package.json"
Cohesion: 0.13
Nodes (14): description, devDependencies, @resvg/resvg-js, @types/node, typescript, exports, @types/node, typescript (+6 more)

### Community 114 - "RecorderError"
Cohesion: 0.29
Nodes (7): RecorderError, denied, .errorDescription, noInput, tooShort, String, LocalizedError

### Community 115 - "@parlour/design"
Cohesion: 0.17
Nodes (11): Changing something, Ink on a limewashed wall, with one lit thing, The icons, The states are part of the design system, Adding a surface, Adding a token, Icons, @parlour/design (+3 more)

### Community 116 - "macos-say.ts"
Cohesion: 0.14
Nodes (19): isNoise(), sentences(), speakable(), tidy(), createKokoro(), kokoro, KokoroOptions, kokoroSchema (+11 more)

### Community 117 - "ffmpeg.ts"
Cohesion: 0.19
Nodes (12): audioInputs(), createFfmpeg(), execFileAsync, ffmpegDefinition, FfmpegOptions, FfmpegSchema, findInput(), Microphone (+4 more)

### Community 118 - "Foundation"
Cohesion: 0.15
Nodes (9): AnswerTests, CoreGraphics, dnssd, Foundation, HomeKit, Network, Observation, Parlour (+1 more)

### Community 119 - "vite.config.ts"
Cohesion: 0.50
Nodes (3): @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 120 - "tuning.mdx"
Cohesion: 0.15
Nodes (12): Audio, Decision model (optional), Logging, Search, Speech to text, The models, The pipeline, The voice (+4 more)

### Community 121 - "Product"
Cohesion: 0.17
Nodes (11): Accessibility & Inclusion, Brand Commitments, Capabilities and Constraints, Evidence on Hand, Operating Context, Platform, Positioning, Product (+3 more)

### Community 122 - "pair.ts"
Cohesion: 0.24
Nodes (10): command, PAIR_SCHEME, Pairing, pairingLink(), qrModules(), reachableHost(), svgCode(), terminalCode() (+2 more)

### Community 123 - "skills.mdx"
Cohesion: 0.50
Nodes (3): MCP servers, Plugins, Skills

### Community 124 - "process.ts"
Cohesion: 0.12
Nodes (24): execFileAsync, findOnPath(), killOnExit(), orphans(), parseOrphans(), run(), RunOptions, SHUTDOWN_SIGNALS (+16 more)

### Community 125 - "AppSettings"
Cohesion: 0.11
Nodes (15): AppSettings, .onboarded, .preferOnDevice, .room, .serverURL, .token, Key, Bool (+7 more)

### Community 126 - "[[...slug]]/page.tsx"
Cohesion: 0.27
Nodes (6): Page(), Props, getMDXComponents(), useMDXComponents, fumadocs-ui, ref_mdx

### Community 128 - "PairingLink"
Cohesion: 0.33
Nodes (4): PairingLink, String, URL, PairingTests

### Community 129 - "Parlour for iOS"
Cohesion: 0.22
Nodes (8): How it finds the server, Pairing, Parlour for iOS, Running it, The design system, The first run, The model on the phone, What it asks for, and why

### Community 130 - "docs/layout.tsx"
Cohesion: 0.33
Nodes (4): Layout(), Wordmark(), baseOptions(), next

### Community 131 - "registerProvider"
Cohesion: 0.10
Nodes (20): A secret of your own, An integration, How a name becomes a provider, The definition, Trying it against a checkout, Worked example: Piper as a voice, defineProvider(), ProviderContext (+12 more)

### Community 132 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, postcss, tailwindcss, @tailwindcss/postcss, @types/mdx, @types/node, @types/react, @types/react-dom (+1 more)

### Community 133 - "laya-worker.py"
Cohesion: 0.25
Nodes (8): json, os, main(), normalize_answers(), Warm Laya-MLX worker for Parlour. Reads one JSON request per stdin line, writes…, Map Laya's answer objects onto Parlour's DecisionAnswer shape., sys, traceback

### Community 135 - ".read32"
Cohesion: 0.39
Nodes (4): Int, UInt32, WAVTests, UInt16

### Community 136 - "app/layout.tsx"
Cohesion: 0.25
Nodes (6): apps_site_app_globals, alegreya, geist, metadata, viewport, @vercel/analytics

### Community 137 - "ios.mdx"
Cohesion: 0.25
Nodes (7): Building it, Finding the server, HomeKit, Pairing with your Mac, The first run, The model on the phone, What it asks for

### Community 138 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, prebuild, pretypecheck, start, typecheck

### Community 139 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, emit, emit:check, icons, lint, test, typecheck

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
Cohesion: 0.33
Nodes (7): main(), root, stale(), targets, double(), emitSwift(), parse()

### Community 149 - "wake-word.mdx"
Cohesion: 0.50
Nodes (3): Install it, Train it, Tune it

## Ambiguous Edges - Review These
- `Repository layout (packages/parlour, apps/desktop, apps/site, docs)` → `CLAUDE.md graphify rules`  [AMBIGUOUS]
  CLAUDE.md · relation: conceptually_related_to
- `Parlour Desktop App Icon` → `Site Favicon (apps/site/app/icon.svg)`  [AMBIGUOUS]
  apps/desktop/src-tauri/icon.png · relation: semantically_similar_to

## Knowledge Gaps
- **795 isolated node(s):** `$schema`, `baseBranch`, `access`, `ignore`, `fixed` (+790 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1105 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Repository layout (packages/parlour, apps/desktop, apps/site, docs)` and `CLAUDE.md graphify rules`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Parlour Desktop App Icon` and `Site Favicon (apps/site/app/icon.svg)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `lucide-react` connect `SettingsPanel.tsx` to `Onboarding.tsx`, `StatusPanel.tsx`, `cn`, `desktop/package.json`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `@tailwindcss/vite` connect `vite.config.ts` to `desktop/package.json`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `@vitejs/plugin-react` connect `vite.config.ts` to `desktop/package.json`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **What connects `$schema`, `baseBranch`, `access` to the rest of the system?**
  _795 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Contributing guide` be split into smaller, more focused modules?**
  _Cohesion score 0.05974025974025974 - nodes in this community are weakly interconnected._