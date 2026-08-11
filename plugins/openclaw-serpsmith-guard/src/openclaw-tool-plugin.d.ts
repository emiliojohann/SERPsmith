declare module "openclaw/plugin-sdk/tool-plugin" {
  import type { Static, TSchema } from "typebox";

  type ToolPluginExecutionContext = {
    signal?: AbortSignal;
    toolCallId: string;
    onUpdate?: unknown;
    api: unknown;
  };

  type ToolDefinition<TConfig, TParamsSchema extends TSchema> = {
    name: string;
    label?: string;
    description: string;
    parameters: TParamsSchema;
    optional?: boolean;
    execute: (
      params: Static<TParamsSchema>,
      config: TConfig,
      context: ToolPluginExecutionContext,
    ) => unknown;
  };

  type DefinedTool = {
    name: string;
    label: string;
    description: string;
    parameters: TSchema;
    optional: boolean;
    execute?: (
      params: unknown,
      config: unknown,
      context: ToolPluginExecutionContext,
    ) => unknown;
  };

  type ToolPluginMetadata = {
    tools: Array<{ name: string }>;
  };

  export function defineToolPlugin<TConfigSchema extends TSchema>(definition: {
    id: string;
    name: string;
    description: string;
    configSchema: TConfigSchema;
    tools: (
      tool: <TParamsSchema extends TSchema>(
        definition: ToolDefinition<Static<TConfigSchema>, TParamsSchema>,
      ) => DefinedTool,
    ) => readonly DefinedTool[];
  }): unknown;

  export function getToolPluginMetadata(entry: unknown): ToolPluginMetadata | undefined;
}
