/**
 * @module resource-path
 * @description Resolves resource paths across different execution environments
 *
 * This module provides a reliable way to find resource directories whether the code
 * is running from a local development environment, from JSR registry, or as a compiled
 * executable.
 *
 * @example
 * ```ts
 * import { resolveResourcePath } from "./utils/resource-path.ts"
 *
 * // Get templates directory
 * const templatesDir = await resolveResourcePath("src/templates")
 *
 * // Get commands directory
 * const commandsDir = await resolveResourcePath("src/commands")
 *
 * // Now use the directories with fs operations
 * ```
 */

import { exists } from '@std/fs'
import { dirname, fromFileUrl, join, resolve } from '@std/path'

type ResourceSource = 'local' | 'entry' | 'module' | 'compiled' | 'fallback' | 'jsr' | 'env'

/**
 * Resource path resolution strategy result
 */
interface ResourcePathResult {
  /** Path to the resource directory */
  path: string
  /** Strategy used to resolve the path */
  source: ResourceSource
}

/**
 * Extracts JSR resource URL from the current module URL
 */
const extractJsrResourceUrl = (currentModuleUrl: string, normalizedPath: string): string | null => {
  // JSR URLs pattern: https://jsr.io/@scope/pkg/version/path or https://jsr.io/debug/@scope/pkg/path
  const jsrRegex = /jsr\.io\/(?:debug\/)?(@[^\/]+\/[^\/]+)(?:\/(\d+\.\d+\.\d+))?\/(.+)/
  const jsrMatch = currentModuleUrl.match(jsrRegex)

  if (jsrMatch) {
    // Explicitly get the path from match index 3 (the last capture group)
    const currentPath = jsrMatch[3]
    const basePath = currentModuleUrl.substring(0, currentModuleUrl.lastIndexOf(currentPath))
    return `${basePath}${normalizedPath}`
  }

  // Fallback with directory detection
  const urlParts = currentModuleUrl.split('/')
  const srcIndex = urlParts.findIndex((part) => part === 'src' || part === 'lib')

  if (srcIndex > 0) {
    return `${urlParts.slice(0, srcIndex).join('/')}/${normalizedPath}`
  }

  // Last resort: relative resolution
  try {
    return import.meta.resolve(`../../${normalizedPath}`)
  } catch {
    return new URL(`../../${normalizedPath}`, currentModuleUrl).href
  }
}

/**
 * Generates a list of paths to try for resource resolution
 */
const generatePathsToTry = (
  normalizedPath: string,
  entryModuleUrl: string,
  currentModuleUrl: string,
  jsrResourceUrl: string | null,
): ResourcePathResult[] => [
  {
    path: join(dirname(fromFileUrl(entryModuleUrl)), normalizedPath),
    source: 'entry' as ResourceSource,
  },
  {
    path: join(dirname(fromFileUrl(currentModuleUrl)), '..', '..', normalizedPath),
    source: 'module' as ResourceSource,
  },
  {
    path: fromFileUrl(import.meta.resolve(`../../${normalizedPath}`)),
    source: 'local' as ResourceSource,
  },
  ...(jsrResourceUrl ? [{ path: jsrResourceUrl, source: 'jsr' as ResourceSource }] : []),
  {
    path: join(dirname(Deno.execPath()), normalizedPath),
    source: 'compiled' as ResourceSource,
  },
  {
    path: resolve(Deno.cwd(), normalizedPath),
    source: 'fallback' as ResourceSource,
  },
]

/**
 * Formats attempted paths for error messages
 */
const formatAttemptedPaths = (attempts: ResourcePathResult[]): string =>
  attempts.map((a) => `${a.source}: ${a.path}`).join(', ')

/**
 * Resolves the path to a resource directory regardless of how the code is executed
 * (JSR registry URL, local development, or compiled binary).
 *
 * @param projectPath The relative path to the resource folder from the project root (e.g. "src/templates")
 * @param options Options for resolving the resource path
 * @param options.envVarPrefix Prefix for environment variable to check
 * @returns The absolute path to the resource directory
 * @throws Error When resource directory cannot be found, with details about attempted locations
 *
 * @example
 * ```ts
 * // Get templates directory
 * const templatesDir = await resolveResourcePath("src/templates");
 *
 * // With custom environment variable prefix
 * const customDir = await resolveResourcePath("assets/icons", { envVarPrefix: "MY_APP" });
 * ```
 */
async function resolveResourcePath(
  projectPath: string,
  options: { envVarPrefix?: string } = {},
): Promise<string> {
  if (!projectPath) throw new Error('Project path must be provided')

  const normalizedPath = projectPath.replace(/^\/+/, '')
  const { envVarPrefix = 'DENO_KIT' } = options
  const attempts: ResourcePathResult[] = []
  const resourceType = normalizedPath.split('/').pop() || normalizedPath

  try {
    // Try environment variable first
    const envVarName = `${envVarPrefix.toUpperCase()}_${resourceType.toUpperCase()}_DIR`
    const envResourceDir = Deno.env.get(envVarName)

    if (envResourceDir) {
      attempts.push({ path: envResourceDir, source: 'env' })
      if (await exists(envResourceDir, { isDirectory: true })) return envResourceDir
    }

    // Prepare module URLs
    const entryModuleUrl = Deno.mainModule
    const currentModuleUrl = import.meta.url

    // Handle JSR package if applicable
    const isJsrPackage = currentModuleUrl.includes('jsr.io')
    const jsrResourceUrl = isJsrPackage
      ? extractJsrResourceUrl(currentModuleUrl, normalizedPath)
      : null

    // Try each path until we find one that exists
    const pathsToTry = generatePathsToTry(
      normalizedPath,
      entryModuleUrl,
      currentModuleUrl,
      jsrResourceUrl,
    )

    for (const { path, source } of pathsToTry) {
      attempts.push({ path, source })
      try {
        if (await exists(path, { isDirectory: true })) return path
      } catch {
        // Skip invalid paths
      }
    }

    throw new Error(
      `Resource directory '${normalizedPath}' not found. Attempted locations: ${
        formatAttemptedPaths(attempts)
      }`,
    )
  } catch (error: unknown) {
    const attemptedPaths = formatAttemptedPaths(attempts)
    const errorMessage = error instanceof Error
      ? `${error.message}. Attempted resource locations: ${attemptedPaths || 'none'}`
      : `Failed to resolve resource path '${normalizedPath}': ${
        String(error)
      }. Attempted locations: ${attemptedPaths || 'none'}`

    throw new Error(errorMessage)
  }
}

export { resolveResourcePath }
export default resolveResourcePath
