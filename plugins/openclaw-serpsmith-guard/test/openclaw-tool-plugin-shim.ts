const metadataSymbol = Symbol.for("openclaw.plugin-sdk.tool-plugin.metadata");

type ToolDefinition = {
  name: string;
  label?: string;
  description: string;
  parameters: unknown;
  optional?: boolean;
  execute?: (...args: unknown[]) => unknown;
};

type PluginDefinition = {
  id: string;
  name: string;
  description: string;
  configSchema: unknown;
  tools: (tool: (definition: ToolDefinition) => ToolDefinition) => ToolDefinition[];
};

export function defineToolPlugin(definition: PluginDefinition): object {
  const tools = definition.tools((tool) => tool);
  const entry = {
    id: definition.id,
    name: definition.name,
    description: definition.description,
  };
  Object.defineProperty(entry, metadataSymbol, {
    value: {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      tools: tools.map((tool) => ({ name: tool.name })),
    },
    enumerable: false,
  });
  return entry;
}

export function getToolPluginMetadata(entry: unknown):
  | { tools: Array<{ name: string }> }
  | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  return (entry as Record<symbol, { tools: Array<{ name: string }> }>)[metadataSymbol];
}
