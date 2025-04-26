/**
 * @module mod
 *
 * Main entry point for the library to be published
 * Exports the library and all type definitions
 */
import logger from './utils/logger.ts'
import loadConfig from './config.ts'

await loadConfig({
  PROJECT_NAME: '{PROJECT_NAME}',
  PACKAGE_NAME: '{PACKAGE_NAME}',
  PACKAGE_DESCRIPTION: '{PACKAGE_DESCRIPTION}',
  PACKAGE_VERSION: '{PACKAGE_VERSION}',
}, logger)

// The main library to be published
export { Lib } from './lib.ts'

// Any types to be published along with the library
export type { LibConfig, LibRequest, LibResult } from './types.ts'
