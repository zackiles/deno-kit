/**
 * @module workspace
 *
 * Provides a Workspace class for managing files in workspace and template directories.
 * Supports file operations, template compilation, and workspace backups.
 *
 * @example
 * ```ts
 * import { createWorkspace } from "./workspace.ts";
 *
 * // Create a workspace
 * const workspace = await createWorkspace({
 *   templatesPath: "./templates"
 * });
 *
 * // Access workspace data
 * console.log(await workspace.toJSON());
 * ```
 */
import { basename, fromFileUrl, join } from '@std/path'
import { parse as parseJSONC } from '@std/jsonc'
import { copy, ensureDir, exists } from '@std/fs'

import {
  checkDirectoryWriteAccess,
  getCommonBasePath,
  getPackageForPath,
  PACKAGE_CONFIG_FILES,
  readFilesRecursively,
  validateCommonBasePath,
} from './utils/fs-extra.ts'
import type { TemplateValues, WorkspaceConfigFile } from './types.ts'
import { isBannedDirectory } from './utils/banned-directories.ts'

const DEFAULT_TEMP_PREFIX = 'workspace-temp-'
const DEFAULT_BACKUPS_PREFIX = 'workspace-backups-'
const DEFAULT_WORKSPACE_CONFIG_FILE_NAME = 'workspace.json'

/**
 * Workspace class that manages files in workspace and template directories.
 * Provides functionality for file operations, template compilation, git configuration access,
 * and automatic workspace backups. All operations are restricted to the workspace directory
 * for security.
 */
class Workspace {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly configFileName: string
  readonly templatesPath: string
  backupsPath: string
  #files = new Map<string, string>()
  #templates = new Map<string, string>()
  #templateValues = new Map<string, string>()
  #backups = new Map<string, string>()

  /**
   * Create a new Workspace instance
   *
   * @param options Object containing workspace configuration
   * @param options.id Unique identifier for the workspace
   * @param options.name Optional name for the workspace
   * @param options.workspaceFiles Map of workspace file paths to file contents
   * @param options.templateFiles Map of template file paths to file contents
   * @param options.backupFiles Optional map of backup file paths to file contents
   * @param options.templateValues Optional values to replace placeholders with in template files
   * @param options.configFileName The name of the workspace configuration file
   * @private
   */
  private constructor(
    {
      id,
      name,
      workspaceFiles,
      templateFiles,
      backupFiles,
      templateValues,
      configFileName,
    }: {
      id: string
      name?: string
      workspaceFiles: Map<string, string>
      templateFiles: Map<string, string>
      backupFiles?: Map<string, string>
      templateValues?: TemplateValues
      configFileName: string
    },
  ) {
    this.id = id
    this.name = name ?? ''
    const workspaceFilePaths = Array.from(workspaceFiles.keys())
    const templateFilePaths = Array.from(templateFiles.keys())
    const backupFilePaths = backupFiles ? Array.from(backupFiles.keys()) : []

    this.path = getCommonBasePath(workspaceFilePaths)
    this.templatesPath = getCommonBasePath(templateFilePaths)
    this.backupsPath = backupFilePaths.length > 0 ? getCommonBasePath(backupFilePaths) : ''

    validateCommonBasePath(workspaceFilePaths, this.path)
    validateCommonBasePath(templateFilePaths, this.templatesPath)
    if (backupFilePaths.length > 0) {
      validateCommonBasePath(backupFilePaths, this.backupsPath)
    }

    this.#files = workspaceFiles
    this.#templates = templateFiles
    if (backupFiles) {
      // We don't _need_ backups made at this point.
      // Call this.backup() if desired at a later time.
      this.#backups = backupFiles
    }

    // Convert templateValues object to Map if provided
    if (templateValues) {
      this.#templateValues = new Map(Object.entries(templateValues))
    }

    this.configFileName = configFileName || DEFAULT_WORKSPACE_CONFIG_FILE_NAME
  }

