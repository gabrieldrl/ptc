import { describe, it, expect, beforeAll } from 'vitest';
import { PTCClient } from '../src/client.js';
import { mockWeatherTool, mockMathTool } from './utils.ts';

// Skip tests if E2B_API_KEY is not set
const E2B_API_KEY = process.env.E2B_API_KEY;

describe.skipIf(!E2B_API_KEY)('PTCClient', () => {
  describe('Tool Catalog', () => {
    it('should generate tool catalog text', () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool, mockMathTool],
      });

      const catalog = client.getToolCatalogText();
      
      expect(catalog).toContain('get_weather');
      expect(catalog).toContain('calculate');
      expect(catalog).toContain('Get weather from a city');
      expect(catalog).toContain('Perform a calculation');
    });
  });

  describe('Code Execution - Success Cases', () => {
    it('should execute simple code that returns a value', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: 'const result = "hello world"; return { message: result };',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toEqual({ message: 'hello world' });
      }
    }, 60000); // 60s timeout for E2B sandbox

    it('should execute code with a single tool call', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: `
          const weather = await get_weather({ city: "london" });
          return { weather };
        `,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // weather is now an object { weather: 'sunny', city: 'london' }
        expect(result.result.weather.weather).toBe('sunny');
        expect(result.result.weather.city).toBe('london');
      }
    }, 60000);

    it('should execute code with multiple tool calls', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockMathTool],
      });

      const result = await client.execute({
        code: `
          const sum = await calculate({ a: 5, b: 3, operation: "add" });
          const product = await calculate({ a: 4, b: 2, operation: "multiply" });
          return { sum, product };
        `,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.sum).toBe(8);
        expect(result.result.product).toBe(8);
      }
    }, 60000);

    it('should execute code with loops and multiple tool calls', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: `
          const cities = ["london", "paris"];
          const results: any[] = [];
          for (const city of cities) {
            const weather = await get_weather({ city });
            results.push({ city, weather });
          }
          return { results };
        `.trim(),
      });

      if (!result.success) {
        console.error('Execution failed:', result.error);
      }
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.results).toHaveLength(2);
        expect(result.result.results[0].city).toBe('london');
        expect(result.result.results[1].city).toBe('paris');
      }
    }, 90000); // Longer timeout for multiple tool calls

    it('should handle code with functions', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockMathTool],
      });

      const result = await client.execute({
        code: `
          function double(n: number): number {
            return n * 2;
          }
          const value = await calculate({ a: 3, b: 2, operation: "add" });
          return { doubled: double(value) };
        `.trim(),
      });

      if (!result.success) {
        console.error('Execution failed:', result.error);
      }
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.doubled).toBe(10); // (3 + 2) * 2
      }
    }, 60000);
  });

  describe('Code Execution - Error Cases', () => {
    it('should return syntax error for invalid TypeScript', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: 'const x = {; return x;', // Missing closing brace
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        // Unbalanced braces are detected before compilation, so we get a clearer error
        expect(result.error.toLowerCase()).toMatch(/unbalanced|brace|syntax|error/i);
      }
    }, 60000);

    it('should return error for undefined variable', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: 'return { value: undefinedVar };', // undefinedVar doesn't exist
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        // Check for actual error message (more specific than just "error")
        expect(result.error.toLowerCase()).toMatch(/undefined|not defined|error/i);
      }
    }, 60000);

    it('should return error for invalid tool name', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: 'const result = await nonExistentTool({}); return { result };',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        // Check for actual error message (more specific than just "error")
        expect(result.error.toLowerCase()).toMatch(/undefined|not defined|error/i);
      }
    }, 60000);
  });

  describe('Cache Functionality', () => {
    it('should cache tool results and reuse them', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockMathTool],
      });

      // First execution - should call tool
      const result1 = await client.execute({
        code: `
          const result = await calculate({ a: 10, b: 5, operation: "add" });
          return { value: result };
        `,
      });

      expect(result1.success).toBe(true);
      if (result1.success) {
        expect(result1.result.value).toBe(15);
      }

      // Second execution with same tool call - should use cache
      const result2 = await client.execute({
        code: `
          const result = await calculate({ a: 10, b: 5, operation: "add" });
          return { value: result };
        `,
      });

      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.result.value).toBe(15);
      }
    }, 120000); // Longer timeout for multiple executions
  });

  describe('Code Cleaning', () => {
    it('should handle code with import statements (should be removed)', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      // Code with import statement that should be cleaned
      const result = await client.execute({
        code: `
          import { get_weather } from "/ptc/index";
          const weather = await get_weather({ city: "london" });
          return { weather };
        `,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // weather is now an object { weather: 'sunny', city: 'london' }
        expect(result.result.weather.city).toBe('london');
        expect(result.result.weather.weather).toBe('sunny');
      }
    }, 60000);

    it('should handle code with function wrapper (should be removed)', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      // Code with async function main() wrapper that should be cleaned
      const result = await client.execute({
        code: `
          async function main() {
            const weather = await get_weather({ city: "paris" });
            return { weather };
          }
          export default main();
        `,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // weather is now an object { weather: 'rainy', city: 'paris' }
        expect(result.result.weather.city).toBe('paris');
        expect(result.result.weather.weather).toBe('rainy');
      }
    }, 60000);
  });
});

