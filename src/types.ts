/**
 * @module types
 * @description Core type definitions for the deno-kit library
 */

/**
 * Base configuration properties without the DENO_KIT_ prefix
 */
type DenoKitRequiredConfig = {
  /** Name of the kit package */
  NAME: string
  /** Version of the kit package */
  VERSION: string
  /** Current execution environment (development, production, or test) */
  ENV: string
  /** GitHub repository name (e.g., "zackiles/deno-kit") */
  GITHUB_REPO: string
  /** Name of the workspace config file (e.g., "kit.json") */
  WORKSPACE_CONFIG_FILE_NAME: string
  /** Path to the deno-kit main module or CLI executable */
  PATH: string
  /** Comma-separated list of disabled commands. This is helpful when Deno-Kit is used in MCP Servers that need to limit tool calls/commands */
  DISABLED_COMMANDS: string
  /** Path to templates directory */
  TEMPLATES_PATH: string
  /** Path to workspace directory (where the user's project is located) */
  WORKSPACE_PATH: string
  /** Comma-separated list of supported project types */
  PROJECT_TYPES: string
  /** Log level for controlling verbosity (DEBUG, INFO, WARN, ERROR, SILENT) */
  LOG_LEVEL: string
}

/**
 * Template-specific configuration properties without the DENO_KIT_TEMPLATE_ prefix
 */
type DenoKitOptionalConfig = {
  /** Full package name including scope (e.g., "@deno/example") */
  PACKAGE_NAME?: string
  /** Package version */
  PACKAGE_VERSION?: string
  /** Author's full name */
  AUTHOR_NAME?: string
  /** Author's email address */
  AUTHOR_EMAIL?: string
  /** Short description of the package */
  DESCRIPTION?: string
  /** GitHub username or organization without @ */
  GITHUB_USER?: string
  /** Whether to create a GitHub repository */
  CREATE_GITHUB_REPO?: string
  /** Whether the GitHub repository should be public */
  GITHUB_REPO_PUBLIC?: string
}

/**
 * Hints to optional environment variables that may exist and could be used during runtime
 * These don't require prefixes as we're not trying to avoid collisions
 */
type EnvOptionalConfig = {
  GH_TOKEN?: string
}

/**
 * Configuration interface representing all environment variables used in deno-kit
 * Uses mapped types to add the DENO_KIT_ prefix to base properties
 */
type DenoKitConfig =
  & {
    [K in keyof DenoKitRequiredConfig as `DENO_KIT_${K}`]:
      DenoKitRequiredConfig[K]
  }
  & {
    [K in keyof DenoKitOptionalConfig as `DENO_KIT_TEMPLATE_${K}`]:
      DenoKitOptionalConfig[K]
  }
  & EnvOptionalConfig

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

  // Extract required keys by adding prefix to BaseConfig keys
  const requiredKeys = Object.keys({} as DenoKitRequiredConfig).map(
    (key) => `DENO_KIT_${key}` as keyof DenoKitConfig,
  )

  const missingKeys = requiredKeys.filter((key) =>
    !(key in config) ||
    typeof (config as Record<string, unknown>)[key] !== 'string' ||
    (config as Record<string, unknown>)[key] === ''
  )

  if (missingKeys.length > 0) {
    throw new Error(
      `Invalid configuration: missing or invalid required fields:\n${
        missingKeys.join('\n')
      }`,
    )
  }

  return true
}

// Export all types at the bottom of the file
export type { DenoKitConfig, TemplateValues }
export { assertDenoKitConfig }
