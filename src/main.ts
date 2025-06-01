/**
 * Main entry point for the Deno-Kit CLI.
 * Provides command routing and execution for the CLI interface.
 *
 * @module main
 * @see {@link https://jsr.io/@std/cli/doc/~/parseArgs} CLI argument parsing
 * @see {@link https://jsr.io/@std/cli/doc/parse-args/~/Args} CLI argument types
 * @see {@link https://jsr.io/@std/cli/doc/~/ParseOptions} CLI parsing options
 * @example
 * ```ts
 * import { main } from './main.ts'
 * await main() // Execute CLI command
 * ```
 */
import { getConfig } from './config.ts'
import logger from './utils/logger.ts'
import gracefulShutdown from './utils/graceful-shutdown.ts'
import CommandRouter from './utils/command-router.ts'
import type {
  CommandRouteDefinition,
  CommandRouteOptions,
} from './utils/command-router.ts'
import type { DenoKitConfig } from './types.ts'

const config = await getConfig() as DenoKitConfig

// Set log level based on config value from loadConfig
// This will have already incorporated any DENO_KIT_LOG_LEVEL env variable
if (config.DENO_KIT_LOG_LEVEL) {
  logger.setLogLevel(config.DENO_KIT_LOG_LEVEL)
}

/**
 * Static mapping of CLI commands to their implementations.
 * Commands are loaded using static imports for better tree-shaking.
 *
 * @see {@link ./commands/template.ts} Example command implementation
 */
const AVAILABLE_COMMANDS = {
  help: (await import('./commands/help.ts')).default,
  init: (await import('./commands/init.ts')).default,
  cli: (await import('./commands/cli.ts')).default,
  version: (await import('./commands/version.ts')).default,
  remove: (await import('./commands/remove.ts')).default,
  reset: (await import('./commands/reset.ts')).default,
  uninstall: (await import('./commands/uninstall.ts')).default,
  //template: (await import('./commands/template.ts')).default,
}

// Remove any commands that match DENO_KIT_DISABLED_COMMANDS
const COMMANDS: Record<string, CommandRouteDefinition> = Object.fromEntries(
  Object.entries(AVAILABLE_COMMANDS)
    .filter(([key]) => !config.DENO_KIT_DISABLED_COMMANDS.includes(key)),
)

/**
 * Loads and executes the appropriate CLI command.
 * Handles command routing, execution, and error handling.
 *
 * @throws {Error} When command execution fails or command not found
 * @returns {Promise<void>}
 */
async function main(): Promise<void> {
  const router = new CommandRouter(COMMANDS)
  const route: CommandRouteDefinition = router.getRoute(Deno.args)

  try {
    const options: CommandRouteOptions = router.getOptions(route)
    await route.command(options)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to execute command "${route.name}". ${message}`)
  }
}

if (import.meta.main) {
  await gracefulShutdown.startAndWrap(main, logger)
}
