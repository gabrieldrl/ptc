import { createMiddleware, SystemMessage } from 'langchain';
import type { PTCClient } from './client.js';
import { renderInstructions } from './instructions/index.js';

/**
 * Creates PTC middleware that injects tool catalog instructions into the system prompt.
 * 
 * This middleware is fully compatible with deep agents and other middleware:
 * - Stateless: Only modifies system messages, no state schema
 * - Non-interfering: Doesn't add or modify state channels
 * - Composable: Works with any other middleware including deep agents' built-in middleware
 */
export function createPTCMiddleware(options: { ptcClient: PTCClient }) {
  const { ptcClient } = options;

  // Pre-compute tool catalog to avoid recomputation
  const toolCatalog = ptcClient.getToolCatalogText();
  const ptcInstructions = renderInstructions(toolCatalog);

  return createMiddleware({
    name: 'PTCMiddleware',
    // Explicitly no stateSchema - this middleware is purely for prompt modification
    wrapModelCall: async (request, handler) => {
      // Append to existing system message using SystemMessage.concat()
      // This ensures compatibility with deep agents and other middleware
      const newSystemMessage = request.systemMessage.concat(
        new SystemMessage({
          content: ptcInstructions,
        })
      );

      return handler({
        ...request,
        systemMessage: newSystemMessage,
      });
    },
  });
}


