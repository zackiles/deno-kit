/**
 * @module workspace
 *
 * Provides a Workspace class for managing files in workspace and template directories.
 * Supports file operations, template compilation, and workspace backups.
 *
 * @example
 * ```ts
 * import { createWorkspace, getWorkspace } from "./workspace.ts";
 * // See if a workspace exists for the current working directory (throws error or returns a KitSpecification)
 * const kit = await getWorkspace()
 *
 * // Create a workspace if one doesn't exist
 * const workspace = await createWorkspace({
 *   templatesPath: "./templates"
 * });
 *
 * // Access workspace data
 * console.log(workspace.toJSON());
 * ```
 */

import { fromFileUrl, join } from '@std/path'
import {
  checkDirectoryWriteAccess,
  getCommonBasePath,
  validateCommonBasePath,
} from './utils/fs-extra.ts'
import { getPackageInfo } from './utils/get-package-info.ts'
import { parse as parseJSONC } from '@std/jsonc'
import type { KitFileSpecification, TemplateValues } from './types.ts'

const DEFAULT_TEMP_PREFIX = 'deno-kit-workspace-'
const DEFAULT_BACKUPS_PREFIX = 'deno-kit-backups-'
const KIT_FILE_NAME = 'kit.json'

/**
 * Workspace class that manages files in workspace and template directories.
 * Provides functionality for file operations, template compilation, git configuration access,
 * and automatic workspace backups. All operations are restricted to the workspace directory
 * for security.
 */
class Workspace {
  readonly workspacePath: string
  readonly templatesPath: string
  readonly backupsPath: string
  readonly workspaceId: string
  #files = new Map<string, string>()
  #templates = new Map<string, string>()
  #templateValues = new Map<string, string>()
  #backups = new Map<string, string>()

  /**
   * Create a new Workspace instance
   *
   * @param workspaceId Unique identifier for the workspace
   * @param workspaceFiles Map of workspace file paths to file contents
   * @param templateFiles Map of template file paths to file contents
   * @private
   */
  private constructor(
    { workspaceId, workspaceFiles, templateFiles, backupFiles }: {
      workspaceId: string
      workspaceFiles: Map<string, string>
      templateFiles: Map<string, string>
      backupFiles?: Map<string, string>
    },
  ) {
    this.workspaceId = workspaceId
    const workspaceFilePaths = Array.from(workspaceFiles.keys())
    const templateFilePaths = Array.from(templateFiles.keys())
    const backupFilePaths = backupFiles ? Array.from(backupFiles.keys()) : []

    this.workspacePath = getCommonBasePath(workspaceFilePaths)
    this.templatesPath = getCommonBasePath(templateFilePaths)
    this.backupsPath = getCommonBasePath(backupFilePaths)

    validateCommonBasePath(workspaceFilePaths, this.workspacePath)
    validateCommonBasePath(templateFilePaths, this.templatesPath)
    validateCommonBasePath(backupFilePaths, this.backupsPath)

    this.#files = workspaceFiles
    this.#templates = templateFiles
    if (backupFiles) {
      // We don't _need_ backups made at this point.
      // Call this.backup() if desired
      this.#backups = backupFiles
    }
  }

