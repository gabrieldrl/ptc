# @gdrl/ptc

**Programmatic Tool Calling** - Execute AI-written TypeScript safely in an E2B sandbox, while real tool execution happens on your trusted LangGraph server.

[![npm version](https://img.shields.io/npm/v/@gdrl/ptc)](https://www.npmjs.com/package/@gdrl/ptc)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install @gdrl/ptc
# or
pnpm add @gdrl/ptc
```

## Quick Start

```typescript
import { PTCClient, createPTCMiddleware, createExecutorTool } from '@gdrl/ptc';
import { createAgent } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver } from '@langchain/langgraph';
import { tool } from 'langchain';
import * as z from 'zod';

// Define your tools
const getWeather = tool(
  async ({ city }: { city: string }) => {
    // Your actual tool implementation
    return { weather: 'sunny', city };
  },
  {
    name: 'get_weather',
    description: 'Get weather for a city',
    schema: z.object({
      city: z.string().describe('City name'),
    }),
  }
);

// Initialize PTC client
const ptcClient = new PTCClient({
  e2bApiKey: process.env.E2B_API_KEY!,
  tools: [getWeather],
  maxRecursionLimit: 100,
  timeoutMs: 30000,
});

// Create middleware and executor tool
const ptcMiddleware = createPTCMiddleware({ ptcClient });
const ptcExecutor = createExecutorTool(ptcClient);

// Create your agent
const agent = createAgent({
  model: new ChatOpenAI({ modelName: 'gpt-4', temperature: 0 }),
  tools: [ptcExecutor], // Only this one tool!
  middleware: [ptcMiddleware],
  checkpointer: new MemorySaver(),
  systemPrompt: 'Use ptc_executor to write TypeScript code that uses available tools.',
});

// Use your agent
const result = await agent.invoke({
  messages: [{ role: 'user', content: 'Get weather for London' }],
});
```

## API Reference

### `PTCClient`

The main client for executing TypeScript code in E2B sandboxes.

```typescript
const client = new PTCClient({
  e2bApiKey: string,           // Required: E2B API key
  tools: PTCTool[],            // Required: Array of tools to expose
  maxRecursionLimit?: number,  // Optional: Max tool calls (default: 100)
  timeoutMs?: number,          // Optional: Execution timeout (default: E2B default)
});
```

#### Methods

- `execute({ code: string }): Promise<PTCExecuteResponse>` - Execute TypeScript code
- `getToolCatalogText(): string` - Get formatted tool catalog for prompts

### `createPTCMiddleware`

Creates LangChain middleware that injects tool catalog into the system prompt.

```typescript
const middleware = createPTCMiddleware({ ptcClient: PTCClient });
```

### `createExecutorTool`

Creates a LangChain tool that allows the agent to execute TypeScript code.

```typescript
const executorTool = createExecutorTool(ptcClient: PTCClient);
```

## Tool Configuration

### Basic Tool

```typescript
import { tool } from 'langchain';
import * as z from 'zod';

const myTool = tool(
  async (args: { input: string }) => {
    return { result: 'some value' };
  },
  {
    name: 'my_tool',
    description: 'Tool description',
    schema: z.object({
      input: z.string(),
    }),
  }
);
```

### Tool with Output Schema

For better type safety, you can specify an output schema:

```typescript
import type { PTCTool } from '@gdrl/ptc';
import * as z from 'zod';

const toolWithSchema: PTCTool = {
  tool: myTool,
  outputSchema: z.object({
    result: z.string(),
  }),
};
```

## Configuration Options

### `maxRecursionLimit`

Maximum number of tool calls allowed in a single execution. Prevents infinite loops.

```typescript
const client = new PTCClient({
  // ... other options
  maxRecursionLimit: 50, // Default: 100
});
```

### `timeoutMs`

Timeout for sandbox execution in milliseconds.

```typescript
const client = new PTCClient({
  // ... other options
  timeoutMs: 60000, // 60 seconds (default: E2B default)
});
```

## How It Works

1. **Agent writes TypeScript code** using the `ptc_executor` tool
2. **Code runs in E2B sandbox** - completely isolated
3. **When code calls a tool**:
   - Sandbox signals the host
   - Host validates and executes the real tool
   - Result is returned to sandbox
4. **Final result** is returned to the agent

The sandbox persists for the entire execution, avoiding recompilation overhead.

## Example: Agent-Generated Code

The agent might write code like:

```typescript
const cities = ['london', 'paris', 'tokyo'];
const results = [];

for (const city of cities) {
  const weather = await get_weather({ city });
  results.push({ city, weather: weather.weather });
}

return { cities: results };
```

This code runs in the sandbox, but `get_weather` executes on your server!

## Requirements

- Node.js 20+
- E2B API key ([get one here](https://e2b.dev))
- LangChain v1+ and LangGraph v1+

## TypeScript Support

Full TypeScript support with type definitions included.

## License

MIT License - see [LICENSE](../../LICENSE) file for details.

## Links

- [npm package](https://www.npmjs.com/package/@gdrl/ptc)
- [GitHub Repository](https://github.com/gdrl/ptc)
- [E2B Documentation](https://docs.e2b.dev)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
