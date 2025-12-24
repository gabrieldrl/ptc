import { tool } from 'langchain';
import * as z from 'zod';

/**
 * Create a mock tool for testing
 */
export function createMockTool(name: string, description: string, returnValue: any) {
  return tool(
    async (args: any) => {
      return returnValue;
    },
    {
      name,
      description,
      schema: z.object({
        input: z.string().optional(),
      }),
    }
  );
}

/**
 * Create a simple weather tool for testing
 */
export const mockWeatherTool = tool(
  async (args: { city: string }) => {
    const weatherMap: Record<string, string> = {
      london: 'sunny',
      paris: 'rainy',
      'san francisco': 'foggy',
    };
    // Return object to match test expectations
    return { 
      weather: weatherMap[args.city.toLowerCase()] || 'unknown',
      city: args.city 
    };
  },
  {
    name: 'get_weather',
    description: 'Get weather from a city',
    schema: z.object({
      city: z.string().describe('City name'),
    }),
  }
);

/**
 * Create a simple math tool for testing
 */
export const mockMathTool = tool(
  async (args: { a: number; b: number; operation: 'add' | 'multiply' }) => {
    if (args.operation === 'add') {
      return args.a + args.b;
    } else {
      return args.a * args.b;
    }
  },
  {
    name: 'calculate',
    description: 'Perform a calculation',
    schema: z.object({
      a: z.number().describe('First number'),
      b: z.number().describe('Second number'),
      operation: z.enum(['add', 'multiply']).describe('Operation to perform'),
    }),
  }
);

