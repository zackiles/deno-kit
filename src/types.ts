/**
 * @module types
 * @description Core type definitions for the deno-kit library
 */
import type { CommandRouteDefinition } from './utils/ command-router.ts'

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

  /** Project type (e.g., "Library", "CLI", "HTTP-Server") */
  PROJECT_TYPE: string

  /** Allow string indexing for dynamic template values */
  [key: string]: string
}

export type { TemplateValues }
export { isCommandDefinition }
