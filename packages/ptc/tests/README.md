# PTC Package Tests

This directory contains unit tests for the `@gdrl/ptc` package.

## Setup

Tests require an E2B API key to be set in the environment:

```bash
export E2B_API_KEY=your_api_key_here
```

## Running Tests

```bash
# Run all tests once
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui
```

## Test Structure

- **`client.test.ts`**: Tests for the main `PTCClient` class
  - Tool catalog generation
  - Successful code execution (simple code, tool calls, loops, functions)
  - Error cases (syntax errors, invalid code)
  - Cache functionality
  - Code cleaning (removing imports, function wrappers)

- **`error-handling.test.ts`**: Tests for error parsing and handling
  - Syntax error parsing
  - Type error handling
  - Runtime error handling
  - Edge cases

- **`utils.test.ts`**: Tests for utility functions
  - `extractToolInfo`: Tool information extraction
  - `zodToTypeScript`: Zod schema to TypeScript conversion
  - `generateCacheKey`: Cache key generation

- **`utils.ts`**: Test utilities and mock tools
  - Mock tools for testing
  - Helper functions

## Test Coverage

Tests cover:
- ✅ Successful code execution
- ✅ Single and multiple tool calls
- ✅ Code with loops and functions
- ✅ Syntax error detection and parsing
- ✅ Runtime error handling
- ✅ Cache functionality
- ✅ Code cleaning (import removal, function wrapper removal)
- ✅ Utility functions

## Notes

- Tests that require E2B sandbox are skipped if `E2B_API_KEY` is not set
- E2B sandbox operations can take 30-60 seconds, so tests have extended timeouts
- Tests use real E2B sandboxes, so they will consume API credits

