/**
 * @module types
 * @description Core type definitions for the deno-kit library
 */

/**
 * Configuration interface representing all environment variables used in deno-kit
 */
interface DenoKitConfig {
  DENO_KIT_NAME: string
  /** Current execution environment (development, production, or test) */
  DENO_KIT_ENV: string
  /** GitHub repository name (e.g., "zackiles/deno-kit") */
  DENO_KIT_GITHUB_REPO: string
  /** Name of the workspace config file (e.g., "kit.json") */
  DENO_KIT_WORKSPACE_CONFIG_FILE_NAME: string
  /** Path to the deno-kit main module or CLI executable */
  DENO_KIT_PATH: string
  /** Comma-separated list of disabled commands. This is helpful when Deno-Kit is used in MCP Servers that need to limit tool calls/commands */
  DENO_KIT_DISABLED_COMMANDS: string
  /** Path to templates directory */
  DENO_KIT_TEMPLATES_PATH: string
  /** Path to workspace directory */
  DENO_KIT_WORKSPACE_PATH: string
  /** Comma-separated list of supported project types */
  DENO_KIT_PROJECT_TYPES: string
  /** Log level for controlling verbosity (DEBUG, INFO, WARN, ERROR, SILENT) */
  DENO_KIT_LOG_LEVEL: string
  /** Full package name including scope (e.g., "@deno/example") */
  DENO_KIT_TEMPLATE_PACKAGE_NAME?: string

  /** Package version */
  DENO_KIT_TEMPLATE_PACKAGE_VERSION?: string
  /** Author's full name */
  DENO_KIT_TEMPLATE_AUTHOR_NAME?: string
  /** Author's email address */
  DENO_KIT_TEMPLATE_AUTHOR_EMAIL?: string
  /** Short description of the package */
  DENO_KIT_TEMPLATE_DESCRIPTION?: string
  /** GitHub username or organization without @ */
  DENO_KIT_TEMPLATE_GITHUB_USER?: string
}

/**
 * Ensures an object matches the DenoKitConfig interface
 * @param config The object to validate
 * @returns True if valid, throws error if invalid
 * @throws {Error} with details about missing required configuration
 */
function assertDenoKitConfig(config: unknown): config is DenoKitConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('Configuration must be a non-null object')
  }

  const requiredKeys: (keyof DenoKitConfig)[] = [
    'DENO_KIT_NAME',
    'DENO_KIT_PATH',
    'DENO_KIT_GITHUB_REPO',
    'DENO_KIT_WORKSPACE_CONFIG_FILE_NAME',
    'DENO_KIT_DISABLED_COMMANDS',
    'DENO_KIT_ENV',
    'DENO_KIT_TEMPLATES_PATH',
    'DENO_KIT_WORKSPACE_PATH',
    'DENO_KIT_PROJECT_TYPES',
    'DENO_KIT_LOG_LEVEL',
  ]

  const missingKeys = requiredKeys.filter((key) =>
    !(key in config) ||
    typeof (config as Record<string, unknown>)[key] !== 'string' ||
    (config as Record<string, unknown>)[key] === ''
  )

  if (missingKeys.length > 0) {
    throw new Error(
      `Invalid configuration: missing or invalid required fields:\n${missingKeys.join('\n')}`,
    )
  }

  return true
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

// Export all types at the bottom of the file
export type { DenoKitConfig, TemplateValues }
export { assertDenoKitConfig }
