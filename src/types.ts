/**
 * @module types
 * @description Core type definitions for the deno-kit library
 */

import type { Args, ParseOptions } from '@std/cli'
/**
 * Arguments passed to a command's execution function
 */
type CommandOptions = {
  /** CLI arguments parsed by std/cli */
  args: Args
  /** Complete list of available command routes */
  routes: CommandDefinition[]
}

/**
 * Definition of a Deno-Kit CLI command
 */
type CommandDefinition = {
  name: string
  command: (params: CommandOptions) => Promise<void> | void
  description: string
  options?: ParseOptions
}

/**
 * Type guard to validate if a module exports a valid CommandDefinition.
 *
 * @param value - The value to check, typically a module's default export
 * @returns True if the value matches the CommandDefinition interface
 */
function isCommandDefinition(value: unknown): value is CommandDefinition {
  return (
    !!value &&
    typeof value === 'object' &&
    'name' in value &&
    typeof (value as CommandDefinition).name === 'string' &&
    'command' in value &&
    typeof (value as CommandDefinition).command === 'function' &&
    'description' in value &&
    typeof (value as CommandDefinition).description === 'string'
  )
}

/**
 * Template values interface for configuring workspace templates
 */
interface TemplateValues {
  /** Full package name including scope (e.g., "@deno/example") */
  PACKAGE_NAME: string

  /** Package scope with @ symbol (e.g., "@deno") */
  PACKAGE_SCOPE: string

  /** Semantic version number (e.g., "1.0.0") */
  PACKAGE_VERSION: string

  /** Author's full name (e.g., "John Doe") */
  PACKAGE_AUTHOR_NAME: string

  /** Author's email address (e.g., "john.doe@example.com") */
  PACKAGE_AUTHOR_EMAIL: string

  /** Short description of the package (e.g., "A modern HTTP client for Deno") */
  PACKAGE_DESCRIPTION: string

  /** GitHub username or organization without @ (e.g., "denoland") */
  PACKAGE_GITHUB_USER: string

  /** Current year for license and documentation (e.g., "2024") */
  YEAR: string

  /** Package name without scope (e.g., "example" from "@deno/example") */
  PROJECT_NAME: string

  /** Allow string indexing for dynamic template values */
  [key: string]: string
}

export type { CommandDefinition, CommandOptions, TemplateValues }
export { isCommandDefinition }
