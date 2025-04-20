/**
 * CLI Router for handling command routing and execution.
 *
 * @module
 */
import { parseArgs } from '@std/cli'
import type { CLIRouteDefinition, CLIRouteOptions } from '../types.ts'

/**
 * Handles CLI command routing and option parsing
 */
class CLIRouter {
  private routes: CLIRouteDefinition[]
  private defaultCommand: string

  /**
   * Creates a new CLI router instance
   *
   * @param commands Object mapping command names to command definitions
   * @param defaultCommand The default command to use when no command is specified
   */
  constructor(commands: Record<string, CLIRouteDefinition>, defaultCommand = 'help') {
    this.routes = Object.values(commands)
    this.defaultCommand = defaultCommand
  }

  /**
   * Gets all available command routes
   */
  getRoutes(): CLIRouteDefinition[] {
    return this.routes
  }

  /**
   * Finds the appropriate command based on arguments
   *
   * @param args Command line arguments
   * @returns The matching command definition or the default command
   */
  getRoute(args: string[]): CLIRouteDefinition {
    // The '_' property contains positional arguments (non-flag values) from the command line
    // We pass these to getRoute to find the appropriate command definition
    const _args = parseArgs(args)._

    if (_args.length > 0) {
      const match = this.routes.find((r) => r.name === String(_args[0])) ??
        (_args.length > 1 ? this.routes.find((r) => r.name === String(_args[1])) : undefined)
      if (match) return match
    }
    return this.routes.find((r) => r.name === this.defaultCommand) as CLIRouteDefinition
  }

  /**
   * Parses command options for a given route
   *
   * @param route The command definition
   * @returns Command options containing parsed arguments and routes
   */
  getOptions(route: CLIRouteDefinition): CLIRouteOptions {
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

export default CLIRouter
