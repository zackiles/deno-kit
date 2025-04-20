/**
 * Main entry point for the Deno-Kit CLI.
 *
 * @module
 * @see {@link https://jsr.io/@std/cli/doc/~/parseArgs}
 * @see {@link https://jsr.io/@std/cli/doc/parse-args/~/Args}
 * @see {@link https://jsr.io/@std/cli/doc/~/ParseOptions}
 */
import loadConfig from './config.ts'
import logger from './utils/logger.ts'
import gracefulShutdown from './utils/graceful-shutdown.ts'
import CLIRouter from './utils/cli-router.ts'
import type { CLIRouteDefinition, CLIRouteOptions } from './types.ts'

const CLI_NAME = 'Deno-Kit'
await loadConfig()

/**
 * Static mapping of commands
 * We explicitly import all command modules using static imports.
 * See commands/template.ts for an example command.
 */
const COMMANDS: Record<string, CLIRouteDefinition> = {
  help: (await import('./commands/help.ts')).default,
  init: (await import('./commands/init.ts')).default,
  cli: (await import('./commands/cli.ts')).default,
  version: (await import('./commands/version.ts')).default,
  remove: (await import('./commands/remove.ts')).default,
  reset: (await import('./commands/reset.ts')).default,
  // Temporarily disabled
  //server: (await import('./commands/reset.ts')).default,
}

/**
 * Loads and executes the appropriate command.
 *
 * @returns {Promise<void>}
 */
async function main(): Promise<void> {
  const router: CLIRouter = new CLIRouter(COMMANDS)
  const route: CLIRouteDefinition = router.getRoute(Deno.args)

  if (route) {
    try {
      const routeOptions: CLIRouteOptions = router.getOptions(route)
      await route.command(routeOptions)
    } catch (err) {
      throw new Error(
        `Failed to execute command "${route.name}". ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  } else {
    throw new Error('Command not found and no help command available')
  }
}

if (import.meta.main) {
  await gracefulShutdown.startAndWrap(main, logger)
}

export { CLI_NAME, main }
export default main
