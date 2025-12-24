import { tool } from 'langchain';
import * as z from 'zod';
import type { PTCClient } from './client.js';

export function createExecutorTool(ptcClient: PTCClient) {
  return tool(
    async (args: { code: string }): Promise<any> => {
      const result = await ptcClient.execute(args);
      
      if (result.success) {
        return result.result;
      } else {
        // Return error as string - LangChain tools typically return strings
        throw new Error(result.error);
      }
    },
    {
      name: 'ptc_executor',
      description: 'Execute TypeScript code in an E2B sandbox. The code can import and use tools from "/ptc/index". Returns the final result as JSON. IMPORTANT: Write properly formatted code with all braces closed. Each statement on its own line with proper indentation.',
      schema: z.object({
        code: z.string().min(1).describe('TypeScript code to execute in the sandbox. Must be properly formatted with all opening braces { closed with matching }. Each statement should be on its own line. Should import tools from "/ptc/index" and return a JSON-serializable result. Example: const result = await get_weather({ city: "london" }); return { weather: result.weather };'),
      }),
    }
  );
}


