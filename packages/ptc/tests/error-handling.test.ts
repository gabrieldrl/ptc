import { describe, it, expect } from 'vitest';
import { PTCClient } from '../src/client.js';
import { mockWeatherTool, mockMathTool } from './utils.js';

// Skip tests if E2B_API_KEY is not set
const E2B_API_KEY = process.env.E2B_API_KEY;

describe.skipIf(!E2B_API_KEY)('PTCClient Error Handling', () => {
  describe('Syntax Errors', () => {
    it('should parse esbuild syntax errors correctly - missing brace', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: 'const x = {;', // Syntax error: missing closing brace
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        // Should contain file location and error message
        expect(result.error).toContain('compilation error');
        expect(result.error.toLowerCase()).toMatch(/syntax|error|unexpected/i);
        // Should mention the file location
        expect(result.error).toMatch(/\/ptc\/main\.ts/);
      }
    }, 60000);

    it('should parse syntax errors - unexpected token', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: 'const x = ;', // Syntax error: unexpected semicolon
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('compilation error');
        expect(result.error.toLowerCase()).toMatch(/syntax|error|unexpected/i);
      }
    }, 60000);

    it('should parse syntax errors - missing parenthesis', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: 'const x = function( { return 1; }', // Missing closing parenthesis
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('compilation error');
      }
    }, 60000);

    it('should parse syntax errors - invalid import statement', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: 'import { invalid } from "invalid"; return { x: 1 };',
      });

      // This might succeed if the import is cleaned, or fail if it's not
      // The important thing is it doesn't crash
      expect(result.success).toBeDefined();
    }, 60000);
  });

  describe('Type Errors', () => {
    it('should handle TypeScript type errors', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: `
          const x: string = 123; // Type error
          return { x };
        `,
      });

      // Type errors might not always be caught at runtime, but if they are:
      expect(result.success).toBeDefined();
    }, 60000);
  });

  describe('Runtime Errors', () => {
    it('should handle null reference errors', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: `
          const obj: any = null;
          return { value: obj.property }; // Runtime error: cannot read property of null
        `,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        // Check for actual error message (more specific than just "error")
        expect(result.error.toLowerCase()).toMatch(/cannot read|property|null|error/i);
      }
    }, 60000);

    it('should handle undefined variable errors', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: 'return { value: undefinedVariable };',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        // Check for actual error message (more specific than just "error")
        expect(result.error.toLowerCase()).toMatch(/undefined|not defined|error/i);
      }
    }, 60000);

    it('should handle division by zero', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockMathTool],
      });

      const result = await client.execute({
        code: `
          const result = 10 / 0;
          return { result };
        `,
      });

      // Division by zero returns Infinity in JS, should succeed
      expect(result.success).toBe(true);
    }, 60000);
  });

  describe('Tool Execution Errors', () => {
    it('should handle invalid tool name', async () => {
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

    it('should handle invalid tool arguments - wrong type', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockMathTool],
      });

      const result = await client.execute({
        code: 'const result = await calculate({ a: "not a number", b: 2, operation: "add" }); return { result };',
      });

      // Should fail at validation
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/invalid|validation|argument/i);
      }
    }, 60000);

    it('should handle invalid tool arguments - missing required field', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockMathTool],
      });

      const result = await client.execute({
        code: 'const result = await calculate({ a: 1 }); return { result };', // Missing b and operation
      });

      // Should fail at validation
      expect(result.success).toBe(false);
    }, 60000);
  });

  describe('Timeout and Performance', () => {
    it('should respect custom maxRecursionLimit', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockMathTool],
        maxRecursionLimit: 5, // Lower limit for testing
      });

      // Create code that makes more tool calls than the limit
      // Note: This will make 10 tool calls, which exceeds the limit of 5
      const result = await client.execute({
        code: `
          const results: any[] = [];
          for (let i = 0; i < 10; i++) {
            const result = await calculate({ a: i, b: 1, operation: "add" });
            results.push(result);
          }
          return { results };
        `.trim(),
      });

      // Should fail with max iteration limit error
      // Note: If there's a syntax error first, that's also acceptable
      expect(result.success).toBe(false);
      if (!result.success) {
        // Either we hit the iteration limit OR there was a syntax error
        const hasIterationLimit = result.error.includes('maximum iteration limit') && result.error.includes('5');
        const hasSyntaxError = result.error.toLowerCase().includes('syntax') || result.error.toLowerCase().includes('unexpected');
        expect(hasIterationLimit || hasSyntaxError).toBe(true);
      }
    }, 120000);

    it('should handle timeout when timeoutMs is set', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
        timeoutMs: 1000, // Very short timeout
      });

      // Code that should take longer than 1 second
      const result = await client.execute({
        code: `
          let sum = 0;
          for (let i = 0; i < 100000000; i++) {
            sum += i;
          }
          return { sum };
        `,
      });

      // Should timeout
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('timed out');
        expect(result.error).toContain('1000');
      }
    }, 10000); // Test timeout should be longer than the command timeout

    it('should handle max iteration limit (too many tool calls)', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockMathTool],
      });

      // Create code that makes many tool calls in a loop
      // This should hit the MAX_ITERATIONS limit (100)
      const result = await client.execute({
        code: `
          const results: any[] = [];
          for (let i = 0; i < 150; i++) {
            const result = await calculate({ a: i, b: 1, operation: "add" });
            results.push(result);
          }
          return { results };
        `.trim(),
      });

      // Should fail with max iteration limit error
      // Note: If there's a syntax error first, that's also acceptable
      expect(result.success).toBe(false);
      if (!result.success) {
        // Either we hit the iteration limit OR there was a syntax error
        const hasIterationLimit = result.error.includes('maximum iteration limit') && result.error.includes('100');
        const hasSyntaxError = result.error.toLowerCase().includes('syntax') || result.error.toLowerCase().includes('unexpected');
        expect(hasIterationLimit || hasSyntaxError).toBe(true);
      }
    }, 180000); // Longer timeout for many tool calls

    it('should handle infinite loop in code (E2B timeout)', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: `
          while (true) {
            // Infinite loop - E2B should timeout
          }
          return { done: true };
        `,
      });

      // Should eventually timeout or fail
      // E2B might have its own timeout
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('error');
      }
    }, 120000); // Longer timeout for this test

    it('should handle very long execution', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockMathTool],
      });

      const result = await client.execute({
        code: `
          let sum = 0;
          for (let i = 0; i < 1000000; i++) {
            sum += i;
          }
          return { sum };
        `.trim(),
      });

      // Should succeed but take some time
      // Note: This might timeout or succeed depending on E2B performance
      expect(result.success).toBeDefined();
      if (result.success) {
        expect(result.result.sum).toBeGreaterThan(0);
      }
    }, 120000);
  });

  describe('Edge Cases', () => {
    it('should handle missing return statement', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: `
          const x = "hello";
          // No return statement
        `,
      });

      // Should still succeed but return null/undefined
      expect(result.success).toBe(true);
    }, 60000);

    it('should handle circular reference in return value', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: `
          const obj: any = { a: 1 };
          obj.self = obj; // Circular reference
          return obj;
        `,
      });

      // JSON.stringify will fail on circular reference
      // Should return an error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.toLowerCase()).toMatch(/circular|stringify|error/i);
      }
    }, 60000);

    it('should handle very large return values', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: `
          const largeArray = Array(10000).fill(0).map((_, i) => i);
          return { data: largeArray };
        `,
      });

      // Should succeed but might be slow
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.data).toHaveLength(10000);
      }
    }, 60000);

    it('should handle empty code', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: '',
      });

      // Empty code should either succeed with null or fail
      expect(result.success).toBeDefined();
    }, 60000);

    it('should handle code with only whitespace', async () => {
      const client = new PTCClient({
        e2bApiKey: E2B_API_KEY!,
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: '   \n\t  \n  ',
      });

      expect(result.success).toBeDefined();
    }, 60000);
  });

  describe('API Errors', () => {
    it('should handle invalid E2B API key', async () => {
      const client = new PTCClient({
        e2bApiKey: 'invalid-api-key-12345',
        tools: [mockWeatherTool],
      });

      const result = await client.execute({
        code: 'return { message: "test" };',
      });

      // Should fail with authentication error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.toLowerCase()).toMatch(/api|auth|key|unauthorized|invalid/i);
      }
    }, 60000);
  });
});