  /**
   * Create a workspace by reading all files in the given paths and creating a backup.
   *
   * @param workspacePath Path to the workspace directory, if not provided a temporary directory will be created
   * @param templatesPath Path to the templates directory, defaults to 'templates' directory in same folder as workspace.ts
   * @returns A new Workspace instance with an initial backup created
   * @throws Error if templatesPath doesn't exist or has no files
   * @throws Error if provided workspacePath doesn't exist or doesn't have write access
   */
  static async createWorkspace({
    workspacePath,
    templatesPath,
  }: {
    workspacePath?: string
    templatesPath?: string
  } = {}): Promise<Workspace> {
    const currentDir = fromFileUrl(import.meta.url)
    const resolvedTemplatesPath = templatesPath ??
      join(currentDir, '..', 'templates')

    await Workspace.#validateTemplatesPath(resolvedTemplatesPath)

    // If a path isn't provided we fallback on a Deno temporary directory
    const actualWorkspacePath = workspacePath
      ? await Workspace.#validateWorkspacePath(workspacePath)
      : await Deno.makeTempDir({ prefix: DEFAULT_TEMP_PREFIX })

    const [workspaceFiles, templateFiles] = await Promise.all([
      Workspace.#readFilesRecursively(actualWorkspacePath),
      Workspace.#readFilesRecursively(resolvedTemplatesPath),
    ])

    const workspaceId = await Workspace.createWorkspaceIdFromPath(
      actualWorkspacePath,
    )
    const workspace = new Workspace({
      workspaceId,
      workspaceFiles,
      templateFiles,
    })
    await workspace.#backup()
    await workspace.#save()
    return workspace
  }

  /**
   * Checks if a kit.json file exists in the current working directory and returns its parsed contents.
   *
   * @returns {Promise<KitFileSpecification>} The parsed contents of kit.json
   * @throws {Error} If kit.json is not found in the current directory
   */
  static async getWorkspace(): Promise<KitFileSpecification> {
    const kitPath = join(Deno.cwd(), KIT_FILE_NAME)

    try {
      const kitContent = await Deno.readTextFile(kitPath)
      return JSON.parse(kitContent) as KitFileSpecification
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(
          'No kit.json found in current directory. Are you in a deno-kit workspace?',
        )
      }
      throw new Error(
        `Failed to get workspace: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  /**
   * Generate a unique id for a workspace given a workspace path using SHA-256 hashing.
   * The hash is generated from the workspace path to ensure consistent identification
   * across sessions.
   *
   * @param path The workspace path to generate an ID from
   * @returns A hex string representation of the SHA-256 hash
   * @private
   */
  static async createWorkspaceIdFromPath(path: string): Promise<string> {
    // Don't create errors for invalid workspace paths here.
    try {
      await Workspace.#validateTemplatesPath(path)
    } catch (error) {
      throw new Error(
        `Error creating workspace ID from path ${path}. Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
    // Generate a unique workspace ID using SHA-256 hash of the workspace path
    const data = new TextEncoder().encode(path)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Validate templates directory exists and contains files
   *
   * @param templatesPath Path to validate
   * @throws Error if the directory doesn't exist or contains no files
   */
  static async #validateTemplatesPath(templatesPath: string): Promise<void> {
    try {
      const templateEntries = [...Deno.readDirSync(templatesPath)]
      if (!templateEntries.length) {
        throw new Error(
          `Templates directory '${templatesPath}' exists but contains no files`,
        )
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`Templates directory '${templatesPath}' does not exist`)
      }
      throw error
    }
  }

