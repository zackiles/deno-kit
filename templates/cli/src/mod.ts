/**
 * @module mod
 *
 * Main entry point for the package.
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
export { Lib } from './lib.ts'

// Optional: publish the core types of the CLI
export type { CommandRouteDefinition, CommandRouteOptions } from './utils/command-router.ts'
export type { LibConfig, LibRequest, LibResult } from './types.ts'
