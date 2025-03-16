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

import { fromFileUrl, join } from '@std/path'
import {
  checkDirectoryWriteAccess,
  getCommonBasePath,
  getPackageForPath,
  PACKAGE_CONFIG_FILES,
  readFilesRecursively,
  validateCommonBasePath,
} from './utils/fs-extra.ts'
import { parse as parseJSONC } from '@std/jsonc'
import type { KitFileSpecification, TemplateValues } from './types.ts'
import { isBannedDirectory } from './utils/banned-directories.ts'

const DEFAULT_TEMP_PREFIX = 'deno-kit-workspace-'
const DEFAULT_BACKUPS_PREFIX = 'deno-kit-backups-'
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
  readonly backupsPath: string
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
    this.backupsPath = getCommonBasePath(backupFilePaths)

    validateCommonBasePath(workspaceFilePaths, this.path)
    validateCommonBasePath(templateFilePaths, this.templatesPath)
    validateCommonBasePath(backupFilePaths, this.backupsPath)

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
   * Create a workspace by reading all files in the given paths and creating a backup.
   *
   * @param options Configuration options for creating a workspace
   * @param options.workspacePath Path to the workspace directory, if not provided a temporary directory will be created
   * @param options.templatesPath Path to the templates directory, defaults to 'templates' directory in same folder as workspace.ts
   * @param options.templatesValues Optional values to replace placeholders with in template files
   * @param options.name Optional name for the workspace
   * @param options.configFileName Optional name for the configuration file, defaults to 'kit.json'
   * @returns A new Workspace instance with an initial backup created
   * @throws Error if templatesPath doesn't exist or has no files
   * @throws Error if provided workspacePath doesn't exist or doesn't have write access
   */
  static async createWorkspace({
    workspacePath,
    templatesPath,
    templatesValues,
    name,
    configFileName,
  }: {
    workspacePath?: string
    templatesPath?: string
    templatesValues?: TemplateValues
    name?: string
    configFileName?: string
  } = {}): Promise<Workspace> {
    // If a path isn't provided we fallback on a Deno temporary directory
    workspacePath = workspacePath
      ? await Workspace.#validateWorkspacePath(workspacePath)
      : await Deno.makeTempDir({ prefix: DEFAULT_TEMP_PREFIX })

    const currentDir = fromFileUrl(import.meta.url)
    templatesPath = templatesPath
      ? await Workspace.#validateTemplatesPath(templatesPath)
      : await Workspace.#validateTemplatesPath(join(currentDir, '..', 'templates'))

    await Workspace.#validateTemplatesPath(templatesPath)

    const [workspaceFiles, templateFiles] = await Promise.all([
      readFilesRecursively(workspacePath),
      readFilesRecursively(templatesPath),
    ])

    const id = await Workspace.createIdFromPath(workspacePath)

    if (workspaceFiles.size === 0) {
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

      const configName = (() => {
        const name = configFileName || DEFAULT_WORKSPACE_CONFIG_FILE_NAME
        return name.endsWith('.json') ? name : `${name}.json`
      })()

      const templateFileList = Array.from(templateFiles.keys())

      const kitFileObject = {
        [`${packageConfig.name}-version`]: packageConfig.version,
        id,
        workspaceFiles: [],
        templateFiles: templateFileList,
        backupFiles: [],
        ...(name && { name }),
        ...(templatesValues && { templateValues: templatesValues }),
        ...(configName && { configName }),
      }

      const kitFilePath = join(workspacePath, configName)
      const kitFileContent = JSON.stringify(kitFileObject, null, 2)

      await Deno.writeTextFile(kitFilePath, kitFileContent)
      workspaceFiles.set(kitFilePath, kitFileContent)
    }

    const workspace = new Workspace({
      id,
      name: name ?? 'default-workspace',
      workspaceFiles,
      templateFiles,
      ...(templatesValues && { templateValues: templatesValues }),
      configFileName: configFileName || DEFAULT_WORKSPACE_CONFIG_FILE_NAME,
    })

    await workspace.#backup()
    await workspace.#save()
    return workspace
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
  static async createIdFromPath(path: string): Promise<string> {
    // Don't create errors for invalid workspace paths here.
    try {
      await Workspace.#validateWorkspacePath(path)
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
    try {
      const templateEntries = [...Deno.readDirSync(path)]
      if (!templateEntries.length) {
        throw new Error(
          `Templates directory '${path}' exists but contains no files`,
        )
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`Templates directory '${path}' does not exist`)
      }
      throw error
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
  static async #validateWorkspacePath(path: string): Promise<string> {
    try {
      // Check if the path is a banned directory (e.g system directories)
      if (await isBannedDirectory(path)) {
        throw new Error(`Workspace path '${path}' is a banned directory`)
      }

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
        throw new Error('Cannot use the deno-kit source project directory as a workspace')
      }

      await checkDirectoryWriteAccess(path)
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
  async #backup(): Promise<Map<string, string>> {
    // Create a unique backup directory for the workspace based on its workspaceID
    const backupBasePath = await Deno.makeTempDir({
      prefix: DEFAULT_BACKUPS_PREFIX,
      suffix: `-${this.id}`,
    })

    // Check if backup directory is banned
    if (await isBannedDirectory(backupBasePath)) {
      throw new Error(`Cannot create backup in banned directory: ${backupBasePath}`)
    }

    const backupFiles = new Map<string, string>()

    for (const [path, content] of this.#files.entries()) {
      const backupPath = path.replace(this.path, backupBasePath)
      backupFiles.set(backupPath, content)
    }

    return backupFiles
  }

  /**
   * Saves the workspace configuration to the file specified by configFileName
   *
   * @private
   */
  async #save(): Promise<void> {
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
   * const output = await workspace.#runCommandInWorkspace('git', ['status'])
   * ```
   */
  async #runCommandInWorkspace(
    command: string,
    args: string[] = [],
  ): Promise<string> {
    // Check if workspace directory is banned
    if (await isBannedDirectory(this.path)) {
      throw new Error(`Cannot run command in banned directory: ${this.path}`)
    }

    const decoder = new TextDecoder()
    const options = {
      args,
      stdout: 'piped',
      stderr: 'piped',
      cwd: this.path,
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
   * @returns The git user name or empty string if not found
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
   * @returns The git user email or empty string if not found
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
   * @throws Error If the path is not within the workspace directory or if writing fails
   */
  async writeFile(path: string, content: string, create = true): Promise<void> {
    const absolutePath = path.startsWith('/') ? path : join(this.path, path)

    if (!absolutePath.startsWith(this.path)) {
      throw new Error(`Cannot write file outside of workspace: ${absolutePath}`)
    }

    const parentDir = absolutePath.substring(0, absolutePath.lastIndexOf('/'))

    // Check if parent directory is banned
    if (await isBannedDirectory(parentDir)) {
      throw new Error(`Cannot write file in banned directory: ${parentDir}`)
    }

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

    // Merge class-level template values with provided ones, with provided values taking precedence
    const mergedTemplateValues: TemplateValues = {
      ...(this.#templateValues.size > 0 ? Object.fromEntries(this.#templateValues.entries()) : {}),
      ...(templateValues || {}),
    } as TemplateValues

    // Error if no template values are available
    if (Object.keys(mergedTemplateValues).length === 0) {
      throw new Error(
        'No template values provided. Please provide template values either during workspace creation or when calling compileAndWriteTemplates.',
      )
    }

    const compiledTemplates = new Map<string, string>()

    // First compile all templates with their values
    for (const [path, content] of templatesMap.entries()) {
      const processedContent = content.replace(
        /{([A-Z_]+)}/g,
        (_match, placeholder) =>
          placeholder in mergedTemplateValues ? mergedTemplateValues[placeholder] : _match,
      )

      // Rewrite the base path of the template files to be the workspace path before writing them
      const workspacePath = path.replace(this.templatesPath, this.path)
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
   * Convert workspace to JSON string representation including package information
   * @returns JSON string representation of workspace
   * @throws Error If package configuration cannot be found or loaded
   */
  async toJSON(): Promise<string> {
    // Get package config
    const packageConfigPath = await getPackageForPath()
    if (!packageConfigPath) {
      throw new Error(
        'Cannot find package configuration. Looking for: deno.json, deno.jsonc, package.json, package.jsonc, jsr.json',
      )
    }

    // Parse package config
    let packageConfig: { name?: string; version?: string } = {}
    try {
      const content = Deno.readTextFileSync(packageConfigPath)
      packageConfig = parseJSONC(content) as { name?: string; version?: string }
      if (!packageConfig.name || !packageConfig.version) {
        throw new Error(
          'Missing required fields in package config: name and version must be defined',
        )
      }
    } catch (error) {
      throw new Error(
        `Failed to load package information from config file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    const workspaceSpecification: KitFileSpecification = {
      [`${packageConfig.name}-version`]: packageConfig.version,
      id: this.id,
      name: this.name,
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

export const { createWorkspace } = Workspace
