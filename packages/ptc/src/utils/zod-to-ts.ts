import * as z from 'zod';

/**
 * Convert a Zod schema to a TypeScript type string
 * This is a simplified converter that handles common cases
 */
export function zodToTypeScript(schema: z.ZodTypeAny): string {
  if (schema instanceof z.ZodString) {
    return 'string';
  }
  if (schema instanceof z.ZodNumber) {
    return 'number';
  }
  if (schema instanceof z.ZodBoolean) {
    return 'boolean';
  }
  if (schema instanceof z.ZodArray) {
    const elementType = zodToTypeScript(schema.element);
    return `${elementType}[]`;
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const entries = Object.entries(shape).map(([key, value]) => {
      const valueType = zodToTypeScript(value as z.ZodTypeAny);
      const isOptional = value instanceof z.ZodOptional || 
                        (value as any)._def?.typeName === 'ZodOptional';
      return `${key}${isOptional ? '?' : ''}: ${valueType}`;
    });
    return `{ ${entries.join('; ')} }`;
  }
  if (schema instanceof z.ZodOptional) {
    return `${zodToTypeScript(schema.unwrap())} | undefined`;
  }
  if (schema instanceof z.ZodNullable) {
    return `${zodToTypeScript(schema.unwrap())} | null`;
  }
  if (schema instanceof z.ZodEnum) {
    const options = schema.options.map((opt: string) => `"${opt}"`).join(' | ');
    return options;
  }
  if (schema instanceof z.ZodUnion) {
    const types = (schema.options as z.ZodTypeAny[]).map((opt) => zodToTypeScript(opt));
    return types.join(' | ');
  }
  if (schema instanceof z.ZodLiteral) {
    const value = schema.value;
    return typeof value === 'string' ? `"${value}"` : String(value);
  }
  
  // Default fallback
  return 'any';
}

