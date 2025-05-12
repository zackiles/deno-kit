# {PACKAGE_NAME} Development Guide

## Build & Development Commands

- `deno task dev` - Run the development script
- `deno task test` - Run all tests
- `deno task pre-publish` - Format, lint, and type-check the codebase
- `deno task tag` - Run the tagging script for versioning
- `deno fmt` - Format the codebase
- `deno lint` - Lint the codebase
- `deno test --filter "test name"` - Run tests matching a specific description
- `deno test --coverage` - Run tests with coverage report

## Code Style Guidelines

- **Formatting**: 2 spaces indentation, 100 char line width, single quotes, no semicolons
- **Imports**: Use `jsr:` specifier for JSR packages, `import type` for types, and `@std/` for Deno standard libraries
- **TypeScript**: Strict type checking, explicit return types, prefer utility types over interfaces
- **Error Handling**: Use `try/catch` for async operations, avoid deeply nested error handling
- **Dependencies**: Use `deno add` to manage dependencies, prefer `@std/` libraries for common tasks
- **File Structure**: Keep files under 250 lines, organize by feature, use `src/` for source code and `test/` for tests
- **Testing**: Use `@std/assert`, descriptive test names, and arrange/act/assert pattern

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
- `deno.jsonc` Deno 2 configuration file with the projects source maps and Deno tasks.
  - IMPORTANT: Use deno tasks instead of `deno run` in this project. Examples: running a script in `scripts/`, starting a development environment, building a release etc...


## Git Workflow

- Write detailed commit messages focusing on the "why" rather than the "what" and using semantic Commit Messages.
- Run `deno fmt && deno lint && deno test` before committing changes
