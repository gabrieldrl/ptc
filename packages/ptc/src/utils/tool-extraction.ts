import * as z from 'zod';
import type { ToolInfo, ToolLike, ToolWithOutputSchema, PTCTool } from '../types.js';

/**
 * Extract tool information from a PTC tool (either ToolLike or ToolWithOutputSchema)
 */
export function extractToolInfo(ptcTool: PTCTool): ToolInfo {
  // Check if it's a ToolWithOutputSchema wrapper
  let tool: ToolLike;
  let outputSchema: z.ZodTypeAny | undefined;
  
  if ('tool' in ptcTool) {
    // It's a ToolWithOutputSchema wrapper
    const toolWithSchema = ptcTool as ToolWithOutputSchema;
    tool = toolWithSchema.tool;
    // Use outputSchema from wrapper if provided, otherwise check the tool itself
    outputSchema = toolWithSchema.outputSchema;
    if (!outputSchema && 'outputSchema' in tool && tool.outputSchema) {
      outputSchema = tool.outputSchema as z.ZodTypeAny;
    }
  } else {
    // It's a direct ToolLike
    tool = ptcTool as ToolLike;
    // Check if the tool itself has an outputSchema property
    if ('outputSchema' in tool && tool.outputSchema) {
      outputSchema = tool.outputSchema as z.ZodTypeAny;
    }
  }
  
  const name = tool.name;
  const description = tool.description || '';
  
  // Extract Zod schema from tool
  // LangChain tools have a schema property that is typically a Zod schema
  let inputSchema: z.ZodTypeAny;
  
  if ('schema' in tool && tool.schema) {
    inputSchema = tool.schema as z.ZodTypeAny;
  } else if ('argsSchema' in tool && tool.argsSchema) {
    inputSchema = tool.argsSchema as z.ZodTypeAny;
  } else {
    // Fallback to empty object schema
    inputSchema = z.object({});
  }
  
  return {
    name,
    description,
    inputSchema,
    outputSchema,
  };
}

