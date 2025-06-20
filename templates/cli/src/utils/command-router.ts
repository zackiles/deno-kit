/**
 * @module command-router
 * @description CLI Command Router for handling command routing and execution.
 *
 * This module provides a flexible command routing system for CLI applications.
 * It handles parsing arguments, matching commands, and executing the appropriate
 * handlers with their options.
 *
 * @example
 * ```ts
 * import CommandRouter from "./utils/command-router.ts";
 *
 * // Define commands
 * const commands = {
 *   hello: {
 *     name: "hello",
 *     description: "Greets the user",
 *     command: ({ args }) => {
 *       console.log(`Hello, ${args.name || "world"}!`);
 *     },
 *     options: {
 *       string: ["name"],
 *       default: { name: "world" }
 *     }
 *   }
 * };
 *
 * // Create router and execute command
 * const router = new CommandRouter(commands, "hello");
 * const route = router.getRoute(Deno.args);
 * const options = router.getOptions(route);
 * await route.command(options);
 * ```
 *
 * @see {@link CommandRouteDefinition} for command structure
 * @see {@link CommandRouteOptions} for execution options
 *
 * @beta
 * @version 0.0.1
 */
import { type Args, parseArgs, type ParseOptions } from 'jsr:@std/cli'

/**
 * Definition of a CLI command route
 */
type CommandRouteDefinition = {
  name: string
  command: (params: CommandRouteOptions) => Promise<void> | void
  description: string
  options?: ParseOptions
}

/**
 * Arguments passed to a command's execution function
 */
type CommandRouteOptions = {
  /** CLI arguments parsed by std/cli */
  args: Args
  /** Complete list of available command routes */
  routes: CommandRouteDefinition[]
}

/**
 * Handles CLI command routing and option parsing
 */
class CommandRouter {
  private routes: CommandRouteDefinition[]
  private defaultCommand: string

  /**
   * Creates a new CLI command router instance
   *
   * @param commands Object mapping command names to command definitions
   * @param defaultCommand The default command to use when no command is specified
   */
  constructor(
    commands: Record<string, CommandRouteDefinition>,
    defaultCommand = 'help',
  ) {
    this.routes = Object.values(commands)
    this.defaultCommand = defaultCommand
  }

  /**
   * Gets all available command routes
   */
  getRoutes(): CommandRouteDefinition[] {
    return this.routes
  }

  /**
   * Finds the appropriate command based on arguments
   *
   * @param args Command line arguments
   * @returns The matching command definition or the default command
   */
  getRoute(args: string[]): CommandRouteDefinition {
    // The '_' property contains positional arguments (non-flag values) from the command line
    // We pass these to getRoute to find the appropriate command definition
    const _args = parseArgs(args)._

    if (_args.length > 0) {
      const match = this.routes.find((r) => r.name === String(_args[0])) ??
        (_args.length > 1
          ? this.routes.find((r) => r.name === String(_args[1]))
          : undefined)
      if (match) return match
    }
    return this.routes.find((r) =>
      r.name === this.defaultCommand
    ) as CommandRouteDefinition
  }

  /**
   * Parses command options for a given route
   *
   * @param route The command definition
   * @returns Command options containing parsed arguments and routes
   */
  getOptions(route: CommandRouteDefinition): CommandRouteOptions {
    const idx = Deno.args.findIndex((arg) => arg === route.name)
    const args = idx >= 0
      ? parseArgs(Deno.args.slice(idx + 1), route.options)
      : parseArgs([], route.options)

    return {
      args,
      routes: this.routes,
    }
  }
}

export default CommandRouter
export type { CommandRouteDefinition, CommandRouteOptions }
