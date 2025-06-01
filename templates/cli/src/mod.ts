#!/usr/bin/env -S deno run -A
/**
 * @module mod
 * @description Main entry point for the CLI package.
 *
 * This module initializes the application by loading configuration,
 * setting up the CLI interface, and handling graceful shutdown.
 * It also exports the core library and types for external use.
 *
 * @example
 * ```ts
 * // Running as a CLI application
 * // deno run --allow-all mod.ts <command> [options]
 *
 * // Importing as a library
 * import { someFunction } from "{PACKAGE_NAME}";
 *
 * const result = someFunction();
 * console.log(result);
 * ```
 *
 * @see {@link cli} for command line interface implementation
 * @see {@link loadConfig} for configuration utilities
 *
 * @beta
 * @version 0.0.1
 */
import cli from './cli.ts'
import logger from './utils/logger.ts'
import loadConfig from './config.ts'
import gracefulShutdown from './utils/graceful-shutdown.ts'

await loadConfig({
  PROJECT_NAME: '{PROJECT_NAME}',
  PACKAGE_NAME: '{PACKAGE_NAME}',
  PACKAGE_DESCRIPTION: '{PACKAGE_DESCRIPTION}',
  PACKAGE_VERSION: '{PACKAGE_VERSION}',
}, logger)

if (import.meta.main) {
  await gracefulShutdown.startAndWrap(cli, logger)
}

// Optional: publish the core library of the CLI
export * from './lib.ts'

// Optional: publish the core types of the CLI
export type * from './types.ts'
