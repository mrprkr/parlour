/**
 * The agent used to live inside a Home Assistant configuration as
 * `agent.config.json`, with the house baked into the top level. `parlour init`
 * finds that file and offers to rewrite it into the provider shape. Nothing
 * else in the package knows the old keys.
 */

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isLegacyConfig(raw: unknown): boolean {
  if (!isObject(raw)) return false;
  if ("homeAssistant" in raw || "mcpServers" in raw || "connectorsFile" in raw) return true;
  return isObject(raw.tts) && typeof raw.tts.engine === "string";
}

/** Each slice gains the provider it always had, since there was no choice before. */
function withProvider(slice: unknown, provider: string): Raw {
  const copy = isObject(slice) ? { ...slice } : {};
  // Provider first, so the migrated file reads the way a fresh one does.
  return typeof copy.provider === "string" ? copy : { provider, ...copy };
}

export function migrateLegacyConfig(raw: Raw): Raw {
  const out: Raw = {};
  const integrations: Raw = isObject(raw.integrations) ? { ...raw.integrations } : {};
  const house: Raw = isObject(integrations["home-assistant"]) ? { ...integrations["home-assistant"] } : {};

  for (const [key, value] of Object.entries(raw)) {
    switch (key) {
      case "homeAssistant": {
        if (!isObject(value)) break;
        if (typeof value.baseUrl === "string") house.url = value.baseUrl;
        if (typeof value.useMcp === "boolean") house.mcp = value.useMcp;
        break;
      }
      case "muteEntity":
        if (typeof value === "string") house.muteEntity = value;
        break;
      case "mcpServers":
        if (isObject(value))
          integrations.mcp = { ...(isObject(integrations.mcp) ? integrations.mcp : {}), servers: value };
        break;
      case "connectorsFile":
      case "integrations":
        // Connectors now live at a fixed path; integrations are rebuilt below.
        break;
      case "search": {
        const search = withProvider(value, "searxng");
        if (typeof search.searxngUrl === "string") {
          search.url = search.searxngUrl;
          delete search.searxngUrl;
        }
        out.search = search;
        break;
      }
      case "tts": {
        const tts = isObject(value) ? { ...value } : {};
        // "say" was the only other engine, and it is the macOS one.
        const engine = tts.engine === "say" ? "macos-say" : "kokoro";
        delete tts.engine;
        out.tts = withProvider(tts, engine);
        break;
      }
      case "wake": {
        const wake = withProvider(value, "openwakeword");
        // Models are found under the cache directory now, not next to the code.
        delete wake.modelDir;
        out.wake = wake;
        break;
      }
      case "stt":
        out.stt = withProvider(value, "whisper-cpp");
        break;
      case "llm": {
        const llm = isObject(value) ? { ...value } : {};
        if ("local" in llm) llm.local = withProvider(llm.local, "openai-compatible");
        if ("cloud" in llm) llm.cloud = withProvider(llm.cloud, "anthropic");
        out.llm = llm;
        break;
      }
      default:
        out[key] = value;
    }
  }

  // Every legacy config had the house in it, so the integration is always
  // present even when nothing was set on it. The migrated house goes last so
  // that a block already under `integrations` cannot undo the rename.
  out.integrations = { ...integrations, "home-assistant": house };
  return out;
}

export function migrateLegacyEnv(text: string): string {
  return text.replace(/^AGENT_TOKEN=/gm, "PARLOUR_TOKEN=");
}
