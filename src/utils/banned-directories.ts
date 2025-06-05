/**
 * @module banned-directories
 *
 * Provides functionality to check if directory paths match system directories
 * or custom banned patterns that should be protected from modification.
 * Supports validation of single paths or multiple paths at once.
 *
 * @see https://jsr.io/@std/path/doc/~/globToRegExp
 */

import { dirname, join, resolve } from '@std/path'
import { globToRegExp } from '@std/path'
import { parse as parseJSONC } from '@std/jsonc'
import { terminal } from '../terminal/mod.ts'

/**
 * Represents the structure of banned directories configuration files
 * Maps platform names to arrays of directory patterns
 */
type BannedDirectoriesConfig = {
  windows: string[]
  darwin: string[]
  linux: string[]
}

/**
 * Supported platforms for banned directory configurations
 */
const PLATFORMS: Array<keyof BannedDirectoriesConfig> = [
  'windows',
  'darwin',
  'linux',
]

/**
 * Handler function type for custom directory validation
 * Returns true if the path is banned, false if allowed
 */
type BannedDirectoryHandler = (path: string) => Promise<boolean> | boolean

/**
 * Options for the loadBannedDirectories function
 */
type LoadBannedDirectoriesOptions = {
  defaultPath?: string
  customPath?: string
  customConfig?: BannedDirectoriesConfig | undefined
}

/**
 * Options for the isBannedDirectory function
 */
type IsBannedDirectoryOptions = {
  defaultDirectoriesConfig?: BannedDirectoriesConfig
  customDirectoriesConfig?: BannedDirectoriesConfig
  handler?: BannedDirectoryHandler
}

/**
 * Checks if a path matches any patterns in the provided array
 * Supports both glob patterns and direct path comparisons
 *
 * Supports complex glob patterns including character classes and regex syntax,
 * like matching any top-level directory or Windows root folders.
 *
 * @param pathToCheck - Normalized path to check against patterns
 * @param patterns - Array of glob or directory patterns to match against
 * @returns True if the path matches any pattern, false otherwise
 */
function checkPatternMatch(pathToCheck: string, patterns: string[]): boolean {
  const hasGlobChars = (pattern: string) =>
    pattern.includes('*') ||
    pattern.includes('?') ||
    pattern.includes('[') ||
    pattern.includes('{') ||
    pattern.includes('$') || // Support regex-style end marker
    pattern.includes('\\') // Support escaped characters in regex

  return patterns.some((pattern) => {
    if (hasGlobChars(pattern)) {
      return globToRegExp(pattern, { extended: true, globstar: true }).test(
        pathToCheck,
      )
    }

    const normalizedPattern = resolve(pattern)
    return pathToCheck.startsWith(normalizedPattern) ||
      normalizedPattern.startsWith(pathToCheck)
  })
}

/**
 * Checks if directory paths match system directories or banned patterns
 *
 * This function determines if paths match any known system directory patterns
 * for the current operating system.
 *
 * @param paths - A single directory path or array of paths to check
 * @param options - Configuration options
 * @returns True if any path matches a banned directory pattern, false otherwise
 */
async function isBannedDirectory(
  paths: string | string[],
  options: IsBannedDirectoryOptions = {},
): Promise<boolean> {
  const { defaultDirectoriesConfig, customDirectoriesConfig, handler } = options
  const pathsArray = Array.isArray(paths) ? paths : [paths]
  const bannedPatterns = await getConfig(
    defaultDirectoriesConfig,
    customDirectoriesConfig,
  )

  for (const path of pathsArray) {
    if (checkPatternMatch(path, bannedPatterns)) {
      terminal.debug(
        'BANNED PATH',
        path,
        'paths',
        pathsArray,
        'BANNED PATTERNS',
        bannedPatterns,
      )
      return true
    }

    if (handler && await Promise.resolve(handler(path))) {
      return true
    }
  }

  return false
}

/**
 * Gets a consolidated array of all unique glob patterns and paths
 * used to match banned absolute paths of directories from the default and custom configuration.
 *
 * @param defaultDirectoriesConfig - Optional default system directories configuration
 * @param customDirectoriesConfig - Optional custom directories configuration
 * @returns Array of unique paths or glob patterns used to match banned absolute paths of directories
 */
