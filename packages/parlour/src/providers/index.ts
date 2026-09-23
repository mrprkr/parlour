/**
 * Every built-in provider and integration, imported for the registration
 * each performs at load. The order is fixed so the list `parlour doctor` and
 * an UnknownProviderError print is stable from one run to the next.
 *
 * The secret store and the service manager are not here on purpose: they are
 * picked by platform, not by name in config, and their `pick*` functions
 * import what they need.
 */
import "./audio/ffmpeg.ts";
import "./audio/afplay.ts";
import "./wake/openwakeword.ts";
import "./stt/whisper-cpp.ts";
import "./stt/yap.ts";
import "./stt/parakeet-mlx.ts";
import "./tts/kokoro.ts";
import "./tts/macos-say.ts";
import "./llm/openai-compatible.ts";
import "./llm/anthropic.ts";
import "./llm/ai-sdk.ts";
import "./search/searxng.ts";
import "./search/brave.ts";
import "./decision/laya-mlx.ts";
import "../integrations/home-assistant/index.ts";
import "../integrations/mcp/index.ts";
import "../integrations/connectors/index.ts";
