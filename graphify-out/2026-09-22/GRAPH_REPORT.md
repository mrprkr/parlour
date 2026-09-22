# Graph Report - parlour  (2026-09-19)

## Corpus Check
- 186 files · ~102,218 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 5, .css 3, .plist 1)

## Summary
- 1574 nodes · 3850 edges · 79 communities (71 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 129 edges (avg confidence: 0.85)
- Token cost: 337,024 input · 51,497 output

## Community Hubs (Navigation)
- Tauri Desktop Backend
- Repo Docs & CI
- Process & Audio Tooling
- Provider Registry & Search
- Desktop Settings & Detection
- Turn Loop & Router
- CLI Test Fixtures
- Connector Store & CLI
- Parlour Package Manifest
- Desktop Bridge & Panels
- CLI Argument Parsing
- Testing Fakes & Agent Tests
- Desktop UI Primitives
- Init & Migration
- Session & Events
- LLM Providers & Logger
- Model Fetching & Setup
- MCP & Home Assistant
- Desktop App Shell
- Doctor & Service CLI
- Desktop Settings Panel
- Core Ports & Agent Build
- Speaker & TTS Fallback
- Desktop Status Panel
- Tauri Config
- HTTP Server Routes
- openWakeWord Provider
- Desktop Nx Project
- Audio Frames & Endpointer
- Parlour Nx Project
- Agent & Tool Registry
- launchd Service Provider
- shadcn Components Config
- Biome Config
- Architecture Design Docs
- Provider Extension Docs
- Root Package Manifest
- Start & Satellite
- Secret Store Providers
- Desktop TSConfig
- Clients & Server Docs
- Service Specs & CLI Tests
- Server Test Harness
- Parlour TSConfig
- Desktop Integration Docs
- Nx Workspace Config
- Integration & Tool Ports
- Desktop Package Manifest
- VoiceSession State Machine
- Service Manager Port
- Home Assistant Docs
- Connector OAuth Provider
- Timers
- Desktop UI Dependencies
- Desktop Dev Dependencies
- Secrets File Parsing
- Phone Push-to-Talk Page
- Build TSConfig
- Connectors Panel
- Site Vercel Config
- Local-First LLM Routing Docs
- Site Nx Project
- CLI Output Reporters
- Bonjour Discovery
- Desktop Scripts
- Desktop App Icon
- Documentation Index
- Wake Word Training Docs
- Tauri Capabilities
- Version Bump Script
- Fake Secret Store
- Vite Config
- Site Favicon
- Vite Env Types
- parlour-dev Script
- Icon Generation Note
- Tauri Plugin Policy
- Desktop Cargo Crate

## God Nodes (most connected - your core abstractions)
1. `Logger` - 45 edges
2. `Check` - 31 edges
3. `init()` - 29 edges
4. `connectorStore` - 26 edges
5. `Completion` - 24 edges
6. `defineProvider()` - 22 edges
7. `registerProvider()` - 22 edges
8. `Onboarding()` - 21 edges
9. `zod` - 21 edges
10. `Paths` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Three pillars: voice stays home, swap any part, one Mac every room` --semantically_similar_to--> `Cloud escalation: text only, decided per question by the local model`  [INFERRED] [semantically similar]
  apps/site/index.html → README.md
- `'Up and running in ten minutes' section` --semantically_similar_to--> `Getting started (npm install -g parlour, init, text, start)`  [INFERRED] [semantically similar]
  apps/site/index.html → README.md
- `Transcript (#heard, #reply, #status)` --semantically_similar_to--> `--events NDJSON stream (ready, state, heard, reply, muted, error)`  [INFERRED] [semantically similar]
  packages/parlour/src/server/web/index.html → docs/architecture.md
- `buildAgent assembly` --references--> `buildAgent()`  [EXTRACTED]
  docs/architecture.md → packages/parlour/src/core/agent.ts
- `defineProvider (identity function for inference)` --references--> `defineProvider()`  [EXTRACTED]
  docs/providers.md → packages/parlour/src/core/providers.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Release process: version:set, hand-written CHANGELOG, vX.Y.Z tag, npm trusted publish, dmg on GitHub release** — contributing_releasing, changelog_changelog, _github_workflows_release_release_workflow, _github_workflows_release_publish_job, _github_workflows_release_tag_version_check, _github_workflows_release_trusted_publishing, _github_workflows_release_app_job [EXTRACTED 1.00]
- **Doctor-first principle: silent failures surface through doctor() rather than tests** — readme_parlour_doctor, contributing_doctor_over_unit_tests, _github_pull_request_template_pr_checklist, _github_issue_template_bug_bug_report, readme_getting_started, apps_site_index_pillars_section [INFERRED 0.85]
- **Local-first voice pipeline: wake word, STT, local model, cloud escalation, TTS** — readme_voice_pipeline, readme_openwakeword, readme_whisper_cpp, readme_lm_studio, readme_cloud_escalation, readme_kokoro, readme_home_assistant_mcp, apps_site_index_speech_loop_section [EXTRACTED 1.00]
- **The local voice pipeline: wake, capture, STT, model, escalation, speech** — docs_architecture_openwakeword, docs_architecture_ffmpeg_avfoundation, docs_architecture_whisper_cpp, docs_architecture_lm_studio_local_model, docs_architecture_claude_escalation, docs_architecture_kokoro [EXTRACTED 1.00]
- **Every kind of Parlour client sharing one server, one token and per-client sessions** — docs_clients_satellite, docs_clients_phone_page, docs_clients_listen_websocket, docs_clients_ask_endpoint, docs_home_assistant_openai_conversation, docs_clients_parlour_token, docs_architecture_per_client_session [EXTRACTED 1.00]
- **The provider extension mechanism: definition, context, resolution, config slice, fakes** — docs_providers_defineprovider, docs_providers_providerdefinition, docs_providers_providercontext, docs_providers_resolveprovider, docs_architecture_provider_registry, docs_architecture_config_schema, docs_providers_testing_fakes [EXTRACTED 1.00]

## Communities (79 total, 8 thin omitted)

### Community 0 - "Tauri Desktop Backend"
Cohesion: 0.07
Nodes (55): AppState, audio_devices(), CliOutput, get_settings(), host_name(), install_cli(), logs(), main() (+47 more)

### Community 1 - "Repo Docs & CI"
Cohesion: 0.06
Nodes (63): Dependabot configuration, Bug report issue template, Feature or provider request template, Pull request template and merge checklist, CI check job (typecheck, lint, test, build, cargo check), CI workflow, Tauri generate_context! ordering constraint, Build the app and attach dmg to release job (+55 more)

### Community 2 - "Process & Audio Tooling"
Cohesion: 0.06
Nodes (44): execFileAsync, findOnPath(), killOnExit(), orphans(), parseOrphans(), run(), RunOptions, SHUTDOWN_SIGNALS (+36 more)

### Community 3 - "Provider Registry & Search"
Cohesion: 0.06
Nodes (33): Check, SearchResult, importProvider(), isDefinition(), keyOf(), NOT_FOUND, ProviderContext, ProviderDefinition (+25 more)

### Community 4 - "Desktop Settings & Detection"
Cohesion: 0.10
Nodes (36): detect_parlour(), executable(), found(), found_on(), found_on_skips_files_that_cannot_run(), found_on_walks_every_path_entry_in_order(), home(), login_shell() (+28 more)

### Community 5 - "Turn Loop & Router"
Cohesion: 0.11
Nodes (25): log, runTurn(), call(), FakeChatModel, TurnResult, ChatModel, ESCALATE_TOOL, escalateSpec (+17 more)

### Community 6 - "CLI Test Fixtures"
Cohesion: 0.10
Nodes (21): home, listed, pathsWith(), quiet, home, pathsIn(), resolvePaths(), paths (+13 more)

### Community 7 - "Connector Store & CLI"
Cohesion: 0.09
Nodes (27): Paths, SecretStore, addConnector(), ConnectorRow, listConnectors(), reason(), removeConnector(), memory (+19 more)

### Community 8 - "Parlour Package Manifest"
Cohesion: 0.05
Nodes (41): bin, parlour, dependencies, @anthropic-ai/sdk, bonjour-service, kokoro-js, @modelcontextprotocol/sdk, onnxruntime-node (+33 more)

### Community 9 - "Desktop Bridge & Panels"
Cohesion: 0.11
Nodes (37): AgentState, audioDevices(), CliOutput, Connector, deviceValue(), getNetwork(), getSettings(), hostName() (+29 more)

### Community 10 - "CLI Argument Parsing"
Cohesion: 0.10
Nodes (31): CliContext, Command, GLOBAL_OPTIONS, OptionSpec, parseCli(), Parsed, parseGlobals(), readStdin() (+23 more)

### Community 11 - "Testing Fakes & Agent Tests"
Cohesion: 0.09
Nodes (19): fakeConfig(), made, paths, registerFakes(), say(), withCloud(), clearProviders(), defineTool() (+11 more)

### Community 12 - "Desktop UI Primitives"
Cohesion: 0.11
Nodes (19): Alert(), AlertDescription(), alertVariants, Button(), buttonVariants, Card(), CardContent(), CardHeader() (+11 more)

### Community 13 - "Init & Migration"
Cohesion: 0.14
Nodes (28): afterword(), audioInputs(), command, confirmOr(), init(), keepOrAsk(), offerMigration(), Raw (+20 more)

### Community 14 - "Session & Events"
Cohesion: 0.11
Nodes (11): AgentEvent, emit(), enableEvents(), WakeWordDetector, Answer, LocalVoice, log, RecordingSink (+3 more)

### Community 15 - "LLM Providers & Logger"
Cohesion: 0.10
Nodes (22): Level, Logger, order, stamp(), write(), AnthropicOptions, anthropicProvider, AnthropicSchema (+14 more)

### Community 16 - "Model Fetching & Setup"
Cohesion: 0.11
Nodes (20): InitOptions, command, DEFAULT_WAKE_WORDS, DEFAULT_WHISPER_MODEL, fetchFile(), fetchModels(), FetchModelsOptions, NotFetchable (+12 more)

### Community 17 - "MCP & Home Assistant"
Cohesion: 0.11
Nodes (18): manifest, packageFile, VERSION, createHomeAssistant(), homeAssistant, childEnvironment(), createMcpIntegration(), httpTransport() (+10 more)

### Community 18 - "Desktop App Shell"
Cohesion: 0.13
Nodes (22): App(), power(), DOT, TabName, TABS, tail(), UNKNOWN, Tabs() (+14 more)

### Community 19 - "Doctor & Service CLI"
Cohesion: 0.15
Nodes (21): command, diagnose(), forgottenConnectors(), reachable(), satellite(), server(), service(), USAGE (+13 more)

### Community 20 - "Desktop Settings Panel"
Cohesion: 0.11
Nodes (14): Checkbox(), Select(), SelectContent(), SelectItem(), SelectTrigger(), SelectValue(), AgentConfig, DeviceOption (+6 more)

### Community 21 - "Core Ports & Agent Build"
Cohesion: 0.15
Nodes (10): BuildOptions, log, AudioSource, Diagnosable, SearchProvider, SpeechToText, WakeWordEngine, ProviderContextFactory (+2 more)

### Community 22 - "Speaker & TTS Fallback"
Cohesion: 0.14
Nodes (7): AudioSink, TextToSpeech, deferred(), FallbackTextToSpeech, Speaker, echoTts, silentLog

### Community 23 - "Desktop Status Panel"
Cohesion: 0.13
Nodes (16): Badge(), badgeVariants, Check, runDoctor(), Status, cn(), Mark(), Step() (+8 more)

### Community 24 - "Tauri Config"
Cohesion: 0.09
Nodes (21): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+13 more)

### Community 25 - "HTTP Server Routes"
Cohesion: 0.17
Nodes (20): allowCors(), API_ROUTES, ask(), AskBody, authorised(), completions(), CompletionsBody, contentType() (+12 more)

### Community 26 - "openWakeWord Provider"
Cohesion: 0.13
Nodes (10): createOpenWakeWord(), OpenWakeWord, openWakeWordDefinition, OpenWakeWordOptions, OpenWakeWordSchema, run(), Sessions, SHARED_MODELS (+2 more)

### Community 27 - "Desktop Nx Project"
Cohesion: 0.12
Nodes (19): command, options, outputs, command, options, command, options, name (+11 more)

### Community 28 - "Audio Frames & Endpointer"
Cohesion: 0.15
Nodes (10): decodeToWav(), FRAME_MS, FRAME_SAMPLES, rms(), toWav(), wavToFrames(), Endpointer, EndpointerOptions (+2 more)

### Community 29 - "Parlour Nx Project"
Cohesion: 0.12
Nodes (18): command, options, command, options, name, cwd, projectType, $schema (+10 more)

### Community 30 - "Agent & Tool Registry"
Cohesion: 0.15
Nodes (8): Agent, buildAgent(), checksOf(), registryWith(), ToolRegistry, roomContext(), Router, router()

### Community 31 - "launchd Service Provider"
Cohesion: 0.16
Nodes (13): defineProvider(), context, createLaunchd(), launch(), state(), launchd, LaunchdOptions, LaunchdSchema (+5 more)

### Community 32 - "shadcn Components Config"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 33 - "Biome Config"
Cohesion: 0.11
Nodes (17): css, parser, files, includes, formatter, indentStyle, lineWidth, quoteStyle (+9 more)

### Community 34 - "Architecture Design Docs"
Cohesion: 0.17
Nodes (18): buildAgent assembly, config.json Zod schema with defaults for every key, FallbackTextToSpeech, Kokoro 82M ONNX voice, Speaker (TTS + sink + sentence splitting), Timers in core, GET /health (no token), Migration from agent.config.json (+10 more)

### Community 35 - "Provider Extension Docs"
Cohesion: 0.16
Nodes (18): core/builtins.ts as the only core-to-providers import, Paths (PARLOUR_HOME, PARLOUR_CONFIG, caches, logs, XDG on Linux), Ports (core/ports.ts seams), Provider registry keyed by (kind, name), secrets.env (mode 600, env wins), HA_TOKEN long-lived access token, apiKeyEnv pattern: name the variable, not the value, type: module and parlour as peer dependency (+10 more)

### Community 36 - "Root Package Manifest"
Cohesion: 0.11
Nodes (17): devDependencies, @biomejs/biome, nx, engines, node, name, packageManager, private (+9 more)

### Community 37 - "Start & Satellite"
Cohesion: 0.18
Nodes (12): command, log, USAGE, onShutdown(), log, newEndpointer(), parse(), runSatellite() (+4 more)

### Community 38 - "Secret Store Providers"
Cohesion: 0.22
Nodes (11): createFileStore(), fileStore, paths, onPath(), pickSecretStore(), createKeychainStore(), KEYCHAIN_SERVICE, keychainStore (+3 more)

### Community 39 - "Desktop TSConfig"
Cohesion: 0.12
Nodes (16): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 40 - "Clients & Server Docs"
Cohesion: 0.23
Nodes (17): Endpointer, Per-client sessions keyed by client id, Voice session state machine (idle/listening/thinking/speaking), POST /ask for automations, Bonjour advertisement _parlour._tcp, /listen WebSocket (wake mode and push mode), PARLOUR_TOKEN and loopback-only default, Phone push-to-talk page (/ and POST /voice) (+9 more)

### Community 41 - "Service Specs & CLI Tests"
Cohesion: 0.15
Nodes (12): BIN, Run, AGENT_LABEL, defaultWhich(), firstWhisperModel(), leftoverServices(), run, ServiceSpecOptions (+4 more)

### Community 42 - "Server Test Harness"
Cohesion: 0.16
Nodes (10): body(), json(), RequestError, ServerDeps, Raw, say(), serve(), ServeOptions (+2 more)

### Community 43 - "Parlour TSConfig"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+7 more)

### Community 44 - "Desktop Integration Docs"
Cohesion: 0.17
Nodes (15): parlour doctor (concatenated Check[]), ffmpeg on avfoundation capture, App and LaunchAgent are alternatives, not a pair, lib/bridge.ts, the only caller of invoke(), main.rs generic parlour(args, stdin) command, Microphone permission belongs to whatever starts it, Onboarding (find/install parlour, init --porcelain, questions, doctor), bin/parlour-dev for running the CLI from source (+7 more)

### Community 45 - "Nx Workspace Config"
Cohesion: 0.13
Nodes (14): analytics, cache, dependsOn, outputs, defaultBase, cache, $schema, targetDefaults (+6 more)

### Community 46 - "Integration & Tool Ports"
Cohesion: 0.15
Nodes (4): Integration, Tool, FakeIntegration, FakeIntegrationOptions

### Community 47 - "Desktop Package Manifest"
Cohesion: 0.14
Nodes (13): description, typescript, license, name, private, type, version, tailwindcss (+5 more)

### Community 48 - "VoiceSession State Machine"
Cohesion: 0.24
Nodes (3): micMode(), VoiceSession, listen()

### Community 49 - "Service Manager Port"
Cohesion: 0.21
Nodes (4): ServiceManager, ServiceSpec, ServiceState, FakeServiceManager

### Community 50 - "Home Assistant Docs"
Cohesion: 0.21
Nodes (13): --events NDJSON stream (ready, state, heard, reply, muted, error), One server, everything else is a client, The menu bar app (docs/desktop.md), Home Assistant integration (tools, prompt line, mute gate), HA Model Context Protocol Server (/mcp_server/sse), muteEntity gate (fails open), REST escape hatches ha_get_state and ha_call_service, defineTool and short tool names (+5 more)

### Community 52 - "Timers"
Cohesion: 0.27
Nodes (7): describe(), log, fakeClock(), setUp(), Timer, Timers, TimersOptions

### Community 53 - "Desktop UI Dependencies"
Cohesion: 0.20
Nodes (10): dependencies, class-variance-authority, clsx, cn, lucide-react, radix-ui, react, react-dom (+2 more)

### Community 54 - "Desktop Dev Dependencies"
Cohesion: 0.20
Nodes (10): devDependencies, tailwindcss, @tailwindcss/vite, @tauri-apps/cli, tw-animate-css, @types/react, @types/react-dom, typescript (+2 more)

### Community 55 - "Secrets File Parsing"
Cohesion: 0.38
Nodes (8): loadSecrets(), parseEnvFile(), quote(), readSecretsFile(), Secrets, paths, unquote(), writeSecret()

### Community 56 - "Phone Push-to-Talk Page"
Cohesion: 0.31
Nodes (9): chunks, params, play(), send(), start(), status(), stop(), store (+1 more)

### Community 57 - "Build TSConfig"
Cohesion: 0.20
Nodes (9): compilerOptions, declaration, noEmit, outDir, rewriteRelativeImportExtensions, rootDir, exclude, extends (+1 more)

### Community 58 - "Connectors Panel"
Cohesion: 0.33
Nodes (9): connectorAdd(), connectorRemove(), failure(), getConnectors(), parlour(), run(), ConnectorsPanel(), add() (+1 more)

### Community 59 - "Site Vercel Config"
Cohesion: 0.22
Nodes (8): buildCommand, cleanUrls, framework, headers, installCommand, outputDirectory, $schema, trailingSlash

### Community 60 - "Local-First LLM Routing Docs"
Cohesion: 0.33
Nodes (9): ask_the_clever_one escalation tool, Claude with server-side web search as escalation, Each stage chosen to be fast rather than best, LM Studio MLX local model over OpenAI API, Router (local first, cloud escalation), Tool rounds loop (core/loop.ts), whisper.cpp small.en kept warm as a server, Task 6: LLM and search providers, loop and router (+1 more)

### Community 61 - "Site Nx Project"
Cohesion: 0.25
Nodes (7): command, name, projectType, $schema, sourceRoot, targets, lint

### Community 62 - "CLI Output Reporters"
Cohesion: 0.39
Nodes (7): bold(), EventKind, headline(), humanReporter(), porcelainReporter(), red(), yellow()

### Community 63 - "Bonjour Discovery"
Cohesion: 0.29
Nodes (6): advertise(), Advertisement, Found, log, SERVICE_TYPE, bonjour-service

### Community 64 - "Desktop Scripts"
Cohesion: 0.29
Nodes (7): scripts, app, build, build:ui, dev, icons, typecheck

### Community 65 - "Desktop App Icon"
Cohesion: 0.33
Nodes (7): Parlour Desktop App Icon, Three-Bar Audio Waveform Motif, Dark Charcoal and Mint Green Palette, Rounded Square Icon Container, Tauri Desktop App (apps/desktop), Voice / Wake Word Product Identity, Site Favicon (apps/site/app/icon.svg)

### Community 66 - "Documentation Index"
Cohesion: 0.43
Nodes (7): Architecture (docs/architecture.md), Clients (docs/clients.md), Home Assistant (docs/home-assistant.md), Writing a provider (docs/providers.md), Tuning (docs/tuning.md), Your own wake word (docs/wake-word.md), parlour package README

### Community 67 - "Wake Word Training Docs"
Cohesion: 0.38
Nodes (7): openWakeWord (ONNX, in process), satellite.localWake, wake settings (words, threshold, refractoryMs), openWakeWord Colab training notebook, Training a custom openWakeWord model, false_activation_penalty vs threshold, openWakeWord automatic_model_training.ipynb (full notebook)

### Community 68 - "Tauri Capabilities"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 69 - "Version Bump Script"
Cohesion: 0.40
Nodes (5): ref_node_url, crateName(), root, TARGETS, usage()

### Community 71 - "Vite Config"
Cohesion: 0.50
Nodes (3): @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 72 - "Site Favicon"
Cohesion: 0.83
Nodes (4): Parlour Favicon (dark green rounded square, gold dot with translucent ring), Listening Ripple Motif (solid dot radiating a faint concentric ring, evoking a wake-word listener / sound wave), Parlour (product the icon represents; SVG title and aria-label), Parlour Brand Identity (deep green #14312b + warm gold #e9b84a)

## Ambiguous Edges - Review These
- `CLAUDE.md graphify rules` → `Repository layout (packages/parlour, apps/desktop, apps/site, docs)`  [AMBIGUOUS]
  CLAUDE.md · relation: conceptually_related_to
- `Parlour Desktop App Icon` → `Site Favicon (apps/site/app/icon.svg)`  [AMBIGUOUS]
  apps/desktop/src-tauri/icon.png · relation: semantically_similar_to

## Knowledge Gaps
- **372 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+367 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 549 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `CLAUDE.md graphify rules` and `Repository layout (packages/parlour, apps/desktop, apps/site, docs)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Parlour Desktop App Icon` and `Site Favicon (apps/site/app/icon.svg)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `@tailwindcss/vite` connect `Vite Config` to `Desktop Package Manifest`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `@vitejs/plugin-react` connect `Vite Config` to `Desktop Package Manifest`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `vite` connect `Vite Config` to `Desktop Package Manifest`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _372 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Tauri Desktop Backend` be split into smaller, more focused modules?**
  _Cohesion score 0.0679563492063492 - nodes in this community are weakly interconnected._