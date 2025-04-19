/**
 * @module mod
 *
 * Main entry point for the package.
 */
import { run } from './cli.ts'
import gracefulShutdown from './utils/graceful-shutdown.ts'

if (import.meta.main) {
  try {
    gracefulShutdown.start()
    await run()
  } catch (error) {
    gracefulShutdown.triggerShutdown(error instanceof Error ? error.message : String(error))
    Deno.exit(1)
  }
}

// Optionally publish the core library of the CLI
export { Lib } from './lib.ts'

// Optionally publish the core types of the CLI
export type { CommandDefinition, CommandOptions, LibConfig, LibRequest, LibResult } from './types.ts'
