import { Sandbox } from '@e2b/sdk';
import type { PTCOptions, ToolInfo, PTCExecuteResponse, ToolRequest } from './types.js';
import { extractToolInfo } from './utils/tool-extraction.js';
import { zodToTypeScript } from './utils/zod-to-ts.js';

export class PTCClient {
  private e2bApiKey: string;
  private tools: ToolInfo[];
  private toolMap: Map<string, { tool: any; info: ToolInfo }>;
  private maxRecursionLimit: number;
  private timeoutMs: number;

  constructor(options: PTCOptions) {
    this.e2bApiKey = options.e2bApiKey;
    this.tools = options.tools.map(extractToolInfo);
    this.toolMap = new Map();
    this.maxRecursionLimit = options.maxRecursionLimit ?? 100;
    this.timeoutMs = options.timeoutMs ?? 30000;
    
    // Build tool map for quick lookup
    options.tools.forEach((ptcTool, index) => {
      // Extract the actual tool (unwrap if it's ToolWithOutputSchema)
      const actualTool = 'tool' in ptcTool ? ptcTool.tool : ptcTool;
      this.toolMap.set(this.tools[index].name, {
        tool: actualTool,
        info: this.tools[index],
      });
    });
  }

  /**
   * Generate tool catalog text for system prompt injection
   */
  getToolCatalogText(): string {
    const toolDescriptions = this.tools.map((tool) => {
      const inputType = zodToTypeScript(tool.inputSchema);
      const outputType = tool.outputSchema 
        ? zodToTypeScript(tool.outputSchema)
        : 'any';
      
      return `- ${tool.name}: ${tool.description}
  Input: ${inputType}
  Output: ${outputType}`;
    }).join('\n\n');

    return `Available Tools (import from "/ptc/index"):

${toolDescriptions}

Usage:
- Import tools: import { toolName } from "/ptc/index"
- Use await: const result = await toolName({ ...args })
- Return minimal JSON (avoid huge results)
- No external network assumptions`;
  }

  /**
   * Generate /ptc/index.ts file with tool stubs
   */
  private generateIndexFile(): string {
    const exports = this.tools.map((tool) => {
      const inputType = zodToTypeScript(tool.inputSchema);
      const outputType = tool.outputSchema 
        ? zodToTypeScript(tool.outputSchema)
        : 'any';
      
      return `export async function ${tool.name}(input: ${inputType}): Promise<${outputType}> {
  return __ptc_call("${tool.name}", input);
}`;
    }).join('\n\n');

    return `import { __ptc_call } from "./ptc_runtime";

${exports}
`;
  }

