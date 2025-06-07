/**
 * @module help-command
 * @description Command implementation for displaying the help menu.
 *
 * This module provides a command that lists all available commands
 * with their descriptions, making it easier for users to navigate
 * the CLI application.
 *
 * @example
 * ```ts
 * import helpCommand from "./commands/help.ts";
 *
 * // Execute with routes
 * helpCommand.command({
 *   routes: [
 *     { name: "test", description: "Run tests" },
 *     { name: "build", description: "Build application" }
 *   ],
 *   args: {}
 * });
 *
 * // Or register with a CommandRouter
 * const router = new CommandRouter({ help: helpCommand });
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
  name: 'help',
  command: command,
  description: 'Display help menu',
}

function command({ routes }: CommandRouteOptions): void {
  logger.print(`${config.PACKAGE_NAME} - ${config.PACKAGE_DESCRIPTION}

Usage:
  ${config.PROJECT_NAME} [command] [options]

Commands:
${
    routes.map((cmd) => `  ${cmd.name.padEnd(10)} ${cmd.description}`).join(
      '\n',
    )
  }`)
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
