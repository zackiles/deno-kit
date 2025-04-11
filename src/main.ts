/**
 * Main entry point for the Deno-Kit CLI.
 *
 * @module
 * @see {@link https://jsr.io/@std/cli/doc/~/parseArgs}
 * @see {@link https://jsr.io/@std/cli/doc/parse-args/~/Args}
 * @see {@link https://jsr.io/@std/cli/doc/~/ParseOptions}
 */
import { walk } from '@std/fs'
import { dirname, fromFileUrl, join } from '@std/path'
import { type Args, parseArgs } from '@std/cli'
import logger from './utils/logger.ts'
import loadConfig from './config.ts'
import gracefulShutdown from './utils/graceful-shutdown.ts'
import { type CommandDefinition, type CommandOptions, isCommandDefinition } from './types.ts'

const CLI_NAME = 'Deno-Kit'
const config = await loadConfig()
console.log(config)

/**
 * Loads and manages command definitions from the commands directory.
 * Handles command loading, validation, and routing.
 */
async function loadCommands(defaultCommand: string): Promise<{
  routes: CommandDefinition[]
  getRoute: (args: unknown[]) => CommandDefinition | undefined
  getOptions: (route: CommandDefinition) => Args
}> {
  const routes: CommandDefinition[] = []

  try {
    // Load and process command modules
    const commandsDir = join(dirname(fromFileUrl(import.meta.url)), 'commands')
    for await (
      const entry of walk(commandsDir, {
        includeDirs: false,
        exts: ['.ts'],
        skip: [/\.disabled\.ts$/, /\.disabled$/],
      })
    ) {
      try {
        // Import the command directly using its full path
        const commandModule = await import(entry.path)

        // Add valid command to routes
        if (commandModule.default && isCommandDefinition(commandModule.default)) {
          routes.push({
            ...commandModule.default,
            options: commandModule.default.options || {},
          })
        }
      } catch (err) {
        logger.warn(
          `Failed to load command from ${entry.path}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    }
  } catch (err) {
    logger.error(
      `Failed to scan commands directory: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  // Return routes and helper functions for command handling
  return {
    routes,
    getRoute: (args: unknown[]) => {
      if (args.length > 0) {
        const match = routes.find((r) => r.name === String(args[0])) ??
          (args.length > 1 ? routes.find((r) => r.name === String(args[1])) : undefined)
        if (match) return match
      }
      return routes.find((r) => r.name === defaultCommand)
    },
    getOptions: (route: CommandDefinition) => {
      const idx = Deno.args.findIndex((arg) => arg === route.name)
      return idx >= 0
        ? parseArgs(Deno.args.slice(idx + 1), route.options)
        : parseArgs([], route.options)
    },
  }
}

/**
 * Main entry point for the Deno-Kit CLI.
 *
 * @returns {Promise<void>}
 */
async function main(defaultCommand = 'help'): Promise<void> {
  const { routes, getRoute, getOptions } = await loadCommands(defaultCommand)
  const parsedArgs = parseArgs(Deno.args, {
    boolean: ['help', 'h'],
    alias: { h: 'help' },
  })

  const route = getRoute(parsedArgs._)

  if (!route) {
    logger.error(
      'Critical error: Default help command not found in routes.',
    )
    return Deno.exit(1)
  }

  try {
    const commandArgs: CommandOptions = {
      routes,
      args: getOptions(route),
    }
    await route.command(commandArgs)
  } catch (err) {
    throw new Error(
      `Failed to execute command: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

if (import.meta.main) {
  gracefulShutdown.start()

  try {
    await main()
  } catch (error) {
    gracefulShutdown.triggerShutdown(error instanceof Error ? error.message : String(error))
    Deno.exit(1)
  }
}

export { CLI_NAME, main }
export default main
