/**
 * Main entry point for the Deno-Kit CLI.
 *
 * @module
 * @see {@link https://jsr.io/@std/cli/doc/~/parseArgs}
 * @see {@link https://jsr.io/@std/cli/doc/parse-args/~/Args}
 * @see {@link https://jsr.io/@std/cli/doc/~/ParseOptions}
 */
import { parseArgs } from '@std/cli/parse-args'
import { walk } from '@std/fs'
import { basename, join } from '@std/path'
import type { Args } from '@std/cli'

import resolveResourcePath from './utils/resource-path.ts'
import logger from './utils/logger.ts'
import gracefulShutdown from './utils/graceful-shutdown.ts'
import { type CommandArgs, type CommandDefinition, isCommandDefinition } from './types.ts'
import {
  create as createWorkspace,
  isConfigFile,
  load as loadWorkspace,
  type Workspace,
} from './workspace.ts'
import { getPackageForPath } from './utils/package-info.ts'

const CLI_NAME = 'Deno-Kit'

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
    const commandsDir = join(new URL(import.meta.url).pathname, '..', 'commands')
    for await (
      const entry of walk(commandsDir, {
        includeDirs: false,
        exts: ['.ts'],
        skip: [/\.disabled$/],
      })
    ) {
      try {
        // Try importing the command with fallback
        const mod = await (async () => {
          try {
            return await import(`./commands/${basename(entry.path)}`)
          } catch {
            return await import(await resolveResourcePath(`src/commands/${basename(entry.path)}`))
          }
        })()

        // Add valid command to routes
        if (mod.default && isCommandDefinition(mod.default)) {
          routes.push({
            ...mod.default,
            options: mod.default.options || {},
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
    string: ['workspace'],
    boolean: ['help', 'h'],
    alias: { h: 'help' },
    //default: { 'workspace': Deno.cwd() },
    default: { 'workspace': '/Users/zacharyiles/dev/temp' },
  })
  const rawArgs = parsedArgs._

  const route = getRoute(rawArgs)
  let workspace: Workspace | undefined
  const packageInfo = await getPackageForPath(parsedArgs.workspace, {
    packageConfigFiles: ['kit.json'],
  })

  if (!route) {
    logger.error(
      'Critical error: Default help command not found in routes.',
    )
    return Deno.exit(1)
  }

  if (route.name === 'setup') {
    workspace = await createWorkspace({
      workspacePath: parsedArgs.workspace,
      templatesPath: await resolveResourcePath('templates'),
      configFileName: 'kit.json',
    })
  } else if (route.name !== defaultCommand && route.name !== 'test') {
    // If this isn't the setup command or help command, get the current workspace
    if (!packageInfo || !isConfigFile(packageInfo)) {
      logger.error(
        `Invalid or no kit.json file found in workspace: ${parsedArgs.workspace}`,
      )
      return Deno.exit(1)
    }
    workspace = await loadWorkspace(packageInfo)
  }

  try {
    const commandArgs: CommandArgs = {
      routes,
      args: getOptions(route),
      ...(workspace && { workspace }),
    }
    await route.command(commandArgs)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Failed to execute command: ${errorMessage}`)
    throw error
  }
}

if (import.meta.main) {
  gracefulShutdown.start()

  try {
    await main()
  } catch (error) {
    gracefulShutdown.triggerShutdown(
      `Error in main execution: ${error instanceof Error ? error.message : String(error)}`,
    )
    Deno.exit(1)
  }
}

export { CLI_NAME, main }
export default main