  /**
   * Generate /ptc/ptc_runtime.ts file with cache logic and file-based request/response
   */
  private generateRuntimeFile(): string {
    return `import { promises as fs } from "fs";
import { createHash } from "crypto";
import { join } from "path";

function getCacheKey(tool: string, args: any): string {
  const normalized = JSON.stringify(args, Object.keys(args || {}).sort());
  const key = \`\${tool}:\${normalized}\`;
  return createHash("sha256").update(key).digest("hex");
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function __ptc_call(tool: string, args: any): Promise<any> {
  const cacheKey = getCacheKey(tool, args);
  const cachePath = "/ptc/cache.json";
  
  // Load cache
  let cache: Record<string, any> = {};
  try {
    const cacheContent = await fs.readFile(cachePath, "utf-8");
    cache = JSON.parse(cacheContent);
  } catch (error) {
    // Cache file doesn't exist or is invalid, start fresh
    cache = {};
  }
  
  // Check cache first
  if (cacheKey in cache) {
    return cache[cacheKey];
  }
  
  // Cache miss - request tool execution via file-based communication
  const requestId = \`\${Date.now()}-\${Math.random().toString(36).substr(2, 9)}\`;
  const requestsDir = "/ptc/requests";
  const responsesDir = "/ptc/responses";
  const requestFile = join(requestsDir, \`\${requestId}.json\`);
  const responseFile = join(responsesDir, \`\${requestId}.json\`);
  
  // Ensure directories exist
  try {
    await fs.mkdir(requestsDir, { recursive: true });
    await fs.mkdir(responsesDir, { recursive: true });
  } catch (error) {
    // Directories might already exist, ignore
  }
  
  // Write request file
  const request = { tool, args, cacheKey, requestId };
  await fs.writeFile(requestFile, JSON.stringify(request));
  
  // Signal host via stdout
  console.log(\`__PTC_TOOL_REQUEST__\${requestId}\`);
  
  // Poll for response file (with timeout and exponential backoff)
  const maxWaitTime = 60000; // 60 seconds
  const startTime = Date.now();
  let pollInterval = 10; // Start with 10ms
  
  while (Date.now() - startTime < maxWaitTime) {
    if (await fileExists(responseFile)) {
      try {
        // Read response
        const responseContent = await fs.readFile(responseFile, "utf-8");
        const response = JSON.parse(responseContent);
        
        if (!response.success) {
          // Format error message clearly for the agent
          const errorMsg = response.error || "Tool execution failed";
          throw new Error("Tool call error: " + errorMsg);
        }
        
        // Update cache
        cache[cacheKey] = response.result;
        await fs.writeFile(cachePath, JSON.stringify(cache, null, 2));
        
        // Cleanup request and response files
        try {
          await fs.unlink(requestFile);
          await fs.unlink(responseFile);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        
        return response.result;
      } catch (error: any) {
        // File might be incomplete, continue polling
        await sleep(pollInterval);
        pollInterval = Math.min(pollInterval * 1.5, 1000); // Exponential backoff, max 1s
        continue;
      }
    }
    
    await sleep(pollInterval);
    pollInterval = Math.min(pollInterval * 1.5, 1000); // Exponential backoff, max 1s
  }
  
  // Timeout - cleanup and throw error
  try {
    await fs.unlink(requestFile);
  } catch (cleanupError) {
    // Ignore cleanup errors
  }
  
  throw new Error(\`Tool request timeout: \${tool} after \${maxWaitTime}ms\`);
}
`;
  }

