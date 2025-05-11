/**
 * @module fs_extra
 * Provides extended file system utilities, supplementing the standard Deno FS module.
 * This includes functions for complex permission checks, path analysis, and recursive file operations.
 */
import { dirname, join, resolve } from '@std/path'
import { ensureDir, ensureFile, exists, walk } from '@std/fs'
import { stat } from '@std/fs/unstable-stat'
import { readTextFile } from '@std/fs/unstable-read-text-file'

import { chown } from '@std/fs/unstable-chown'
import logger from './logger.ts'

/**
 * Checks if a directory has write access permission.
 *
 * First attempts to check Unix file permissions directly using `Deno.lstat` for ownership and mode,
 * then falls back to attempting to create and delete a temporary file within the directory
 * if the permission check is inconclusive or on non-Unix systems.
 *
 * @param {string} path - Directory path to check for write access.
 * @returns {Promise<boolean>} Resolves to `true` if the directory is writable, `false` otherwise.
 * @async
 */
async function checkDirectoryWriteAccess(path: string): Promise<boolean> {
  const absPath = resolve(path)

  // Verify it's a valid directory first
  if (!await exists(absPath, { isDirectory: true })) return false

  // On Unix systems, we can try to check if user owns the directory
  // or has sufficient permissions
  if (Deno.build.os !== 'windows') {
    try {
      // Still need Deno.uid() and Deno.gid() as they provide current user/group info
      const uid = Deno.uid()
      const gid = Deno.gid()

      // We need to use Deno.lstat for the file mode and ownership info
      // @std/fs/unstable-stat doesn't provide ownership info
      const directoryInfo = await Deno.lstat(absPath).catch(() => null)
      if (!directoryInfo) return false

      const fileMode = directoryInfo.mode ?? 0
      const fileUid = 'uid' in directoryInfo ? directoryInfo.uid : undefined
      const fileGid = 'gid' in directoryInfo ? directoryInfo.gid : undefined

      const hasWriteAccess = (fileUid === uid && (fileMode & 0o200) !== 0) || // User write
        (fileGid === gid && (fileMode & 0o020) !== 0) || // Group write
        (fileMode & 0o002) !== 0 // Others write

      if (hasWriteAccess) return true
    } catch {
      // Fall through to file writing test
    }
  }

  // Fallback: Test by writing a temporary file
  const testFileName = join(absPath, `.write-test-${crypto.randomUUID()}`)
  const cleanupTestFile = () =>
    exists(testFileName)
      .then((exists) => exists ? Deno.remove(testFileName) : undefined)
      .catch(() => {})

  try {
    await ensureFile(testFileName)
    // Attempt to set ownership if possible
    if (Deno.build.os !== 'windows') {
      try {
        // Attempt to set the owner to current user using @std/fs chown
        const uid = Deno.uid()
        const gid = Deno.gid()
        await chown(testFileName, uid, gid)
      } catch {
        // Ignore chown errors, we're just testing write ability
      }
    }
    await Deno.writeTextFile(testFileName, '')
    return true
  } catch {
    return false
  } finally {
    await cleanupTestFile()
  }
}

/**
 * Finds the most common base directory path from an array of file paths.
 * This function handles potentially unrelated and/or relative paths and includes tie-breaking logic
 * (preferring deeper paths in case of a tie in occurrence count).
 *
 * @note If you are looking for a `common()` method that ONLY works on strictly shared or absolute paths,
 * consider using `path.common()` from the `@std/path` library.
 * @param {string[]} paths - An array of file paths. These can be relative or absolute.
 * @returns {Promise<string>} Resolves to the absolute path of the most common base directory.
 * @throws {Error} If the input `paths` array is empty or if a common base path cannot be determined.
 * @async
 * @example
 * ```ts
 * // Assuming paths are resolvable in the current context
 * const filePaths = [
 *   '/users/data/file1.txt',
 *   '/users/data/docs/file2.txt',
 *   '/users/data/file3.txt',
 *   './local/data/another.txt' // Example with a relative path
 * ];
 * try {
 *   const basePath = await getMostCommonBasePath(filePaths);
 *   console.log(basePath); // Example output: '/users/data' or another common resolved path
 * } catch (e) {
 *   console.error(e.message);
 * }
 * ```
 */
