export interface JsonSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * One neutral message shape for both back ends. OpenAI's is the wider of the
 * two, so it is the one we keep and the Anthropic client converts from.
 */
export type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface Completion {
  text: string;
  toolCalls: ToolCall[];
}

export interface ChatModel {
  readonly label: string;
  complete(messages: Message[], tools: ToolSpec[]): Promise<Completion>;
}