  /**
   * Create a workspace by reading all files in the given paths.
   * NOTE: If no workspaceConfigFile is present in the workspacePath
   * one will be created and a first backup of the workspace will be made.
   *
   * @param options Configuration options for creating a workspace
   * @param options.workspacePath Path to the workspace directory, if not provided a temporary directory will be created
   * @param options.templatesPath Path to the templates directory, defaults to 'templates' directory in same folder as workspace.ts
   * @param options.templatesValues Optional values to replace placeholders with in template files
   * @param options.name Optional name for the workspace
   * @param options.configFileName Optional name for the configuration file, defaults to 'workspace.json'
   * @returns A new Workspace instance with an initial backup created
   * @throws Error if templatesPath doesn't exist or has no files
   * @throws Error if provided workspacePath doesn't exist or doesn't have write access
   */
  static async createWorkspace({
    workspacePath,
    templatesPath,
    templatesValues,
    name = 'default-workspace',
    configFileName = DEFAULT_WORKSPACE_CONFIG_FILE_NAME,
  }: {
    workspacePath?: string
    templatesPath?: string
    templatesValues?: TemplateValues
    name?: string
    configFileName?: string
  } = {}): Promise<Workspace> {
    const currentDir = join(fromFileUrl(import.meta.url), '..')

    // Validate or create paths
    const validWorkspacePath = workspacePath
      ? await Workspace.#validateWorkspacePath(workspacePath)
      : await Deno.makeTempDir({ prefix: DEFAULT_TEMP_PREFIX })

    const validTemplatesPath = templatesPath
      ? await Workspace.#validateTemplatesPath(templatesPath)
      : await Workspace.#validateTemplatesPath(join(currentDir, 'templates'))

    // Read files in parallel
    const [workspaceFiles, templateFiles] = await Promise.all([
      readFilesRecursively(validWorkspacePath),
      readFilesRecursively(validTemplatesPath),
    ])

    const id = await Workspace.#createIdFromPath(validWorkspacePath)

    // Initialize empty workspace if needed
    if (workspaceFiles.size === 0) {
      await Workspace.#initializeEmptyWorkspace({
        workspacePath: validWorkspacePath,
        templateFiles,
        id,
        name,
        templatesValues: templatesValues ?? undefined,
        configFileName,
        workspaceFiles,
      })
    }

    // Create and initialize the workspace
    const workspace = new Workspace({
      id,
      name,
      workspaceFiles,
      templateFiles,
      ...(templatesValues && { templateValues: templatesValues }),
      configFileName,
    })

    // Initialize the workspace
    await workspace.save()
    await workspace.backup()

    return workspace
  }

  /**
   * Initialize an empty workspace with configuration
   *
   * @param params Parameters for initializing the workspace
   * @private
   */
  static async #initializeEmptyWorkspace({
    workspacePath,
    templateFiles,
    id,
    name,
    templatesValues,
    configFileName,
    workspaceFiles,
  }: {
    workspacePath: string
    templateFiles: Map<string, string>
    id: string
    name?: string
    templatesValues?: TemplateValues | undefined
    configFileName: string
    workspaceFiles: Map<string, string>
  }): Promise<void> {
    const packageConfigPath = await getPackageForPath()
    if (!packageConfigPath) {
      throw new Error(
        'Missing package config file for this process. Looking for: deno.json, deno.jsonc, package.json, package.jsonc, jsr.json',
      )
    }

    const packageConfig = parseJSONC(await Deno.readTextFile(packageConfigPath)) as {
      name?: string
      version?: string
    }

    if (!packageConfig.name || !packageConfig.version) {
      throw new Error(
        'Missing required fields in package config for this process: name and version must be defined',
      )
    }

    const configName = configFileName.endsWith('.json') ? configFileName : `${configFileName}.json`

    const templateFileList = Array.from(templateFiles.keys())

    const workspaceConfig = {
      [`${packageConfig.name}-version`]: packageConfig.version,
      id,
      workspaceFiles: [],
      templateFiles: templateFileList,
      backupFiles: [],
      ...(name && { name }),
      ...(templatesValues && { templateValues: templatesValues }),
      ...(configName && { configName }),
    }

    const workspaceConfigFilePath = join(workspacePath, configName)
    const workspaceConfigFileJSON = JSON.stringify(workspaceConfig, null, 2)

    await Deno.writeTextFile(workspaceConfigFilePath, workspaceConfigFileJSON)
    workspaceFiles.set(workspaceConfigFilePath, workspaceConfigFileJSON)
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
  static async #createIdFromPath(path: string): Promise<string> {
    // Don't create errors for invalid workspace paths here.
    try {
      await Workspace.#validateWorkspacePath(path, false)
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
   * @param path Path to validate
   * @throws Error if the directory doesn't exist or contains no files
   */
  static async #validateTemplatesPath(path: string): Promise<string> {
    if (!await exists(path)) {
      throw new Error(`Templates directory '${path}' does not exist`)
    }

    const templateEntries = [...Deno.readDirSync(path)]
    if (!templateEntries.length) {
      throw new Error(
        `Templates directory '${path}' exists but contains no files`,
      )
    }

    return path
  }

  /**
   * Validate workspace directory exists, is valid, and has write access.
   * NOTE: A workspace directory CANNOT be in the same directory as this
   * code or and sub-directories thereof.
   *
   * @param path Path to validate
   * @returns The validated workspace path
   * @throws Error if the directory doesn't exist, lacks write access, or is the deno-kit source project
   */
  static async #validateWorkspacePath(path: string, withConfigFile = true): Promise<string> {
    try {
      // Check if the path is a banned directory (e.g system directories)
      if (await isBannedDirectory(path)) {
        throw new Error(`Workspace path '${path}' is a banned directory`)
      }
      // Check we have permission to write to the workspace path
      await checkDirectoryWriteAccess(path)

      // If we don't need to check for a config file we can return the path now
      if (withConfigFile === false) return path

      // Get package config file path of the process or package currently executing this module.
      const packageConfigPath = await getPackageForPath(path, {
        packageConfigFiles: ['deno.jsonc'],
      })
      if (!packageConfigPath) {
        throw new Error(
          `Cannot find package configuration. Looking for: ${PACKAGE_CONFIG_FILES.join(', ')}`,
        )
      }

      // Get workspace file of the current workspace. We'll compare to the packageConfigPath
      // to ensure we're not attempting to create a workspace in the same directory as this code itself.
      const workspaceConfigPath = await getPackageForPath(path, {
        packageConfigFiles: ['deno.jsonc'],
      })
      const isDenoKitSource = await (async () => {
        try {
          // ----------------------------------------------------------------
          // IMPORTANT: Since certain Workspace methods are destructive we
          // ensure no bugs ever set the workspace path to the root of the
          // deno-kit source code project in local development environments.
          // It is not fun to have the repo deleted on you along with its git
          // history, so we raise an error if this happens.
          // ----------------------------------------------------------------
          const workspaceConfig = parseJSONC(await Deno.readTextFile(workspaceConfigPath)) as {
            name?: string
          }
          const packageConfig = parseJSONC(await Deno.readTextFile(packageConfigPath)) as {
            name?: string
          }
          // Is the deno.jsonc file in the workspace the same of this source code?
          return workspaceConfig?.name === packageConfig?.name
        } catch (error) {
          if (!(error instanceof Deno.errors.NotFound)) {
            console.warn(
              `Error validating workspace path: ${path}. Unable to read package config file: ${
                error instanceof Error ? error.message : String(error)
              }`,
            )
          }
          return false
        }
      })()

      if (isDenoKitSource) {
        throw new Error('Cannot use the same directory this code is located in as a workspace')
      }

      return path
    } catch (error) {
      const message = error instanceof Error
        ? error.message.replace(/^(Path|Directory)/, 'Workspace directory')
        : String(error)
      throw new Error(message)
    }
  }

  /**
   * Creates a backup of all workspace files in a new temporary directory.
   * The backup is stored in a subdirectory named with the workspace's unique ID,
   * allowing multiple backups from different workspaces to coexist.
   *
   * @returns A map of backed up file paths to their contents
   */
  async backup(): Promise<Map<string, string>> {
    // Create a unique backup directory for the workspace based on its ID
    const backupBasePath = await Deno.makeTempDir({
      prefix: DEFAULT_BACKUPS_PREFIX,
      suffix: `-${this.id}`,
    })

    // Security check for banned directory
    if (await isBannedDirectory(backupBasePath)) {
      throw new Error(`Cannot create backup in banned directory: ${backupBasePath}`)
    }

    await ensureDir(backupBasePath)

    // Create a set of template filenames for filtering
    const templateFilenames = new Set(
      [...this.#templates.keys()].map((path) => basename(path)),
    )

    // Process files that aren't template files
    const backupFiles = new Map<string, string>()
    const backupOperations = [...this.#files.entries()]
      .filter(([path]) => !templateFilenames.has(basename(path)))
      .map(async ([path, content]) => {
        const backupPath = path.replace(this.path, backupBasePath)
        const parentDir = backupPath.substring(0, backupPath.lastIndexOf('/'))

        try {
          await ensureDir(parentDir)
          await copy(path, backupPath, { preserveTimestamps: true, overwrite: true })
          backupFiles.set(backupPath, content)
        } catch (error) {
          console.warn(
            `Failed to backup file ${path}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        }
      })

    await Promise.all(backupOperations)

    // Update internal state
    this.#backups = backupFiles

    // Update backupsPath if we have backup files
    if (backupFiles.size > 0) {
      this.backupsPath = getCommonBasePath(Array.from(backupFiles.keys()))
    }

    await this.save()
    return backupFiles
  }

  /**
   * Saves the workspace configuration to the file specified by configFileName
   */
  async save(): Promise<void> {
    await this.writeFile(this.configFileName, await this.toJSON())
  }

  /**
   * Runs a shell command in the workspace directory
   *
   * @param command The command to execute (e.g. 'git', 'npm')
   * @param args Command arguments (e.g. ['config', 'user.name'])
   * @returns The trimmed stdout output of the command
   * @throws Error If the command fails to execute or produces stderr output
   * @example
   * ```ts
   * const output = await workspace.runCommand('git', ['status'])
   * ```
   */
  async runCommand(command: string, args: string[] = []): Promise<string> {
    if (await isBannedDirectory(this.path)) {
      throw new Error(`Cannot run command in banned directory: ${this.path}`)
    }

    const options = {
      args,
      stdout: 'piped',
      stderr: 'piped',
      cwd: this.path,
    } as const

    try {
      const { stdout, stderr } = await new Deno.Command(command, options).output()
      const decoder = new TextDecoder()

      const error = decoder.decode(stderr).trim()
      if (error) throw new Error(`Command '${command}' failed with error: ${error}`)

      return decoder.decode(stdout).trim()
    } catch (error) {
      throw new Error(`Failed to execute command in workspace '${command}': ${String(error)}`)
    }
  }

  /**
   * Gets the git user name from git config
   *
   * @returns The git user name or empty string if not found
   */
  getGitUserName = async (): Promise<string> => {
    try {
      return await this.runCommand('git', ['config', 'user.name'])
    } catch (_) {
      return ''
    }
  }

  /**
   * Gets the git user email from git config
   *
   * @returns The git user email or empty string if not found
   */
  getGitUserEmail = async (): Promise<string> => {
    try {
      return await this.runCommand('git', ['config', 'user.email'])
    } catch (_) {
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
   * @throws Error If the path is not within the workspace directory or if writing fails
   */
  async writeFile(path: string, content: string, create = true): Promise<void> {
    const absolutePath = path.startsWith('/') ? path : join(this.path, path)

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
      console.warn(`File does not exist and create=false: ${absolutePath}`)
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

  /**
   * Compiles template files by replacing placeholder values with provided template values,
   * then saves the compiled templates to the workspace directory.
   * The template paths are adjusted to point to the workspace directory before saving.
   * Placeholders in templates should be in the format {PLACEHOLDER_NAME}.
   *
   * @param templateValues Optional values to replace placeholders with in template files
   * @param templateFiles Optional map of template files to use instead of this.#templates
   * @throws Error If writing any template file fails or if no template files or values are available
   * @example
   * ```ts
   * await workspace.compileAndWriteTemplates({
   *   PROJECT_NAME: "my-project",
   *   AUTHOR: "John Doe"
   * });
   * ```
   */
  async compileAndWriteTemplates(
    templateValues?: TemplateValues,
    templateFiles?: Map<string, string>,
  ): Promise<void> {
    const templatesMap = templateFiles || this.#templates

    if (templatesMap.size === 0) {
      throw new Error(
        'No template files available to compile. Please provide template files or ensure the workspace has templates.',
      )
    }

    // Merge template values using nullish coalescing and spread operators
    const existingValues = this.#templateValues.size > 0
      ? Object.fromEntries(this.#templateValues.entries())
      : {}

    const mergedTemplateValues = {
      ...existingValues,
      ...(templateValues ?? {}),
    } as TemplateValues

    if (Object.keys(mergedTemplateValues).length === 0) {
      throw new Error(
        'No template values provided. Please provide template values either during workspace creation or when calling compileAndWriteTemplates.',
      )
    }

    // Compile templates and prepare for writing
    const compiledTemplates = [...templatesMap.entries()].map(([path, content]) => {
      const processedContent = content.replace(
        /{([A-Z_]+)}/g,
        (_match, placeholder) => mergedTemplateValues[placeholder] ?? _match,
      )

      return [path.replace(this.templatesPath, this.path), processedContent]
    })

    // Write all templates to disk with Promise.all for parallelism
    await Promise.all(
      compiledTemplates.map(async ([path, content]) => {
        try {
          const dirPath = path.substring(0, path.lastIndexOf('/'))
          await ensureDir(dirPath)
          await Deno.writeTextFile(path, content)
        } catch (error) {
          throw new Error(
            `Failed to write template to workspace at '${path}': ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        }
      }),
    )

    await this.save()
  }

  /**
   * Convert workspace to JSON string representation including package information
   * @returns JSON string representation of workspace
   * @throws Error If package configuration cannot be found or loaded
   */
  async toJSON(): Promise<string> {
    const packageConfigPath = await getPackageForPath()

    if (!packageConfigPath) {
      throw new Error(
        'Cannot find package configuration. Looking for: deno.json, deno.jsonc, package.json, package.jsonc, jsr.json',
      )
    }

    try {
      const content = Deno.readTextFileSync(packageConfigPath)
      const packageConfig = parseJSONC(content) as { name?: string; version?: string }

      if (!packageConfig.name || !packageConfig.version) {
        throw new Error(
          'Missing required fields in package config: name and version must be defined',
        )
      }

      const workspaceSpecification: WorkspaceConfigFile = {
        [`${packageConfig.name}-version`]: packageConfig.version,
        id: this.id,
        name: this.name,
        workspaceFiles: Array.from(this.#files.keys()),
        templateFiles: Array.from(this.#templates.keys()),
        backupFiles: Array.from(this.#backups.keys()),
        templateValues: Object.fromEntries(this.#templateValues.entries()) as TemplateValues,
      }

      return JSON.stringify(workspaceSpecification, null, 2)
    } catch (error) {
      throw new Error(
        `Failed to load package information from config file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
}

export const { createWorkspace } = Workspace