async function getMostCommonBasePath(paths: string[]): Promise<string> {
  if (!paths.length) {
    throw new Error('Cannot determine common base path. No paths were provided')
  }

  // Special case: If only one path is provided
  if (paths.length === 1) {
    const resolvedPath = resolve(paths[0])

    try {
      // Check if the path is a directory using @std/fs
      const fileInfo = await stat(resolvedPath)
      if (fileInfo.isDirectory) {
        return resolvedPath // Return the directory path as-is
      }
    } catch {
      // If stat fails (e.g., path doesn't exist), fall back to getting dirname
    }

    // For files or non-existent paths, return the parent directory
    return dirname(resolvedPath)
  }

  // Normalize all paths
  const normalizedPaths = paths.map((path) => resolve(path))

  // Count occurrences of each parent directory
  const basePathCounts = new Map<string, number>()

  for (const path of normalizedPaths) {
    // Get all parent directories
    let current = path
    while (current !== dirname(current)) {
      current = dirname(current)
      basePathCounts.set(current, (basePathCounts.get(current) || 0) + 1)
    }
  }

  // Find the most common base path
  let maxPath = ''
  let maxCount = 0

  for (const [path, count] of basePathCounts) {
    if (count > maxCount) {
      maxPath = path
      maxCount = count
    } else if (count === maxCount) {
      // If we have a tie, choose the deeper path in the directory structure
      // (More specific path is preferable)
      if (path.length > maxPath.length) {
        maxPath = path
      }
    }
  }

  if (!maxPath) {
    throw new Error('Could not determine a common base path')
  }

  return maxPath
}

/**
 * Validates that all file paths are located within the specified base path.
 * Both file paths and the base path can be relative or absolute; they will be resolved to absolute paths for comparison.
 *
 * @param {string[]} filePaths - An array of file paths to validate.
 * @param {string} basePath - The base directory path that should contain all file paths.
 * @returns {boolean} Returns `true` if all file paths are located within the base path.
 * @throws {Error} If any file path is found to not be located within the resolved base path.
 */
function validateCommonBasePath(
  filePaths: string[],
  basePath: string,
): boolean {
  // Normalize the base path
  const normalizedBasePath = resolve(basePath)

  // Normalize all file paths
  const normalizedFilePaths = filePaths.map((path) => resolve(path))

  // Check if each file path is within the base path
  const invalidPaths = normalizedFilePaths.filter((path) => !path.startsWith(normalizedBasePath))

  if (invalidPaths.length > 0) {
    throw new Error(
      `The following paths are not located within the base path "${normalizedBasePath}":\n${
        invalidPaths.map((path) => `- ${path}`).join('\n')
      }`,
    )
  }

  return true
}

/**
 * Recursively reads all files in a specified directory and returns their content as a map.
 * This function uses concurrent file reading for potentially better performance with numerous files.
 * It follows the directory structure but does not follow symlinks for directories or files it encounters.
 * If the directory cannot be accessed or an error occurs during the walk, a warning is logged and an empty map is returned.
 * Individual file read errors are logged, and those files are omitted from the result.
 *
 * @param {string} directoryPath - The path to the directory from which to read files.
 * @returns {Promise<Map<string, string>>} A promise that resolves to a map where keys are absolute file paths
 *   and values are the corresponding file contents as strings. Returns an empty map if the initial
 *   directory access fails.
 * @async
 */
async function readFilesRecursively(
  directoryPath: string,
): Promise<Map<string, string>> {
  const files = new Map<string, string>()

  // Using ensureDir to resolve real path while also ensuring it exists
  const absolutePath = resolve(directoryPath)
  try {
    await ensureDir(absolutePath)
  } catch (error) {
    logger.warn(
      `Failed to access directory ${absolutePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return files
  }

  try {
    // Collect all file entries first
    const entries: { path: string }[] = []
    for await (
      const entry of walk(absolutePath, {
        includeFiles: true,
        includeDirs: false,
        followSymlinks: false,
      })
    ) {
      entries.push({ path: entry.path })
    }

    // Create an array of promises for reading all files concurrently
    const readPromises = entries.map((entry) => (
      readTextFile(entry.path)
        .then((content) => ({ path: entry.path, content, success: true as const }))
        .catch((error) => ({
          path: entry.path,
          error: error instanceof Error ? error.message : String(error),
          success: false as const,
        }))
    ))

    // Wait for all file read operations to complete
    const results = await Promise.allSettled(readPromises)

    // Process results and populate the files map
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { path, success } = result.value
        if (success) {
          files.set(path, result.value.content)
        } else {
          logger.warn(`Failed to read file ${path}: ${result.value.error}`)
        }
      } else {
        // This should rarely happen as errors are handled in the promise chain
        logger.warn(`Unexpected error reading file: ${result.reason}`)
      }
    }
  } catch (error) {
    logger.warn(
      `Failed to read directory ${absolutePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  return files
}

export {
  checkDirectoryWriteAccess,
  getMostCommonBasePath,
  readFilesRecursively,
  validateCommonBasePath,
}
