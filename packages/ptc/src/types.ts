import type { z } from 'zod';

// Accept any tool-like object that has name, description, schema, and invoke methods
export interface ToolLike {
  name: string;
  description: string;
  schema?: z.ZodTypeAny;
  argsSchema?: z.ZodTypeAny;
  invoke?: (args: any) => Promise<any>;
  outputSchema?: z.ZodTypeAny; // Optional output schema
  [key: string]: any;
}

// Tool with explicit output schema wrapper (outputSchema is optional)
export interface ToolWithOutputSchema {
  tool: ToolLike;
  outputSchema?: z.ZodTypeAny;
}

export type PTCTool = ToolLike | ToolWithOutputSchema;

export interface PTCOptions {
  e2bApiKey: string;
  tools: PTCTool[];
  /**
   * Maximum number of execution iterations (tool calls) before stopping.
   * Prevents infinite loops from excessive tool calls.
   * @default 100
   */
  maxRecursionLimit?: number;
  /**
   * Timeout in milliseconds for each command execution in the E2B sandbox.
   * If not specified, uses E2B's default timeout.
   * @default undefined (uses E2B default)
   */
  timeoutMs?: number;
}

export interface PTCExecuteOptions {
  code: string;
}

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny; // Optional, inferred from tool return type if possible
}

export interface PTCExecuteResult {
  success: true;
  result: any;
}

export interface PTCExecuteError {
  success: false;
  error: string;
}

export type PTCExecuteResponse = PTCExecuteResult | PTCExecuteError;

export interface ToolRequest {
  tool: string;
  args: any;
  cacheKey: string;
}