async function getConfig(
  defaultDirectoriesConfig?: BannedDirectoriesConfig,
  customDirectoriesConfig?: BannedDirectoriesConfig,
): Promise<string[]> {
  const bannedDirectoryPatterns = defaultDirectoriesConfig
    ? mergeConfigs(defaultDirectoriesConfig, customDirectoriesConfig || {})
    : await loadBannedDirectories({ customConfig: customDirectoriesConfig })

  const platformKey = Deno.build.os as keyof BannedDirectoriesConfig
  return bannedDirectoryPatterns[platformKey] || []
}

/**
 * Loads banned directory patterns from default and custom JSONC files
 *
 * @param options - Loading configuration
 * @returns An object mapping platform names to arrays of directory patterns with unique values
 * @throws Error if the default banned directories file cannot be loaded
 */
async function loadBannedDirectories(
  { defaultPath, customPath, customConfig }: LoadBannedDirectoriesOptions = {},
): Promise<BannedDirectoriesConfig> {
  const moduleDir = dirname(new URL(import.meta.url).pathname)
  const resolvedDefaultPath = defaultPath ||
    join(moduleDir, 'banned_directories_default.jsonc')
  const resolvedCustomPath = customPath ||
    join(moduleDir, 'banned_directories_custom.jsonc')

  // Create empty config with the correct type structure
  const emptyConfig = (): BannedDirectoriesConfig =>
    PLATFORMS.reduce((config, platform) => {
      config[platform] = []
      return config
    }, {} as BannedDirectoriesConfig)

  // Process a config file with appropriate error handling
  const processConfigFile = async (
    path: string,
    isRequired: boolean,
  ): Promise<BannedDirectoriesConfig> => {
    try {
      const result = await loadJsonFile(path)
      if (isRequired && !result) {
        throw new Error(`Required file not found: ${path}`)
      }
      return result || emptyConfig()
    } catch (error) {
      // Return empty config for non-existent optional files
      if (!isRequired && error instanceof Deno.errors.NotFound) {
        return emptyConfig()
      }

      // Add context for other errors in optional files
      if (
        !isRequired &&
        !(error instanceof Error && error.message.includes('Required file'))
      ) {
        throw new Error(
          `Failed to load banned directories from ${path}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        )
      }

      throw error
    }
  }

  // Load and merge configs
  const defaultDirs = await processConfigFile(resolvedDefaultPath, true)
  const customDirs = customConfig ??
    await processConfigFile(resolvedCustomPath, false)

  return mergeConfigs(defaultDirs, customDirs)
}

/**
 * Loads a JSONC file and parses its content
 *
 * @param path - Path to the JSONC file
 * @returns Parsed JSONC content or null if file doesn't exist
 * @private
 */
async function loadJsonFile(
  path: string,
): Promise<BannedDirectoriesConfig | null> {
  try {
    const content = await Deno.readTextFile(path)
    return parseJSONC(content) as BannedDirectoriesConfig
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return null
    }
    throw error
  }
}

/**
 * Merges two BannedDirectoriesConfig objects ensuring all values are unique
 *
 * @param defaultDirs - Default directories object
 * @param customDirs - Custom directories object
 * @returns Merged directories with unique values
 * @private
 */
function mergeConfigs(
  defaultDirs: BannedDirectoriesConfig,
  customDirs: Partial<BannedDirectoriesConfig>,
): BannedDirectoriesConfig {
  return PLATFORMS.reduce((result, platform) => {
    const defaultPlatformDirs = defaultDirs[platform] || []
    const customPlatformDirs = customDirs[platform] || []

    result[platform] = [
      ...new Set([...defaultPlatformDirs, ...customPlatformDirs]),
    ]
    return result
  }, {} as BannedDirectoriesConfig)
}

export { isBannedDirectory }
export type {
  BannedDirectoriesConfig,
  BannedDirectoryHandler,
  IsBannedDirectoryOptions,
}
