/**
 * The public face of the package: what a third-party provider or integration
 * imports to describe itself, and what a program embedding Parlour needs to
 * read config and reach the registry. Everything else is internal and may
 * move between releases.
 */
export type { Config } from "./core/config.ts";
export {
  ConfigSchema,
  loadConfig,
  ProviderSlice,
  parseConfig,
  updateConfig,
  writeConfig,
} from "./core/config.ts";
export type { AgentEvent } from "./core/events.ts";
export { emit, enableEvents } from "./core/events.ts";
export type { Logger } from "./core/logger.ts";
export { logger } from "./core/logger.ts";
export type { Paths } from "./core/paths.ts";
export { resolvePaths } from "./core/paths.ts";
export type { Plugin, PluginContext } from "./core/plugins.ts";
export { definePlugin, PluginError } from "./core/plugins.ts";
export type {
  AudioSink,
  AudioSource,
  ChatModel,
  Check,
  DecisionAnswer,
  DecisionInstructions,
  DecisionModel,
  DecisionQuestion,
  DecisionResult,
  DecisionState,
  Diagnosable,
  Integration,
  SearchProvider,
  SearchResult,
  SecretStore,
  ServiceManager,
  ServiceSpec,
  ServiceState,
  SpeechToText,
  TextToSpeech,
  WakeWordDetector,
  WakeWordEngine,
} from "./core/ports.ts";
export type {
  ProviderContext,
  ProviderContextFactory,
  ProviderDefinition,
  ProviderKind,
} from "./core/providers.ts";
export {
  defineProvider,
  ProviderKindError,
  registeredProviders,
  registerProvider,
  resolveProvider,
  UnknownProviderError,
} from "./core/providers.ts";
export type { Tool } from "./core/registry.ts";
export { defineTool, ToolRegistry } from "./core/registry.ts";
export type { Secrets } from "./core/secrets.ts";
export { loadSecrets } from "./core/secrets.ts";
export type { Skill } from "./core/skills.ts";
export { loadSkills, parseSkill, READ_SKILL_TOOL } from "./core/skills.ts";
export type { Completion, JsonSchema, Message, ToolCall, ToolSpec } from "./core/types.ts";
