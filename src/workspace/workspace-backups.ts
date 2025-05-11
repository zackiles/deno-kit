/**
 * @module workspace
 *
 * Handles backup operations for the workspace.
 */
import { basename, join } from '@std/path'
import { copy, ensureDir, exists } from '@std/fs'
import { isBannedDirectory } from '../utils/banned-directories.ts'
import { getMostCommonBasePath } from '../utils/fs-extra.ts'
import type { WorkspaceLogger } from './workspace-types.ts'

const DEFAULT_BACKUPS_PREFIX = 'workspace-backups-'

/**
 * Manages backup operations for a workspace
 */
export class WorkspaceBackups {
  #backups = new Map<string, string>()
  #originalPathsForBackup: string[] = []
  #backupsPath: string

  /**
   * Creates a new WorkspaceBackups instance
   *
   * @param workspacePath The root path of the workspace
   * @param backupsPath The path where backups are stored
   * @param logger Logger instance for logging operations
   */
  constructor(
    readonly workspacePath: string,
    backupsPath: string,
    private readonly logger: WorkspaceLogger,
  ) {
    this.#backupsPath = backupsPath
  }

  /**
   * Get all backup files
   */
  get backups(): Map<string, string> {
    return this.#backups
  }

  /**
   * Get original paths for backup
   */
  get originalPathsForBackup(): string[] {
    return [...this.#originalPathsForBackup]
  }

  /**
   * Set original paths for backup
   */
  setOriginalPathsForBackup(paths: string[]): void {
    this.#originalPathsForBackup = [...paths]
  }

  /**
   * Set backup files
   */
  setBackups(backups: Map<string, string>): void {
    this.#backups = new Map(backups)
  }

  /**
   * Get the backups path
   */
  get backupsPath(): string {
    return this.#backupsPath
  }

  /**
   * Set the backups path
   */
  set backupsPath(path: string) {
    this.#backupsPath = path
  }

  /**
   * Creates a backup of all workspace files in a new temporary directory.
   * The backup is stored in a subdirectory named with the workspace's unique ID,
   * allowing multiple backups from different workspaces to coexist.
   *
   * @param files The files to backup
   * @param workspaceId The unique ID of the workspace
   * @param templateFilenames Set of template filenames to exclude from backup
   * @param configFilePath The path to the configuration file to exclude from backup
   * @returns A map of backed up file paths to their contents
   */
  async backup(
    files: Map<string, string>,
    workspaceId: string,
    templateFilenames: Set<string>,
    configFilePath: string,
  ): Promise<Map<string, string>> {
    // If backupsPath is set, verify it exists, otherwise create a temp directory
    let backupBasePath: string

    if (this.#backupsPath) {
      // Reuse existing backupsPath if set
      if (!await exists(this.#backupsPath)) {
        throw new Error(`Backup path set but does not exist: ${this.#backupsPath}`)
      }
      backupBasePath = this.#backupsPath
    } else {
      // Create a unique backup directory for the workspace based on its ID
      backupBasePath = await Deno.makeTempDir({
        prefix: DEFAULT_BACKUPS_PREFIX,
        suffix: `-${workspaceId}`,
      })
      this.#backupsPath = backupBasePath
    }

    // Security check for banned directory
    if (await isBannedDirectory(backupBasePath)) {
      throw new Error(`Cannot create backup in banned directory: ${backupBasePath}`)
    }

    await ensureDir(backupBasePath)

    // Process files that aren't template files or the config file
    const backupFilesMap = new Map<string, string>()
    this.#originalPathsForBackup = [] // Clear before populating for the current backup operation

    const backupOperations = [...files.entries()]
      .filter(([path]) => {
        const isTemplate = templateFilenames.has(basename(path))
        const isConfig = path === configFilePath
        if (!isTemplate && !isConfig) {
          this.#originalPathsForBackup.push(path) // Store original absolute path
          return true
        }
        return false
      })
      .map(async ([path, content]) => {
        const backupPath = path.replace(this.workspacePath, backupBasePath)
        const parentDir = backupPath.substring(0, backupPath.lastIndexOf('/'))

        try {
          await ensureDir(parentDir)
          await copy(path, backupPath, { preserveTimestamps: true, overwrite: true })
          backupFilesMap.set(backupPath, content)
        } catch (error) {
          this.logger.warn(
            `Failed to backup file ${path}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        }
      })

    await Promise.all(backupOperations)

    // Update internal state
    this.#backups = backupFilesMap

    // Update backupsPath if we have backup files to ensure we use the common base path
    if (backupFilesMap.size > 0) {
      this.#backupsPath = getMostCommonBasePath(Array.from(backupFilesMap.keys()))
    }

    return backupFilesMap
  }

  /**
   * Reset the workspace by copying files from the backup directory to the workspace directory.
   * After copying all files, the backup directory is emptied but preserved.
   *
   * @returns A Promise that resolves when the reset operation is complete
   * @throws Error if the backup path doesn't exist or is a banned directory
   * @throws Error if copying files fails
   */
  async reset(): Promise<void> {
    const copyOperations = [...this.#backups.entries()].map(async ([backupPath, _]) => {
      try {
        // Get the relative path from the backup directory to create the same structure in workspace
        const relativePath = backupPath.substring(this.#backupsPath.length)
        // Create a clean, platform-independent path by using join
        const workspacePath = join(this.workspacePath, relativePath.replace(/^\//, ''))
        // Ensure parent directory exists
        await ensureDir(join(workspacePath, '..'))
        // Copy the file with timestamps preserved
        await copy(backupPath, workspacePath, { preserveTimestamps: true, overwrite: true })
      } catch (error) {
        throw new Error(
          `Failed to reset file ${backupPath}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    })

    try {
      // Execute all copy operations in parallel
      await Promise.all(copyOperations)

      // Empty the backup directory by removing each file but keeping the directory
      for (const backupPath of this.#backups.keys()) {
        await Deno.remove(backupPath)
      }

      this.#backups = new Map()
    } catch (error) {
      throw new Error(
        `Reset operation failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
