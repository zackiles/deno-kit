/**
 * @module workspace
 *
 * Provides a Workspace class for managing files in workspace and template directories.
 * Supports file operations, template compilation, and workspace backups.
 *
 * @example
 * ```ts
 * // Create a new workspace
 * const workspace = await create({
 *   templatesPath: "./templates"
 * });
 *
 * // Load an existing workspace from config
 * const loadedWorkspace = await load("/path/to/workspace.json");
 *
 * // Validate a workspace config file
 * const config = JSON.parse(await Deno.readTextFile("workspace.json"));
 * if (isConfigFile(config)) {
 *   console.log("Valid workspace config:", config.id);
 * }
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
import { isBannedDirectory } from './utils/banned-directories.ts'

const DEFAULT_TEMP_PREFIX = 'workspace-temp-'
const DEFAULT_BACKUPS_PREFIX = 'workspace-backups-'
const DEFAULT_WORKSPACE_CONFIG_FILE_NAME = 'workspace.json'

/**
 * Specification for the workspace config file that defines the workspace configuration
 */
interface WorkspaceConfigFile {
  /** Unique identifier for the workspace */
  id: string
  /** List of file paths in the workspace */
  name?: string
  workspaceFiles: string[]
  /** List of template file paths */
  templateFiles: string[]
  /** List of backup file paths */
  backupFiles: string[]
  /** Template values for the workspace */
  templateValues: { [key: string]: string }
}

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
      templateValues?: { [key: string]: string }
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
  static async create({
    workspacePath,
    templatesPath,
    templatesValues,
    name = 'default-workspace',
    configFileName = DEFAULT_WORKSPACE_CONFIG_FILE_NAME,
  }: {
    workspacePath?: string
    templatesPath?: string
    templatesValues?: { [key: string]: string }
    name?: string
    configFileName?: string
  } = {}): Promise<Workspace> {
    const currentDir = join(fromFileUrl(import.meta.url), '..')
    // Ensure the user-supplied workspace configFileName ends with .json
    configFileName = configFileName.endsWith('.json') ? configFileName : `${configFileName}.json`

    // Validate workspace path of fallback to temporary directory to create paths
    const validWorkspacePath = workspacePath
      ? await Workspace.#validateWorkspacePath(workspacePath, false)
      : await Deno.makeTempDir({ prefix: DEFAULT_TEMP_PREFIX })

    // Validate templates path of fallback to templates directory in same folder as this code file
    const validTemplatesPath = templatesPath
      ? await Workspace.#validateTemplatesPath(templatesPath)
      : await Workspace.#validateTemplatesPath(join(currentDir, 'templates'))

    // Read all workspace and template files
    const [workspaceFiles, templateFiles] = await Promise.all([
      readFilesRecursively(validWorkspacePath),
      readFilesRecursively(validTemplatesPath),
    ])

    const id = await Workspace.#createIdFromPath(validWorkspacePath)

    // Check if a workspace config file already exists
    const hasConfigFile = Array.from(workspaceFiles.keys()).some((path) =>
      basename(path) === configFileName
    )
    if (hasConfigFile) {
      throw new Error(
        `Can't create workspace ${name || id}. Workspace already exists at ${validWorkspacePath}`,
      )
    }

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

    await workspace.save()
    await workspace.backup()

    return workspace
  }

  /**
   * Initialize an empty workspace directory with configuration.
   * Simply generates and saves a workspace config file at the provided path.
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
    templatesValues?: { [key: string]: string } | undefined
    configFileName: string
    workspaceFiles: Map<string, string>
  }): Promise<void> {
    // packageConfigPath is the path of the package config file for the process or package currently executing this module.
    const packageConfigPath = await getPackageForPath()
    // Ensure the user-supplied workspace configFileName ends with .json
    configFileName = configFileName.endsWith('.json') ? configFileName : `${configFileName}.json`

    if (!packageConfigPath) {
      throw new Error(
        'Workspace.initializeEmptyWorkspace: Missing package config file for this process. Looking for: deno.json, deno.jsonc, package.json, package.jsonc, jsr.json',
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

    const templateFileList = Array.from(templateFiles.keys())

    const workspaceConfig = {
      [`${packageConfig.name}-version`]: packageConfig.version,
      id,
      workspaceFiles: [],
      templateFiles: templateFileList,
      backupFiles: [],
      ...(name && { name }),
      ...(templatesValues && { templateValues: templatesValues }),
      ...(configFileName && { configFileName }),
    }

    const workspaceConfigFilePath = join(workspacePath, configFileName)
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
          `Workspace.#validateWorkspacePath: Cannot find package configuration. Looking for: ${
            PACKAGE_CONFIG_FILES.join(', ')
          }`,
        )
      }

      // Get workspace file of the current workspace (if it exists). We'll compare to the package at packageConfigPath
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
    // If backupsPath is set, verify it exists, otherwise create a temp directory
    let backupBasePath: string

    if (this.backupsPath) {
      // Reuse existing backupsPath if set
      if (!await exists(this.backupsPath)) {
        throw new Error(`Backup path set but does not exist: ${this.backupsPath}`)
      }
      backupBasePath = this.backupsPath
    } else {
      // Create a unique backup directory for the workspace based on its ID
      backupBasePath = await Deno.makeTempDir({
        prefix: DEFAULT_BACKUPS_PREFIX,
        suffix: `-${this.id}`,
      })
      this.backupsPath = backupBasePath
    }

    // Security check for banned directory
    if (await isBannedDirectory(backupBasePath)) {
      throw new Error(`Cannot create backup in banned directory: ${backupBasePath}`)
    }

    await ensureDir(backupBasePath)

    // Create a set of template filenames for filtering
    const templateFilenames = new Set(
      [...this.#templates.keys()].map((path) => basename(path)),
    )

    // Get the full path of the config file
    const configFilePath = join(this.path, this.configFileName)

    // Process files that aren't template files or the config file
    const backupFiles = new Map<string, string>()
    const backupOperations = [...this.#files.entries()]
      .filter(([path]) => !templateFilenames.has(basename(path)) && path !== configFilePath)
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

    // Update backupsPath if we have backup files to ensure we use the common base path
    if (backupFiles.size > 0) {
      this.backupsPath = getCommonBasePath(Array.from(backupFiles.keys()))
    }

    await this.save()
    return backupFiles
  }

  /**
   * Saves the workspace configuration to the file specified by configFileName.
   * Preserves the original file extension (.json or .jsonc).
   */
  async save(): Promise<void> {
    const configFilePath = this.configFileName
    await this.writeFile(configFilePath, await this.toJSON())
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
    templateValues?: { [key: string]: string },
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
    } as { [key: string]: string }

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
        'Workspace.toJSON: Cannot find package configuration. Looking for: deno.json, deno.jsonc, package.json, package.jsonc, jsr.json',
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
        [packageConfig.name]: packageConfig.version,
        id: this.id,
        name: this.name,
        workspaceFiles: Array.from(this.#files.keys()),
        templateFiles: Array.from(this.#templates.keys()),
        backupFiles: Array.from(this.#backups.keys()),
        templateValues: Object.fromEntries(this.#templateValues.entries()) as {
          [key: string]: string
        },
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

  /**
   * Type guard to validate if a value matches the WorkspaceConfigFile structure
   *
   * @param value The value to check
   * @returns True if the value matches the WorkspaceConfigFile structure
   */
  static isConfigFile(value: unknown): value is WorkspaceConfigFile {
    if (!value || typeof value !== 'object') return false
    const config = value as Partial<WorkspaceConfigFile>
    return (
      typeof config.id === 'string' &&
      Array.isArray(config.workspaceFiles) &&
      Array.isArray(config.templateFiles) &&
      Array.isArray(config.backupFiles)
    )
  }

  /**
   * Load an existing workspace from a configuration file.
   *
   * @param configFilePath Absolute path to a workspace configuration JSON/JSONC file
   * @returns A new Workspace instance loaded from the configuration
   * @throws Error if the configuration file doesn't exist or can't be parsed
   * @throws Error if the required files can't be loaded
   */
  static async load(configFilePath: string): Promise<Workspace> {
    try {
      const configContent = await Deno.readTextFile(configFilePath)
      const parsedConfig = parseJSONC(configContent)

      // Validate the config structure
      if (!Workspace.isConfigFile(parsedConfig)) {
        throw new Error(`Workspace configuration file ${configFilePath} is not valid.`)
      }

      // Extract the config file name
      const configFileName = basename(configFilePath)

      // Read files listed in the config file
      const workspaceFiles = new Map<string, string>()
      const templateFiles = new Map<string, string>()
      const backupFiles = new Map<string, string>()

      // Load the files from the paths specified in the config
      await Promise.all([
        // Load workspace files
        ...parsedConfig.workspaceFiles.map(async (path) => {
          try {
            const content = await Deno.readTextFile(path)
            workspaceFiles.set(path, content)
          } catch (error) {
            console.warn(`Failed to read workspace file ${path}: ${error}`)
          }
        }),
        // Load template files
        ...parsedConfig.templateFiles.map(async (path) => {
          try {
            const content = await Deno.readTextFile(path)
            templateFiles.set(path, content)
          } catch (error) {
            console.warn(`Failed to read template file ${path}: ${error}`)
          }
        }),
        // Load backup files
        ...parsedConfig.backupFiles.map(async (path) => {
          try {
            const content = await Deno.readTextFile(path)
            backupFiles.set(path, content)
          } catch (error) {
            console.warn(`Failed to read backup file ${path}: ${error}`)
          }
        }),
      ])

      // Verify we loaded at least the workspace files
      if (workspaceFiles.size === 0) {
        throw new Error('No workspace files could be loaded from configuration')
      }

      // Create and return a new workspace instance
      return new Workspace({
        id: parsedConfig.id,
        ...(parsedConfig.name && { name: parsedConfig.name }),
        workspaceFiles,
        templateFiles,
        ...(backupFiles.size > 0 && { backupFiles }),
        ...(Object.keys(parsedConfig.templateValues).length > 0 && {
          templateValues: parsedConfig.templateValues,
        }),
        configFileName,
      })
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        throw new Error(`Workspace configuration file not found: ${configFilePath}`)
      }
      throw new Error(
        `Failed to load workspace from configuration file '${configFilePath}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
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
        const relativePath = backupPath.substring(this.backupsPath.length)
        // Create a clean, platform-independent path by using join
        const workspacePath = join(this.path, relativePath.replace(/^\//, ''))
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
      this.#files = await readFilesRecursively(this.path)

      // Save the updated workspace configuration
      await this.save()
    } catch (error) {
      throw new Error(
        `Reset operation failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

export const { create, load, isConfigFile } = Workspace
export type { Workspace, WorkspaceConfigFile }
