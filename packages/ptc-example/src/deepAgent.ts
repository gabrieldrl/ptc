import { createDeepAgent } from 'deepagents';
import * as z from 'zod';
import { getWeather, getSportsForWeather } from './tools.js';
import { PTCClient, createPTCMiddleware, createExecutorTool, type PTCTool } from '@gdrl/ptc';

// Initialize PTC client with the tools
// You can provide tools directly (outputSchema will be 'any') or wrap them with outputSchema
const tools: PTCTool[] = [
  {
    tool: getWeather,
    outputSchema: z.object({
      weather: z.string().describe('The weather condition (e.g., sunny, rainy, foggy, cloudy, snowy)'),
      city: z.string().describe('The name of the city to get weather for'),
    }),
  },
  {
    tool: getSportsForWeather,
    outputSchema: z.object({
      sports: z.string().describe('Comma-separated list of recommended sports'),
    }),
  },
];

const ptcClient = new PTCClient({
  e2bApiKey: process.env.E2B_API_KEY || '',
  tools,
  maxRecursionLimit: 100,
  timeoutMs: 10000,
});

// Create PTC middleware to inject tool catalog into system prompt
const ptcMiddleware = createPTCMiddleware({ ptcClient });

// Create executor tool that allows the agent to execute TypeScript code
const ptcExecutorTool = createExecutorTool(ptcClient);

/**
 * Deep Agent - A LangGraph deep agent that uses PTC for programmatic tool calling.
 * 
 * Deep agents automatically provide:
 * - Planning capabilities (via write_todos tool)
 * - File system tools (write_file, read_file) for context management
 * - Subagent spawning capabilities for complex subtasks
 * 
 * This agent combines deep agent capabilities with PTC to:
 * - Plan complex multi-step tasks
 * - Use TypeScript code to orchestrate multiple tool calls efficiently
 * - Process and transform data between tool calls
 * - Handle complex control flow (loops, conditionals, functions)
 * - Offload large results to files to manage context window
 * 
 * The agent uses the ptc_executor tool to write and execute TypeScript code
 * that can call the available tools (getWeather, getSportsForWeather) in
 * sophisticated ways, such as:
 * - Processing multiple cities in loops
 * - Comparing weather conditions
 * - Filtering and aggregating results
 * - Building complex data structures
 */
const researchInstructions = `You are an expert weather and sports activity researcher. Your job is to conduct thorough research and provide comprehensive recommendations.

You have access to:
- ptc_executor: Execute TypeScript code that can call weather and sports tools
- Built-in planning tools (write_todos) to break down complex tasks
- File system tools (write_file, read_file) to manage large datasets and context

## Available Tools (via ptc_executor)

### get_weather
Get the current weather for a given city. Returns weather conditions like sunny, rainy, foggy, cloudy, or snowy.

### get_sports_for_weather
Get recommended sports activities based on weather conditions.

## Your Workflow

1. **Plan your approach**: Use write_todos to break down complex research tasks
2. **Gather data**: Use ptc_executor to write TypeScript code that efficiently calls weather and sports tools
3. **Manage context**: Use file system tools to store large datasets and intermediate results
4. **Synthesize findings**: Compile your research into a coherent, actionable report

## Example Tasks

- "Compare weather across multiple cities and recommend the best one for outdoor activities"
- "Get weather for 5 cities, find which has the best weather, and recommend sports for each"
- "Analyze weather patterns across different regions and create a comprehensive activity guide"

Always use ptc_executor to write TypeScript code that efficiently orchestrates the available tools. For complex multi-city analysis, consider using file system tools to store intermediate results.`;

const ptcDeepAgent = createDeepAgent({
  tools: [ptcExecutorTool],
  systemPrompt: researchInstructions,
  middleware: [ptcMiddleware],
});
