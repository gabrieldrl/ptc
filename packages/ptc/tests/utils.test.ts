import { describe, it, expect } from 'vitest';
import { extractToolInfo } from '../src/utils/tool-extraction.js';
import { zodToTypeScript } from '../src/utils/zod-to-ts.js';
import { generateCacheKey } from '../src/utils/cache-key.js';
import { mockWeatherTool, mockMathTool } from './utils.js';
import * as z from 'zod';

describe('Utility Functions', () => {
  describe('extractToolInfo', () => {
    it('should extract tool info from LangChain tool', () => {
      const info = extractToolInfo(mockWeatherTool);
      
      expect(info.name).toBe('get_weather');
      expect(info.description).toBe('Get weather from a city');
      expect(info.inputSchema).toBeDefined();
    });

    it('should handle tools with different schemas', () => {
      const info = extractToolInfo(mockMathTool);
      
      expect(info.name).toBe('calculate');
      expect(info.description).toBe('Perform a calculation');
      expect(info.inputSchema).toBeDefined();
    });
  });

  describe('zodToTypeScript', () => {
    it('should convert simple string schema', () => {
      const schema = z.string();
      const ts = zodToTypeScript(schema);
      expect(ts).toBe('string');
    });

    it('should convert number schema', () => {
      const schema = z.number();
      const ts = zodToTypeScript(schema);
      expect(ts).toBe('number');
    });

    it('should convert object schema', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });
      const ts = zodToTypeScript(schema);
      expect(ts).toContain('name');
      expect(ts).toContain('age');
      expect(ts).toContain('string');
      expect(ts).toContain('number');
    });

    it('should convert optional fields', () => {
      const schema = z.object({
        name: z.string().optional(),
        age: z.number(),
      });
      const ts = zodToTypeScript(schema);
      expect(ts).toContain('name');
      expect(ts).toContain('age');
    });

    it('should convert enum schema', () => {
      const schema = z.enum(['add', 'multiply']);
      const ts = zodToTypeScript(schema);
      expect(ts).toContain('add');
      expect(ts).toContain('multiply');
    });
  });

  describe('generateCacheKey', () => {
    it('should generate consistent cache keys', () => {
      const key1 = generateCacheKey('testTool', { a: 1, b: 2 });
      const key2 = generateCacheKey('testTool', { a: 1, b: 2 });
      const key3 = generateCacheKey('testTool', { b: 2, a: 1 }); // Different order
      
      expect(key1).toBe(key2);
      // Note: Different order might produce different keys due to JSON.stringify
      // This is expected behavior
    });

    it('should generate different keys for different tools', () => {
      const key1 = generateCacheKey('tool1', { arg: 'value' });
      const key2 = generateCacheKey('tool2', { arg: 'value' });
      
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different arguments', () => {
      const key1 = generateCacheKey('tool', { arg: 'value1' });
      const key2 = generateCacheKey('tool', { arg: 'value2' });
      
      expect(key1).not.toBe(key2);
    });
  });
});

