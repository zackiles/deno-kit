/**
 * @module mod
 *
 * Main entry point for the package.
 */
import cli from './cli.ts'
import logger from './utils/logger.ts'
import gracefulShutdown from './utils/graceful-shutdown.ts'

if (import.meta.main) {
  await gracefulShutdown.startAndWrap(cli, logger)
}

// Optional: publish the core library of the CLI
export { Lib } from './lib.ts'

// Optional: publish the core types of the CLI
export type { CommandRouteDefinition, CommandRouteOptions } from './utils/command-router.ts'
export type { LibConfig, LibRequest, LibResult } from './types.ts'
