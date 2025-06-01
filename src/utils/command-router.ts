/**
 * @module command-router
 * @description CLI Command Router for handling command routing and execution.
 */
import { type Args, parseArgs, type ParseOptions } from '@std/cli'

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
 * Type guard to validate if a module exports a valid CommandDefinition.
 *
 * @param value - The value to check, typically a module's default export
 * @returns True if the value matches the CommandDefinition interface
 */
function isCommandDefinition(value: unknown): value is CommandRouteDefinition {
  return (
    !!value &&
    typeof value === 'object' &&
    'name' in value &&
    typeof (value as CommandRouteDefinition).name === 'string' &&
    'command' in value &&
    typeof (value as CommandRouteDefinition).command === 'function' &&
    'description' in value &&
    typeof (value as CommandRouteDefinition).description === 'string'
  )
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
   * Gets all command names from available routes
   */
  getCommandNames(): string[] {
    return this.routes.map((route) => route.name)
  }

  /**
   * Finds the appropriate command based on arguments
   *
   * @param args Command line arguments
   * @returns The matching command definition or the default command
   */
  getRoute(args: string[]): CommandRouteDefinition {
    // Parse arguments to check for flags and positional arguments
    const parsedArgs = parseArgs(args)
    const positionalArgs = parsedArgs._

    // Check for --help or --version flags when no positional arguments exist
    if (positionalArgs.length === 0) {
      if (parsedArgs.help) {
        return this.routes.find((r) =>
          r.name === 'help'
        ) as CommandRouteDefinition
      }
      if (parsedArgs.version) {
        return this.routes.find((r) =>
          r.name === 'version'
        ) as CommandRouteDefinition
      }
    }

    // Original logic for finding route by positional arguments
    if (positionalArgs.length > 0) {
      const match = this.routes.find((r) =>
        r.name === String(positionalArgs[0])
      ) ??
        (positionalArgs.length > 1
          ? this.routes.find((r) => r.name === String(positionalArgs[1]))
          : undefined)
      if (match) return match
    }

    // Fallback to default command
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
export { CommandRouter, isCommandDefinition }
export type { CommandRouteDefinition, CommandRouteOptions }
