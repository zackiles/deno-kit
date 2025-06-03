#!/usr/bin/env -S deno run -A

// @ts-nocheck
// deno-lint-ignore-file -- JSDoc examples contain code-like content that triggers false positives

/**
 * @module test
 *
 * A flexible test runner script that provides multiple ways to run tests in the project.
 * The script automatically handles the test/ directory prefix and supports various test path formats.
 *
 * Features:
 * - Run all tests in the project
 * - Run a single test file (with or without .test.ts extension)
 * - Run all tests in a directory
 * - Run tests matching a glob pattern
 * - Pass additional arguments to the test command (like --filter)
 *
 * Examples:
 *
 * # Run all tests
 * ```
 * deno task test
 * ```
 *
 * # Run specific test file (multiple formats)
 * ```
 * deno task test workspace.test.ts     # Full name
 * deno task test workspace            # Short name (auto-adds .test.ts)
 * deno task test utils/config.test.ts # Full path
 * ```
 *
 * # Run all tests in a directory
 * ```
 * deno task test workspace  # All tests in test/workspace/
 * ```
 *
 * # Run tests using glob patterns
 * ```
 * deno task test 'workspace/&ast;&ast;/&ast;.test.ts'
 * deno task test 'workspace/utils/&ast;.test.ts'
 * ```
 *
 * # Run with additional arguments
 * ```
 * deno task test workspace --filter "test name"
 * deno task test workspace --coverage
 * ```
 *
 * @see https://jsr.io/@std/fs/doc/expand-glob/~/expandGlob - Used for resolving glob patterns
 * @see https://jsr.io/@std/path/doc/is-glob - Used for detecting glob patterns
 * @see https://jsr.io/@std/fs/doc/expand-glob/~/ExpandGlobOptions - Options for glob expansion
 */

import { join } from '@std/path'
import { exists } from '@std/fs'
import { expandGlob } from '@std/fs/expand-glob'
import { isGlob } from '@std/path/is-glob'
import logger, { LogLevel } from '../src/utils/logger.ts'
import loadConfig from '../src/config.ts'

// Load configuration and configure logger based on environment
const config = await loadConfig()
if (config.DENO_ENV === 'development' || config.DEBUG === 'true') {
  logger.setLevel(LogLevel.DEBUG)
}

/**
 * Test runner script that simplifies running tests by automatically handling the test/ directory prefix.
 * Supports multiple test path formats:
 * 1. Full test names (workspace.test.ts)
 * 2. Short names (workspace)
 * 3. Directory tests (workspace -> test/workspace/*.test.ts)
 * 4. Full paths relative to test/ (workspace/subfolder/test.test.ts)
 * 5. Glob patterns relative to test/ (workspace/subfolder/*.test.ts)
 *
 * Examples:
 * ```
 * # Run all tests
 * deno run -A scripts/test.ts
 *
 * # Run specific test
 * deno run -A scripts/test.ts workspace.test.ts
 *
 * # Run test by name
 * deno run -A scripts/test.ts workspace
 *
 * # Run by full path
 * deno run -A scripts/test.ts workspace/subfolder/test.test.ts
 *
 * # Run by glob
 * deno run -A scripts/test.ts "workspace/subfolder/*.test.ts"
 *
 * # Run with filter
 * deno run -A scripts/test.ts workspace --filter "test name"
 * ```
 */

// Common command options for test runs
const cmdOptions = {
  stdout: 'inherit' as const,
  stderr: 'inherit' as const,
  env: {
    'DENO_ENV': 'test',
  },
}

/**
 * Runs a Deno test command with the given arguments
 */
const runTest = async (args: string[]) => {
  const cmd = new Deno.Command('deno', {
    args: [
      'test',
      '-A',
      // "--v8-flags=''",
      '--check',
      '--reload',
      ...args,
    ],
    ...cmdOptions,
  })
  const child = cmd.spawn()
  const { code } = await child.status
  return code
}

/**
 * Resolves a test file name or directory to its full path, trying multiple formats.
 * Also supports full paths and glob patterns relative to the test directory.
 */
const resolveTestPath = async (testName: string) => {
  // If it's a glob pattern, use it directly with test/ prefix
  if (isGlob(testName)) {
    const testPath = join('test', testName)
    const entries = expandGlob(testPath)
    const firstEntry = await entries[Symbol.asyncIterator]().next()
    if (!firstEntry.done) {
      return testPath // Return the glob pattern if matches were found
    }
    console.error(`Error: No files found matching glob pattern: ${testPath}`)
    return null
  }

  // Check if it's a full path relative to test/
  const fullPath = join('test', testName)
  if (await exists(fullPath)) {
    return fullPath
  }

  const possiblePaths = [
    join('test', testName), // As provided
    join('test', `${testName}.test.ts`), // Add .test.ts if missing
    join('test', testName.replace(/\.ts$/, '.test.ts')), // Handle if only .ts was provided
    join('test', testName), // Check if it's a directory
  ]

  // Check if it's a directory
  const dirPath = join('test', testName)
  const dirStat = await Deno.stat(dirPath).catch(() => null)
  if (dirStat?.isDirectory) {
    return join(dirPath, '*.test.ts') // Return glob pattern for all tests in directory
  }

  // Then check for specific test files
  for (const path of possiblePaths) {
    if (await exists(path)) {
      return path
    }
  }

  // If no test file found, show helpful error
  console.error(
    'Error: Test file, directory, or glob pattern not found. Tried:',
  )
  for (const path of possiblePaths) {
    console.error(`  - ${path}`)
  }
  console.error(`  - ${join('test', testName, '*.test.ts')} (as directory)`)
  console.error(`  - ${fullPath} (as full path)`)
  return null
}

async function main() {
  const args = Deno.args

  // If no arguments, run all tests
  if (args.length === 0) {
    const exitCode = await runTest(['test'])
    Deno.exit(exitCode)
  }

  // Get the first argument as the test name
  const [testName, ...remainingArgs] = args
  const testPath = await resolveTestPath(testName)

  if (!testPath) {
    Deno.exit(1)
  }

  // Run the test with all remaining arguments
  const exitCode = await runTest([testPath, ...remainingArgs])
  Deno.exit(exitCode)
}

if (import.meta.main) {
  main()
}
