/**
 * @module workspace
 *
 * Handles file operations for the workspace.
 */
import { join } from '@std/path'
import { ensureDir, exists } from '@std/fs'
import { isBannedDirectory } from '../utils/banned-directories.ts'
import { readFilesRecursively } from '../utils/fs-extra.ts'
import type { WorkspaceLogger } from './workspace-types.ts'

/**
 * Manages file operations within a workspace directory
 */
export class WorkspaceFiles {
  #files = new Map<string, string>()

  /**
   * Creates a new WorkspaceFiles instance
   *
   * @param path The root path of the workspace
   * @param logger Logger instance for logging operations
   */
  constructor(
    readonly path: string,
    private readonly logger: WorkspaceLogger,
  ) {}

  /**
   * Get all files in the workspace
   */
  get files(): Map<string, string> {
    return this.#files
  }

  /**
   * Set files in the workspace
   */
  set files(files: Map<string, string>) {
    this.#files = new Map(files)
  }

  /**
   * Loads files from the filesystem into memory
   */
  async loadFiles(): Promise<Map<string, string>> {
    this.#files = await readFilesRecursively(this.path)
    return this.#files
  }

  /**
   * Writes a file to the workspace directory. If the file path contains subdirectories
   * that don't exist, they will be created automatically.
   *
   * @param path The path to write the file to (absolute or relative to workspace)
   * @param content The content to write to the file
   * @param create If true, creates a new file or overwrites existing. If false, fails if file doesn't exist (default: true)
   * @throws Error If the path is not within the workspace directory or if writing fails
   */
  async writeFile(path: string, content: string, create = true): Promise<void> {
    const absolutePath = path.startsWith('/') ? path : join(this.path, path)
    this.logger.debug(
      `Writing content to: ${absolutePath} in workspace: ${this.path}`,
    )

    if (!absolutePath.startsWith(this.path)) {
      throw new Error(`Cannot write file outside of workspace: ${absolutePath}`)
    }

    const parentDir = absolutePath.substring(0, absolutePath.lastIndexOf('/'))

    // Security check
    if (await isBannedDirectory(parentDir)) {
      throw new Error(`Cannot write file in banned directory: ${parentDir}`)
    }

    // Check if file exists when create=false
    if (!create && !await exists(absolutePath)) {
      this.logger.warn(`File does not exist and create=false: ${absolutePath}`)
      return
    }

    try {
      await ensureDir(parentDir)
      await Deno.writeTextFile(absolutePath, content, { create })

      // Update the internal files map
      this.#files.set(absolutePath, content)
    } catch (error) {
      throw new Error(
        `Failed to write file at '${absolutePath}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
}
