import { createAgent } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver } from '@langchain/langgraph';
import * as z from 'zod';
import { getWeather, getSportsForWeather } from './tools.js';
import { PTCClient, createPTCMiddleware, createExecutorTool, type PTCTool } from '@gdrl/ptc';

const model = new ChatOpenAI({
  modelName: "gpt-5.2",
  temperature: 0,
  apiKey: process.env.HELICONE_API_KEY,
  configuration: {
    baseURL: "https://ai-gateway.helicone.ai",
  },
});

const checkpointer = new MemorySaver();

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

export const agent = createAgent({
  model,
  tools: [ptcExecutorTool], // Only the executor tool - real tools are available via PTC
  systemPrompt: 'You are a helpful assistant that can check weather and recommend sports activities based on weather conditions. Use the ptc_executor tool to write TypeScript code that uses the available tools.',
  middleware: [ptcMiddleware],
  checkpointer,
});