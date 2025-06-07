/**
 * @module version-command
 * @description Command implementation for displaying the application version.
 *
 * This module provides a command that displays the current version of the
 * application, retrieving it from the loaded configuration.
 *
 * @example
 * ```ts
 * import versionCommand from "./commands/version.ts";
 *
 * // Execute directly
 * versionCommand.command();
 *
 * // Or register with a CommandRouter
 * const router = new CommandRouter({ version: versionCommand });
 * ```
 *
 * @see {@link CommandRouteDefinition} for command structure
 *
 * @beta
 * @version 0.0.1
 */
import { type Args, parseArgs } from 'jsr:@std/cli'
import type { CommandRouteDefinition } from '../utils/command-router.ts'
import logger from '../utils/logger.ts'
import loadConfig from '../config.ts'

const config = await loadConfig()

const commandRouteDefinition: CommandRouteDefinition = {
  name: 'version',
  command: command,
  description: 'Show version',
}

function command(): void {
  logger.print(`${config.PACKAGE_VERSION}`)
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args)
  await commandRouteDefinition.command({
    args,
    routes: [commandRouteDefinition],
  })
}

export { command, commandRouteDefinition }
export default commandRouteDefinition
