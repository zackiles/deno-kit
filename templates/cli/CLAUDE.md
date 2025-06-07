# {PACKAGE_NAME} Development Guide

## Build & Development Commands

- `deno task run:dev`:Run the development script
- `deno task test`: Run all tests
- `deno task test --filter "test name"`: Run a specific test
- `deno task check`:Format, lint, and type-check the codebase
- `deno task tag`: Run `scripts/tag.ts` to version and release
- `deno task build:hypermix`: Build repomix files to `.ai/state/` using hypermix
- `deno task build:docs` - Generate HTML documentation
- `deno task run:docs` - Serve documentation

## Code Style Guidelines

- **Formatting**: 2 spaces indentation, 80 char line width, single quotes, no
  semicolons
- **Imports**: Use `jsr:` specifier for JSR packages, `import type` for types,
  and `@std/` for Deno standard libraries
- **TypeScript**: Strict type checking, explicit return types, prefer utility
  types over interfaces
- **Error Handling**: Use `try/catch` for async operations, avoid deeply nested
  error handling
- **Dependencies**: Use `deno add` to manage dependencies, prefer `@std/`
  libraries for common tasks
- **File Structure**: Keep files under 250 lines, organize by feature, use
  `src/` for source code and `test/` for tests
- **Testing**: Use `@std/assert`, descriptive test names, and arrange/act/assert
  pattern

## Naming Conventions

- **kebab-case**: File and folder names
- **PascalCase**: Classes, interfaces, types
- **camelCase**: Variables, functions, methods
- **UPPER_SNAKE_CASE**: Constants
- **Test files**: `[filename].test.ts`

## File and Folder Structure

- `src/` Main source code
- `scripts/` Build and development scripts
- `test/` Tests for files in `src/` or `scripts/`
- `deno.jsonc` Deno 2 configuration file with the projects source maps and Deno
  tasks.
  - IMPORTANT: Use deno tasks instead of `deno run` in this project. Examples:
    running a script in `scripts/`, starting a development environment, building
    a release etc...

## Git Workflow

- Write detailed commit messages focusing on the "why" rather than the "what"
  and using semantic Commit Messages.
- Run `deno fmt && deno lint && deno test` before committing changes
