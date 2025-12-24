import { createHash } from 'crypto';

/**
 * Generate a deterministic cache key from tool name and arguments
 */
export function generateCacheKey(tool: string, args: any): string {
  // Sort keys to ensure consistent ordering
  const normalized = JSON.stringify(args, Object.keys(args || {}).sort());
  const key = `${tool}:${normalized}`;
  return createHash('sha256').update(key).digest('hex');
}

