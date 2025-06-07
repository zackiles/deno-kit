/**
 * @module example-command
 * @description Template for creating new CLI commands.
 *
 * This module serves as a starting point for implementing new commands.
 * It demonstrates the basic structure of a command, including option parsing,
 * command execution, and standalone execution capability.
 *
 * @example
 * ```ts
 * import exampleCommand from "./commands/example.disabled.ts";
 *
 * // Execute directly with options
 * exampleCommand.command({
 *   args: { flag: true },
 *   routes: []
 * });
 *
 * // Or register with a CommandRouter
 * const router = new CommandRouter({ example: exampleCommand });
 * ```
 *
 * @see {@link CommandRouteDefinition} for command structure
 * @see {@link CommandRouteOptions} for execution options
 *
 * @beta
 * @version 0.0.1
 */
import { type Args, parseArgs } from 'jsr:@std/cli'
import type {
  CommandRouteDefinition,
  CommandRouteOptions,
} from '../utils/command-router.ts'
import logger from '../utils/logger.ts'
import loadConfig from '../config.ts'

const config = await loadConfig()

const commandRouteDefinition: CommandRouteDefinition = {
  name: 'example',
  command: command,
  description: 'An example command template',
  options: {
    boolean: ['flag'],
    alias: { f: 'flag' },
  },
}

function command({ args, routes }: CommandRouteOptions): void {
  logger.print(`Command ${commandRouteDefinition.name} executed`, {
    args,
    config,
    routes,
  })
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args, commandRouteDefinition.options)
  await commandRouteDefinition.command({
    args,
    routes: [commandRouteDefinition],
  })
}

export { command, commandRouteDefinition }
export default commandRouteDefinition
