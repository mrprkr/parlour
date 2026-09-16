import type { JsonSchema, ToolSpec } from "./types.ts";

export interface Tool extends ToolSpec {
  run(args: Record<string, unknown>): Promise<string>;
}

export function defineTool(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  run: (args: Record<string, unknown>) => Promise<string>,
): Tool {
  return { name, description, inputSchema, run };
}

export class ToolRegistry {
  readonly #tools = new Map<string, Tool>();

  add(...tools: Tool[]): this {
    for (const tool of tools) this.#tools.set(tool.name, tool);
    return this;
  }

  specs(): ToolSpec[] {
    return [...this.#tools.values()].map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
  }

  async run(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.#tools.get(name);
    if (!tool) return `No tool called ${name}. Available: ${[...this.#tools.keys()].join(", ")}.`;
    try {
      return await tool.run(args);
    } catch (error) {
      // Tool failures are information for the model, not crashes for the loop.
      return `Tool ${name} failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