  /**
   * Check if braces are balanced in code
   */
  private checkBraceBalance(code: string): { balanced: boolean; openCount: number; closeCount: number } {
    let openBraces = 0;
    let closeBraces = 0;
    let inString = false;
    let stringChar = '';
    
    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const prevChar = i > 0 ? code[i - 1] : '';
      
      // Handle string literals (skip braces inside strings)
      if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = '';
        }
        continue;
      }
      
      if (inString) continue;
      
      // Count braces
      if (char === '{') openBraces++;
      if (char === '}') closeBraces++;
    }
    
    return {
      balanced: openBraces === closeBraces,
      openCount: openBraces,
      closeCount: closeBraces,
    };
  }

  /**
   * Generate /ptc/main.ts file that wraps user code
   */
  private generateMainFile(userCode: string): string {
    const imports = this.tools.map(tool => tool.name).join(', ');
    
    // Clean up user code: remove import statements and function wrappers
    // The tools are already imported at the top, so user code shouldn't include imports
    let cleanedCode = userCode
      // Remove import statements (single line or multi-line)
      .replace(/import\s+.*?from\s+["'].*?["'];?\s*/g, '')
      // Remove async function main() wrappers that the agent might add
      // This regex matches: async function main() { ... and captures what's inside
      .replace(/async\s+function\s+main\s*\([^)]*\)\s*\{([\s\S]*?)\}\s*$/m, '$1')
      // Remove export default main() calls
      .replace(/export\s+default\s+main\(\);?\s*/g, '')
      // Trim whitespace
      .trim();
    
    // Check brace balance before embedding
    const braceCheck = this.checkBraceBalance(cleanedCode);
    if (!braceCheck.balanced) {
      // Debug: log the actual code being checked
      console.log('[PTC] Brace check failed. Code being checked:');
      console.log(cleanedCode);
      console.log(`[PTC] Opening: ${braceCheck.openCount}, Closing: ${braceCheck.closeCount}`);
      
      // Return a clear error instead of letting it compile and fail
      const difference = braceCheck.openCount - braceCheck.closeCount;
      const missingType = difference > 0 ? 'closing' : 'opening';
      const count = Math.abs(difference);
      throw new Error(
        `Code has unbalanced braces: ${braceCheck.openCount} opening and ${braceCheck.closeCount} closing braces. ` +
        `Missing ${count} ${missingType} brace${count > 1 ? 's' : ''}. ` +
        `Please check that all opening braces ({) have matching closing braces (}). ` +
        `Make sure to close all loops, conditionals, and function blocks.`
      );
    }
    
    // Embed user code directly in the main function
    // This allows full TypeScript support: functions, loops, conditionals, etc.
    return `import { ${imports} } from "/ptc/index.js";

async function main() {
  try {
    // User code (tools are already imported above)
    // User can write any valid TypeScript: functions, loops, conditionals, etc.
${cleanedCode.split('\n').map(line => '    ' + line).join('\n')}
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    console.log(\`__PTC_ERROR__\${JSON.stringify({ message: errorMsg })}\`);
    process.exit(1);
  }
}

// Execute and capture result
main().then((result) => {
  if (result !== undefined) {
    console.log(\`__PTC_FINAL__\${JSON.stringify(result)}\`);
  } else {
    // If no return value, try to capture from the last expression
    console.log(\`__PTC_FINAL__\${JSON.stringify(null)}\`);
  }
}).catch((error: any) => {
  // Format error message clearly - preserve tool call errors
  let errorMsg = error?.message || String(error);
  
  // If it's a tool call error, make sure it's clear
  if (errorMsg.includes('Tool call error:')) {
    // Already formatted, use as-is
  } else if (errorMsg.includes('Tool request timeout')) {
    errorMsg = "Tool execution timeout: " + errorMsg;
  } else {
    // Generic error, format it
    errorMsg = "Runtime error: " + errorMsg;
  }
  
  console.log(\`__PTC_ERROR__\${JSON.stringify({ message: errorMsg })}\`);
  process.exit(1);
});
`;
  }

  /**
   * Parse and format compiler errors from E2B sandbox output
   */
  private parseCompilerError(stderr: string, stdout: string): string {
    const allOutput = stderr + '\n' + stdout;
    
    // Pattern 1: Transform failed with error details (check this first as it's more specific)
    // Example: "Error: Transform failed with 1 error:\n/ptc/main.ts:37:24: ERROR: "await" can only be used inside an "async" function"
    const transformFailedMatch = allOutput.match(/Transform failed with \d+ error[s]?:/);
    if (transformFailedMatch) {
      // Look for the actual error line after "Transform failed" - the error is on the next line
      // Match: "Transform failed with 1 error:" followed by whitespace/newline, then the error line
      const errorLineMatch = allOutput.match(/Transform failed with \d+ error[s]?:[\s\n]+(\/ptc\/main\.ts:\d+:\d+):\s*ERROR:\s*(.+?)(?:\n|$)/s);
      if (errorLineMatch) {
        const location = errorLineMatch[1];
        let errorMessage = errorLineMatch[2].trim();
        // Take only the first line of the error message (the actual error)
        errorMessage = errorMessage.split('\n')[0].trim();
        // Remove any trailing context that's not part of the error (like stack traces)
        errorMessage = errorMessage.replace(/\s+at\s+.*$/, '').trim();
        
        // Check if it's a missing brace error
        if (errorMessage.includes('Unexpected "catch"') || errorMessage.includes('Unexpected "}') || errorMessage.includes('Expected')) {
          errorMessage += '\n\nThis error often indicates missing closing braces ({}) in your code. Please check that all opening braces have matching closing braces.';
        }
        
        return `TypeScript compilation error at ${location}:\n${errorMessage}\n\nPlease fix the syntax error in your code.`;
      }
      
      // Alternative: Look for error on next line after "Transform failed" (more flexible)
      const afterTransformMatch = allOutput.match(/Transform failed with \d+ error[s]?:[\s\n]+(.+?)(?:\n|$)/s);
      if (afterTransformMatch) {
        const errorDetails = afterTransformMatch[1].trim().split('\n')[0];
        // Check if it contains a file location and ERROR
        const locationInDetails = errorDetails.match(/(\/ptc\/main\.ts:\d+:\d+):\s*ERROR:\s*(.+)/);
        if (locationInDetails) {
          let errorMsg = locationInDetails[2].trim();
          // Check if it's a missing brace error
          if (errorMsg.includes('Unexpected "catch"') || errorMsg.includes('Unexpected "}') || errorMsg.includes('Expected')) {
            errorMsg += '\n\nThis error often indicates missing closing braces ({}) in your code. Please check that all opening braces have matching closing braces.';
          }
          return `TypeScript compilation error at ${locationInDetails[1]}:\n${errorMsg}\n\nPlease fix the syntax error in your code.`;
        }
        return `TypeScript compilation error:\n${errorDetails}\n\nPlease check your code syntax and fix the error.`;
      }
    }
    
    // Pattern 2: esbuild/tsx transform errors with location and error message (standalone)
    // Example: "/ptc/main.ts:37:24: ERROR: "await" can only be used inside an "async" function"
    // This pattern matches the full error line including the actual error message
    const esbuildErrorMatch = allOutput.match(/(\/ptc\/main\.ts:\d+:\d+):\s*ERROR:\s*(.+?)(?:\n|$)/s);
    if (esbuildErrorMatch) {
      const location = esbuildErrorMatch[1];
      // Extract the full error message, handling multi-line if needed
      let errorMessage = esbuildErrorMatch[2].trim();
      
      // Clean up the error message - remove any trailing context that's not part of the error
      // Stop at common patterns that indicate the end of the error message
      errorMessage = errorMessage.split('\n')[0].trim();
      // Remove stack trace patterns
      errorMessage = errorMessage.replace(/\s+at\s+.*$/, '').trim();
      
      // Check if it's a missing brace error
      if (errorMessage.includes('Unexpected "catch"') || errorMessage.includes('Unexpected "}') || errorMessage.includes('Expected')) {
        errorMessage += '\n\nThis error often indicates missing closing braces ({}) in your code. Please check that all opening braces have matching closing braces.';
      }
      
      return `TypeScript compilation error at ${location}:\n${errorMessage}\n\nPlease check your code syntax and fix the error.`;
    }
    
    // Pattern 3: Node.js runtime errors
    // Example: "SyntaxError: Unexpected token"
    const runtimeErrorMatch = allOutput.match(/(SyntaxError|TypeError|ReferenceError|Error):\s*(.+?)(?:\n|$)/);
    if (runtimeErrorMatch) {
      const errorType = runtimeErrorMatch[1];
      const errorMessage = runtimeErrorMatch[2].trim().split('\n')[0];
      
      // Try to find file location if available
      const locationMatch = allOutput.match(/(\/ptc\/main\.ts:\d+:\d+)/);
      const location = locationMatch ? ` at ${locationMatch[1]}` : '';
      
      return `${errorType}${location}:\n${errorMessage}\n\nPlease check your code and fix the error.`;
    }
    
    // Pattern 4: Generic error messages - try to extract useful info
    const genericErrorMatch = allOutput.match(/Error:\s*(.+?)(?:\n|$)/);
    if (genericErrorMatch) {
      const errorMsg = genericErrorMatch[1].trim().split('\n')[0];
      return `Compilation error:\n${errorMsg}\n\nPlease review your code and fix any syntax or type errors.`;
    }
    
    // Fallback: return the most relevant part of stderr
    const lines = stderr.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed && 
        !trimmed.includes('npm WARN') && 
        !trimmed.includes('npm notice') &&
        !trimmed.includes('New major version') &&
        !trimmed.includes('Changelog') &&
        !trimmed.includes('Run `npm install') &&
        !trimmed.startsWith('at ') && // Stack trace lines
        !trimmed.includes('internalBinding') &&
        !trimmed.includes('node:internal');
    });
    
    // Look for lines that contain actual error information
    const errorLines = lines.filter(line => 
      line.includes('ERROR:') || 
      line.includes('Error:') || 
      line.includes('/ptc/main.ts:') ||
      line.match(/^\w+Error:/)
    );
    
    if (errorLines.length > 0) {
      // Take the first meaningful error line
      const errorLine = errorLines[0].trim();
      return `Compilation error:\n${errorLine}\n\nPlease check your code syntax.`;
    }
    
    if (lines.length > 0) {
      return `Compilation error:\n${lines.slice(0, 3).join('\n')}\n\nPlease check your code syntax.`;
    }
    
    // Last resort
    return `Code execution failed. Please check your code for syntax errors.`;
  }

  /**
   * Handle tool request from sandbox
   */
  private async handleToolRequest(
    requestId: string,
    sandbox: Sandbox
  ): Promise<void> {
    try {
      console.log(`[PTC] Reading tool request: ${requestId}`);
      // Read request file
      const requestContent = await sandbox.files.read(`/ptc/requests/${requestId}.json`);
      const request: ToolRequest = JSON.parse(requestContent);
      
      console.log('[PTC] Tool request:', JSON.stringify(request, null, 2));
      
      // Find the tool
      const toolEntry = this.toolMap.get(request.tool);
      if (!toolEntry) {
        console.error(`[PTC] Tool "${request.tool}" not found. Available tools:`, Array.from(this.toolMap.keys()));
        await this.writeErrorResponse(sandbox, requestId, `Tool "${request.tool}" not found. Available tools: ${Array.from(this.toolMap.keys()).join(', ')}`);
        return;
      }

      // Validate args with Zod schema
      try {
        toolEntry.info.inputSchema.parse(request.args);
        console.log('[PTC] Args validation passed');
      } catch (validationError: any) {
        console.error('[PTC] Args validation failed:', validationError.message);
        // Format Zod validation errors more clearly
        let errorMessage = '';
        if (validationError.errors && Array.isArray(validationError.errors)) {
          const errorDetails = validationError.errors.map((err: any) => {
            const path = err.path.join('.');
            return `${path}: Expected ${err.expected}, received ${err.received}. ${err.message || ''}`;
          }).join('; ');
          errorMessage = `Invalid arguments for tool "${request.tool}": ${errorDetails}`;
        } else {
          errorMessage = `Invalid arguments for tool "${request.tool}": ${validationError.message}`;
        }
        await this.writeErrorResponse(sandbox, requestId, errorMessage);
        return;
      }

      // Execute the real tool
      let toolResult: any;
      try {
        console.log(`[PTC] Executing tool: ${request.tool} with args:`, JSON.stringify(request.args, null, 2));
        toolResult = await toolEntry.tool.invoke(request.args);
        console.log('[PTC] Tool result:', JSON.stringify(toolResult, null, 2).substring(0, 500));
      } catch (toolError: any) {
        console.error('[PTC] Tool execution error:', toolError);
        await this.writeErrorResponse(sandbox, requestId, `Tool "${request.tool}" execution failed: ${toolError.message}`);
        return;
      }

      // Write response file
      await sandbox.files.write(
        `/ptc/responses/${requestId}.json`,
        JSON.stringify({ requestId, result: toolResult, success: true })
      );
      console.log(`[PTC] Response written for request: ${requestId}`);
    } catch (error: any) {
      console.error(`[PTC] Error handling tool request ${requestId}:`, error);
      await this.writeErrorResponse(sandbox, requestId, `Failed to process tool request: ${error.message}`);
    }
  }

  /**
   * Write error response file
   */
  private async writeErrorResponse(
    sandbox: Sandbox,
    requestId: string,
    errorMessage: string
  ): Promise<void> {
    try {
      await sandbox.files.write(
        `/ptc/responses/${requestId}.json`,
        JSON.stringify({ requestId, success: false, error: errorMessage })
      );
    } catch (error) {
      console.error(`[PTC] Failed to write error response for ${requestId}:`, error);
    }
  }

  /**
   * Execute TypeScript code in E2B sandbox with persistent process and streaming
   */
  async execute(options: { code: string }): Promise<PTCExecuteResponse> {
    let sandbox: Sandbox | null = null;
    let command: any = null;
    
    try {
      console.log('[PTC] Creating E2B sandbox...');
      // Create E2B sandbox (default template)
      sandbox = await Sandbox.create({
        apiKey: this.e2bApiKey,
      });
      console.log('[PTC] Sandbox created:', sandbox.sandboxId);

      // Generate and write files
      console.log('[PTC] Generating files...');
      const indexFile = this.generateIndexFile();
      const runtimeFile = this.generateRuntimeFile();
      
      // Generate main file - this may throw if code has syntax issues
      let mainFile: string;
      try {
        mainFile = this.generateMainFile(options.code);
      } catch (error: any) {
        // If code generation fails (e.g., unbalanced braces), return error immediately
        return {
          success: false,
          error: error.message || 'Failed to generate code: ' + String(error),
        };
      }

      console.log('[PTC] Generated main.ts file:');
      console.log(mainFile);
      console.log('[PTC] --- End of main.ts ---');

      console.log('[PTC] Writing files to sandbox...');
      // Write files to sandbox
      await sandbox.files.write('/ptc/index.ts', indexFile);
      await sandbox.files.write('/ptc/ptc_runtime.ts', runtimeFile);
      await sandbox.files.write('/ptc/main.ts', mainFile);
      await sandbox.files.write('/ptc/cache.json', '{}');
      
      // Create request/response directories
      await sandbox.commands.run('mkdir -p /ptc/requests /ptc/responses');
      console.log('[PTC] Files written successfully');

      // Start process in background with streaming
      console.log('[PTC] Starting background process: npx tsx /ptc/main.ts');
      
      if (!sandbox) {
        return {
          success: false,
          error: 'Sandbox creation failed',
        };
      }
      
      let stdoutBuffer = '';
      let stderrBuffer = '';
      let toolCallCount = 0;
      let finalResult: PTCExecuteResponse | null = null;
      let processError: Error | null = null;
      
      // Create promise to wait for completion
      let resolveCompletion: (result: PTCExecuteResponse) => void;
      let rejectCompletion: (error: Error) => void;
      const completionPromise = new Promise<PTCExecuteResponse>((resolve, reject) => {
        resolveCompletion = resolve;
        rejectCompletion = reject;
      });
      
      // Start command in background with streaming
      const cmdPromise = sandbox.commands.run('npx tsx /ptc/main.ts', {
        background: true,
        onStdout: (data: string) => {
          stdoutBuffer += data;
          console.log('[PTC] stdout chunk:', data.substring(0, 200));
          
          // Check for tool request markers
          const toolRequestMatch = stdoutBuffer.match(/__PTC_TOOL_REQUEST__([^\n]+)/);
          if (toolRequestMatch) {
            const requestId = toolRequestMatch[1].trim();
            toolCallCount++;
            
            // Safety check: prevent excessive tool calls
            if (toolCallCount > this.maxRecursionLimit) {
              console.error(`[PTC] Maximum tool call limit (${this.maxRecursionLimit}) reached.`);
              if (command) {
                command.kill().catch(console.error);
              }
              resolveCompletion({
                success: false,
                error: `Execution exceeded maximum tool call limit (${this.maxRecursionLimit}). This may indicate an infinite loop or excessive tool calls.`,
              });
              return;
            }
            
            // Handle tool request asynchronously
            if (sandbox) {
              this.handleToolRequest(requestId, sandbox).catch((error) => {
                console.error(`[PTC] Error handling tool request ${requestId}:`, error);
              });
            }
            
            // Remove processed marker from buffer
            stdoutBuffer = stdoutBuffer.replace(/__PTC_TOOL_REQUEST__[^\n]+\n?/, '');
          }
          
          // Check for final result marker
          const finalMatch = stdoutBuffer.match(/__PTC_FINAL__(.+)/);
          if (finalMatch) {
            try {
              const result = JSON.parse(finalMatch[1]);
              console.log('[PTC] Final result detected');
              finalResult = { success: true, result };
              if (command) {
                command.kill().catch(console.error);
              }
              resolveCompletion(finalResult);
            } catch (parseError: any) {
              console.error('[PTC] Failed to parse final result:', parseError);
              if (command) {
                command.kill().catch(console.error);
              }
              resolveCompletion({
                success: false,
                error: `Failed to parse final result: ${parseError.message}`,
              });
            }
          }
          
          // Check for error marker
          const errorMatch = stdoutBuffer.match(/__PTC_ERROR__(.+)/);
          if (errorMatch) {
            try {
              const errorData = JSON.parse(errorMatch[1]);
              console.log('[PTC] Error marker detected');
              finalResult = {
                success: false,
                error: errorData.message || 'Unknown error',
              };
              if (command) {
                command.kill().catch(console.error);
              }
              resolveCompletion(finalResult);
            } catch (parseError: any) {
              console.error('[PTC] Failed to parse error data:', parseError);
              if (command) {
                command.kill().catch(console.error);
              }
              resolveCompletion({
                success: false,
                error: `Error in sandbox: ${stderrBuffer || stdoutBuffer}`,
              });
            }
          }
        },
        onStderr: (data: string) => {
          stderrBuffer += data;
          console.log('[PTC] stderr chunk:', data.substring(0, 200));
        },
      });
      
      // Handle command promise
      cmdPromise.then(async (cmd) => {
        command = cmd;
        
        try {
          // Wait for command to complete
          const result = await cmd.wait();
          
          // Command completed - check if we already have a result
          if (finalResult) {
            return; // Already resolved
          }
          
          // Check exit code
          if (result.exitCode !== 0) {
            // First check if there's an error marker in stdout (runtime errors from tool calls)
            const errorMarkerMatch = stdoutBuffer.match(/__PTC_ERROR__(.+)/);
            if (errorMarkerMatch) {
              try {
                const errorData = JSON.parse(errorMarkerMatch[1]);
                resolveCompletion({
                  success: false,
                  error: errorData.message || 'Unknown error',
                });
                return;
              } catch (parseError) {
                // Fall through to compiler error parsing
              }
            }
            
            // If no error marker, parse compiler errors
            const parsedError = this.parseCompilerError(stderrBuffer, stdoutBuffer);
            resolveCompletion({
              success: false,
              error: parsedError,
            });
          } else {
            // Command succeeded but no final marker - unexpected
            resolveCompletion({
              success: false,
              error: `Process completed but no final result marker found. stdout: ${stdoutBuffer.substring(0, 1000)}`,
            });
          }
        } catch (error: any) {
          processError = error;
          if (finalResult) {
            return; // Already resolved
          }
          
          // Check for timeout
          if (error.message && error.message.includes('timed out')) {
            resolveCompletion({
              success: false,
              error: `Command execution timed out after ${this.timeoutMs}ms.`,
            });
          } else {
            // Parse error from buffers
            const parsedError = this.parseCompilerError(stderrBuffer, stdoutBuffer);
            resolveCompletion({
              success: false,
              error: parsedError || error.message || 'Unknown error',
            });
          }
        }
      }).catch((error) => {
        if (!finalResult) {
          rejectCompletion(error);
        }
      });
      
      // Apply timeout if specified
      let executionPromise = completionPromise;
      if (this.timeoutMs !== undefined) {
        executionPromise = Promise.race([
          completionPromise,
          new Promise<PTCExecuteResponse>((_, reject) => {
            setTimeout(() => {
              if (command) {
                command.kill().catch(console.error);
              }
              reject(new Error(`Execution timed out after ${this.timeoutMs}ms`));
            }, this.timeoutMs);
          }),
        ]).catch((error) => {
          if (error.message && error.message.includes('timed out')) {
            return {
              success: false,
              error: `Execution timed out after ${this.timeoutMs}ms.`,
            } as PTCExecuteResponse;
          }
          throw error;
        }) as Promise<PTCExecuteResponse>;
      }
      
      // Wait for completion
      const result = await executionPromise;
      
      // Kill command if still running
      if (command) {
        try {
          await command.kill();
        } catch (killError) {
          console.error('[PTC] Error killing command:', killError);
        }
      }
      
      return result;
    } catch (error: any) {
      console.error('[PTC] Execution error:', error);
      console.error('[PTC] Error stack:', error.stack);
      
      // Kill command if running
      if (command) {
        try {
          await command.kill();
        } catch (killError) {
          console.error('[PTC] Error killing command:', killError);
        }
      }
      
      return {
        success: false,
        error: `Sandbox error: ${error.message || String(error)}${error.stack ? `\nStack: ${error.stack}` : ''}`,
      };
    } finally {
      // Always kill sandbox
      if (sandbox) {
        try {
          console.log('[PTC] Cleaning up sandbox...');
          await sandbox.kill();
          console.log('[PTC] Sandbox killed');
        } catch (closeError) {
          console.error('[PTC] Error killing sandbox:', closeError);
          // Ignore cleanup errors
        }
      }
    }
  }
}