  /**
   * Validate workspace directory exists and has write access
   *
   * @param workspacePath Path to validate
   * @returns The validated workspace path
   * @throws Error if the directory doesn't exist, lacks write access, or is the deno-kit source project
   */
  static async #validateWorkspacePath(workspacePath: string): Promise<string> {
    try {
      // Check if the path is the deno-kit source project
      const denoJsoncPath = join(workspacePath, 'deno.jsonc')
      const isDenoKitSource = await (async () => {
        try {
          // ----------------------------------------------------------------
          // IMPORTANT: Since certain Workspace methods are destructive we
          // ensure no bugs ever set the workspace path to the root of the
          // deno-kit source code project in local development environments.
          // It is not fun to have the repo deleted on you along with its git
          // history, so we raise an error if this happens.
          // ----------------------------------------------------------------
          const denoConfig = parseJSONC(await Deno.readTextFile(denoJsoncPath)) as { name?: string }
          return denoConfig?.name === getPackageInfo().name
        } catch (error) {
          // Not the deno-kit source project if the deno.jsonc file doesn't
          // exist or it has a name property that doesn't match the package name
          if (!(error instanceof Deno.errors.NotFound)) {
            console.warn(
              `Error validating workspace path: ${workspacePath}. Error reading deno.jsonc: ${
                error instanceof Error ? error.message : String(error)
              }`,
            )
          }
          return false
        }
      })()

      if (isDenoKitSource) {
        throw new Error('Cannot use the deno-kit source project directory as a workspace')
      }

      await checkDirectoryWriteAccess(workspacePath)
      return workspacePath
    } catch (error) {
      const message = error instanceof Error
        ? error.message.replace(/^(Path|Directory)/, 'Workspace directory')
        : String(error)
      throw new Error(message)
    }
  }

  /**
   * Recursively read all files in a directory and return a map of file paths to contents
   *
   * @param directoryPath The directory to read files from
   * @returns A map of file paths to file contents
   * @throws Error if the directory cannot be read or accessed
   * @note Failed file reads are logged as warnings and skipped
   */
  static async #readFilesRecursively(
    directoryPath: string,
  ): Promise<Map<string, string>> {
    const files = new Map<string, string>()
    const absolutePath = Deno.realPathSync(directoryPath)

    const readFileContent = async (path: string) => {
      try {
        const content = await Deno.readTextFile(path)
        files.set(path, content)
      } catch (error) {
        console.warn(
          `Failed to read file ${path}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    const processDirectory = async (dirPath: string): Promise<void> => {
      const entries = Deno.readDir(dirPath)
      for await (const entry of entries) {
        const entryPath = join(dirPath, entry.name)
        await (entry.isDirectory ? processDirectory(entryPath) : readFileContent(entryPath))
      }
    }

    await processDirectory(absolutePath)
    return files
  }

  /**
   * Creates a backup of all workspace files in a new temporary directory.
   * The backup is stored in a subdirectory named with the workspace's unique ID,
   * allowing multiple backups from different workspaces to coexist.
   *
   * @returns {Promise<Map<string, string>>} A map of backed up file paths to their contents
   */
  async #backup(): Promise<Map<string, string>> {
    // Create a unique backup directory for the workspace based on its workspaceID
    const backupBasePath = await Deno.makeTempDir({
      prefix: DEFAULT_BACKUPS_PREFIX,
      suffix: `-${this.workspaceId}`,
    })

    const backupFiles = new Map<string, string>()

    for (const [path, content] of this.#files.entries()) {
      const backupPath = path.replace(this.workspacePath, backupBasePath)
      backupFiles.set(backupPath, content)
    }

    return backupFiles
  }

  /**
   * Creates a backup of the workspace and saves the workspace configuration to kit.json
   *
   * @private
   */
  async #save(): Promise<void> {
    await this.writeFile(KIT_FILE_NAME, this.toJSON())
  }

  /**
   * Runs a shell command in the workspace directory
   *
   * @param {string} command - The command to execute (e.g. 'git', 'npm')
   * @param {string[]} args - Command arguments (e.g. ['config', 'user.name'])
   * @returns {Promise<string>} The trimmed stdout output of the command
   * @throws {Error} If the command fails to execute or produces stderr output
   * @example
   * ```ts
   * const output = await workspace.#runCommandInWorkspace('git', ['status'])
   * ```
   */
  async #runCommandInWorkspace(
    command: string,
    args: string[] = [],
  ): Promise<string> {
    const decoder = new TextDecoder()
    const options = {
      args,
      stdout: 'piped',
      stderr: 'piped',
      cwd: this.workspacePath,
    } as const

    try {
      const { stdout, stderr } = await new Deno.Command(command, options)
        .output()
      const [output, error] = [stdout, stderr].map((buf) => decoder.decode(buf).trim())

      if (error) {
        throw new Error(`Command '${command}' failed with error: ${error}`)
      }

      return output
    } catch (error) {
      throw new Error(
        `Failed to execute command in workspace '${command}': ${String(error)}`,
      )
    }
  }

  /**
   * Gets the git user name from git config
   *
   * @returns {Promise<string>} The git user name or empty string if not found
   */
  async getGitUserName(): Promise<string> {
    try {
      return await this.#runCommandInWorkspace('git', [
        'config',
        'user.name',
      ])
    } catch (_error) {
      return ''
    }
  }

  /**
   * Gets the git user email from git config
   *
   * @returns {Promise<string>} The git user email or empty string if not found
   */
  async getGitUserEmail(): Promise<string> {
    try {
      return await this.#runCommandInWorkspace('git', [
        'config',
        'user.email',
      ])
    } catch (_error) {
      return ''
    }
  }

  /**
   * Writes a file to the workspace directory. If the file path contains subdirectories
   * that don't exist, they will be created automatically.
   *
   * @param path The path to write the file to (absolute or relative to workspace)
   * @param content The content to write to the file
   * @param create If true, creates a new file or overwrites existing. If false, fails if file doesn't exist (default: true)
   * @throws {Error} If the path is not within the workspace directory or if writing fails
   */
  async writeFile(path: string, content: string, create = true): Promise<void> {
    const absolutePath = path.startsWith('/') ? path : join(this.workspacePath, path)

    if (!absolutePath.startsWith(this.workspacePath)) {
      throw new Error(`Cannot write file outside of workspace: ${absolutePath}`)
    }

    const parentDir = absolutePath.substring(0, absolutePath.lastIndexOf('/'))

    try {
      await Deno.mkdir(parentDir, { recursive: true })
      await Deno.writeTextFile(absolutePath, content, { create })
    } catch (error) {
      if (error instanceof Deno.errors.NotFound && !create) {
        console.warn(`File does not exist and create=false: ${absolutePath}`)
        return
      }
      throw new Error(
        `Failed to write file at '${absolutePath}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  /**
   * Compiles template files by replacing placeholder values with provided template values,
   * then saves the compiled templates to the workspace directory.
   * The template paths are adjusted to point to the workspace directory before saving.
   * Placeholders in templates should be in the format {PLACEHOLDER_NAME}.
   *
   * @param templateValues Values to replace placeholders with in template files
   * @throws {Error} If writing any template file fails
   * @example
   * ```ts
   * await workspace.compileAndWriteTemplates({
   *   PROJECT_NAME: "my-project",
   *   AUTHOR: "John Doe"
   * });
   * ```
   */
  async compileAndWriteTemplates(
    templateValues: TemplateValues,
  ): Promise<void> {
    const compiledTemplates = new Map<string, string>()

    // First compile all templates with their values
    for (const [path, content] of this.#templates.entries()) {
      const processedContent = content.replace(
        /{([A-Z_]+)}/g,
        (_match, placeholder) =>
          placeholder in templateValues ? templateValues[placeholder] : _match,
      )

      // Rewrite the base path of the template files to be the workspace path before writing them
      const workspacePath = path.replace(this.templatesPath, this.workspacePath)
      compiledTemplates.set(workspacePath, processedContent)
    }

    // Write all compiled templates to disk
    for (const [path, content] of compiledTemplates.entries()) {
      try {
        await Deno.writeTextFile(path, content)
      } catch (error) {
        throw new Error(
          `Failed to write template to workspace at '${path}': ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    await this.#save()
  }

  /**
   * Convert workspace metadata to JSON
   *
   * @returns A JSON string representation of KitFileSpecification
   */
  toJSON(): string {
    const workspaceSpecification: KitFileSpecification = {
      [`${getPackageInfo().name}-version`]: getPackageInfo().version,
      workspaceId: this.workspaceId,
      workspaceFiles: Array.from(this.#files.keys()),
      templateFiles: Array.from(this.#templates.keys()),
      backupFiles: Array.from(this.#backups.keys()),
      templateValues: Object.fromEntries(
        this.#templateValues.entries(),
      ) as TemplateValues,
    }
    return JSON.stringify(workspaceSpecification, null, 2)
  }
}

export const { createWorkspace, getWorkspace } = Workspace
