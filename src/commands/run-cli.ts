#!/usr/bin/env -S deno run --allow-all

/**
 * @module run-cli
 * @description Command-line interface for the Deno starter kit that uses @deno-kit/module-to-cli
 * to automatically generate a CLI based on the exported module.
 *
 * The CLI provides an interface to the core library functionality by leveraging the module-to-cli
 * library which dynamically creates a CLI from your module exports.
 *
 * @example
 * ```bash
 * # Run with no arguments to see the help menu
 * deno task kit cli
 *
 * # Or run with specific commands and arguments
 * deno task kit cli create --firstName="John" --lastName="Doe"
 * ```
 *
 * For full documentation on the starter kit and its features, see the README.md
 */
import { join } from '@std/path'
//import { Logger } from '../logger.ts'
import { parseArgs } from '@std/cli'

//const logger = Logger.get('cli')
const logger = console

/**
 * Main CLI function. Uses @deno-kit/module-to-cli to dynamically generate a CLI
 * based on the exported module in src/mod.ts.
 */
async function runCLI(): Promise<void> {
  const modulePath = join('src', 'mod.ts')

  // Handle different execution contexts (deno task, npx, direct)
  const firstArg = Deno.args[0] || ''
  const isDenoTask = firstArg.startsWith('task:')
  const isNpxRun = firstArg.includes('npx')
  const adjustedArgs = isDenoTask || isNpxRun ? Deno.args.slice(1) : Deno.args

  // Parse CLI arguments
  const parsedArgs = parseArgs(adjustedArgs)
  const showHelp = parsedArgs._.length === 0 || parsedArgs.help

  // Command to run the module-to-cli
  const baseCommand = [
    'deno',
    'run',
    '-A',
    'jsr:@deno-kit/module-to-cli',
    modulePath,
  ]

  // If no arguments provided or help flag, show the help menu
  if (showHelp) {
    const command = new Deno.Command(baseCommand[0], {
      args: [...baseCommand.slice(1), '--help'],
    })

    const { stdout, stderr } = await command.output()

    if (stderr.length > 0) {
      const errorMessage = new TextDecoder().decode(stderr)
      logger.error(errorMessage)
      Deno.exit(1)
    }

    logger.info(new TextDecoder().decode(stdout))
  } else {
    // Pass all arguments directly to module-to-cli
    const command = new Deno.Command(baseCommand[0], {
      args: [...baseCommand.slice(1), ...adjustedArgs],
    })

    const { stdout, stderr } = await command.output()

    if (stderr.length > 0) {
      const errorMessage = new TextDecoder().decode(stderr)
      logger.error(errorMessage)
      Deno.exit(1)
    }

    logger.info(new TextDecoder().decode(stdout))
  }
}

if (import.meta.main) {
  runCLI()
}

export { runCLI }
