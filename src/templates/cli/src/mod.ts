/**
 * @module mod
 *
 * Main entry point for the package.
 */
import { run } from './cli.ts'
import logger from './utils/logger.ts'
import gracefulShutdown from './utils/graceful-shutdown.ts'

if (import.meta.main) {
  await gracefulShutdown.startAndWrap(run(), logger)
}

// Optionally publish the core library of the CLI
export { Lib } from './lib.ts'

// Optionally publish the core types of the CLI
export type { CommandDefinition, CommandOptions, LibConfig, LibRequest, LibResult } from './types.ts'
