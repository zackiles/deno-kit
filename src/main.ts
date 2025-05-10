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
import { loadConfig } from './config.ts'
import logger, { LogLevel } from './utils/logger.ts'
import gracefulShutdown from './utils/graceful-shutdown.ts'
import CommandRouter from './utils/command-router.ts'
import type { CommandRouteDefinition, CommandRouteOptions } from './utils/command-router.ts'

const CLI_NAME = 'Deno-Kit'
const config = await loadConfig()

// Convert numeric log level to LogLevel enum
const logLevel = (() => {
  const numericLevel = config.DENO_KIT_LOG_LEVEL as number
  switch (numericLevel) {
    case 0:
      return LogLevel.DEBUG
    case 1:
      return LogLevel.INFO
    case 2:
      return LogLevel.WARN
    case 3:
      return LogLevel.ERROR
    case 4:
      return LogLevel.SILENT
    default:
      return LogLevel.INFO
  }
})()

logger.setConfig({ level: logLevel })

/**
 * Static mapping of CLI commands to their implementations.
 * Commands are loaded using static imports for better tree-shaking.
 *
 * @see {@link ./commands/template.ts} Example command implementation
 */
const COMMANDS: Record<string, CommandRouteDefinition> = {
  help: (await import('./commands/help.ts')).default,
  init: (await import('./commands/init.ts')).default,
  cli: (await import('./commands/cli.ts')).default,
  version: (await import('./commands/version.ts')).default,
  remove: (await import('./commands/remove.ts')).default,
  reset: (await import('./commands/reset.ts')).default,
  // Temporarily disabled
  // server: (await import('./commands/reset.ts')).default,
}

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

  if (!route) {
    throw new Error('Command not found and no help command available')
  }

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

export { CLI_NAME, main }
export default main
