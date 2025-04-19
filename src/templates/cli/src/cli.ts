#!/usr/bin/env -S deno run -A

/**
 * @module cli
 * @description Main entry point for the CLI
 * @see {@link https://jsr.io/@std/cli/doc/~/parseArgs}
 * @see {@link https://jsr.io/@std/cli/doc/parse-args/~/Args}
 * @see {@link https://jsr.io/@std/cli/doc/~/ParseOptions}
 */

import { type Args, parseArgs } from '@std/cli'
import { walk } from '@std/fs'
import { dirname, fromFileUrl, join } from '@std/path'
import type { CommandDefinition, CommandOptions } from './types.ts'
import logger from './utils/logger.ts'

/**
 * Dynamically loads command modules from the commands directory
 */
async function loadCommands(): Promise<CommandDefinition[]> {
  const commands: CommandDefinition[] = []
  const commandsDir = join(dirname(fromFileUrl(import.meta.url)), 'commands')

  try {
    for await (const entry of walk(commandsDir, {
      includeDirs: false,
      exts: ['.ts'],
      skip: [/\.disabled\.ts$/, /\.disabled$/],
    })) {
      try {
        // Convert the path to a file URL for import to avoid import map issues
        const fileUrl = `file://${entry.path}`
        const commandModule = await import(fileUrl)

        if (commandModule.default &&
            typeof commandModule.default === 'object' &&
            'name' in commandModule.default &&
            'command' in commandModule.default &&
            'description' in commandModule.default) {
          commands.push({
            ...commandModule.default,
            options: commandModule.default.options || {},
          })
        }
      } catch (err) {
        logger.warn(`Failed to load command from ${entry.path}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  } catch (err) {
    logger.error(`Failed to scan commands directory: ${err instanceof Error ? err.message : String(err)}`)
  }

  return commands
}

/**
 * Main entry point for the CLI
 */
export async function run(): Promise<void> {
  // Load all available commands
  const commands = await loadCommands()

  // Get command name from arguments
  const mainArgs : Args = parseArgs(Deno.args)
  const commandName = mainArgs._[0]?.toString()
  const command = commands.find((cmd) => cmd.name === commandName)

  if (command) {
    try {
      // Execute command with parsed arguments
      const commandOptions: CommandOptions = {
        args: parseArgs(
          commandName ? Deno.args.slice(Deno.args.indexOf(commandName) + 1) : [],
          command.options
        ),
        routes: commands
      }

      await command.command(commandOptions)
    } catch (error) {
      logger.error(`Error executing command: ${error instanceof Error ? error.message : String(error)}`)
      Deno.exit(1)
    }
  } else if (commandName) {
    logger.error(`Unknown command: ${commandName}`)
    logger.error('Run with "help" to see available commands')
    Deno.exit(1)
  } else {
    // Default to help if no command specified
    const helpCommand = commands.find(cmd => cmd.name === 'help')
    if (helpCommand) {
      await helpCommand.command({ args: mainArgs, routes: commands })
    } else {
      logger.error('No command specified and help command not found')
    }
    Deno.exit(0)
  }
}
