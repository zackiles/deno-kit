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
 * })
 *
 * // Load an existing workspace from config
 * const loadedWorkspace = await load("/path/to/workspace.json")
 *
 * // Validate a workspace config file
 * const config = JSON.parse(await Deno.readTextFile("workspace.json"))
 * if (isConfigFile(config)) {
 *   console.log("Valid workspace config:", config.id)
 * }
 *
 * // Access workspace data
 * console.log(await workspace.toJSON())
 * ```
 */
import { basename, dirname, fromFileUrl, join, relative } from '@std/path'
import { parse as parseJSONC } from '@std/jsonc'
import { exists } from '@std/fs'

import {
  checkDirectoryWriteAccess,
  getCommonBasePath,
  getPackageForPath,
  PACKAGE_CONFIG_FILES,
  readFilesRecursively,
  validateCommonBasePath,
} from '../utils/fs-extra.ts'
import { isBannedDirectory } from '../utils/banned-directories.ts'
import { WorkspaceFiles } from './workspace-files.ts'
import { WorkspaceTemplates } from './workspace-templates.ts'
import { WorkspaceBackups } from './workspace-backups.ts'
import type { WorkspaceConfigFile, WorkspaceLogger } from './workspace-types.ts'

const DEFAULT_TEMP_PREFIX = 'workspace-temp-'
const DEFAULT_WORKSPACE_CONFIG_FILE_NAME = 'workspace.json'

/**
 * Workspace class that manages files in workspace and template directories.
 * Provides functionality for file operations, template compilation, git configuration access,
 * and automatic workspace backups. All operations are restricted to the workspace directory
 * for security.
 */
export class Workspace {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly configFileName: string
  readonly templatesPath: string

  // Components
  #files: WorkspaceFiles
  #templates: WorkspaceTemplates
  #backups: WorkspaceBackups

  /**
   * Logger instance for the Workspace class
   */
  static logger: WorkspaceLogger = {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
    log: console.log,
  }

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
   * @param options.logger Optional logger instance to use for logging operations
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
      logger,
    }: {
      id: string
      name?: string
      workspaceFiles: Map<string, string>
      templateFiles: Map<string, string>
      backupFiles?: Map<string, string>
      templateValues?: { [key: string]: string }
      configFileName: string
      logger?: WorkspaceLogger
    },
  ) {
    this.id = id
    this.name = name ?? ''
    const workspaceFilePaths = Array.from(workspaceFiles.keys())
    const templateFilePaths = Array.from(templateFiles.keys())
    const backupFilePaths = backupFiles ? Array.from(backupFiles.keys()) : []

    // Set the static logger if provided
    if (logger) {
      Workspace.logger = logger
    }

    this.path = getCommonBasePath(workspaceFilePaths)
    this.templatesPath = getCommonBasePath(templateFilePaths)
    const backupsPath = backupFilePaths.length > 0 ? getCommonBasePath(backupFilePaths) : ''

    validateCommonBasePath(workspaceFilePaths, this.path)
    validateCommonBasePath(templateFilePaths, this.templatesPath)
    if (backupFilePaths.length > 0) {
      validateCommonBasePath(backupFilePaths, backupsPath)
    }

    this.configFileName = configFileName || DEFAULT_WORKSPACE_CONFIG_FILE_NAME

    // Initialize components
    this.#files = new WorkspaceFiles(this.path, Workspace.logger)
    this.#templates = new WorkspaceTemplates(this.templatesPath, this.path, Workspace.logger)
    this.#backups = new WorkspaceBackups(this.path, backupsPath, Workspace.logger)

    // Set initial state
    this.#files.files = workspaceFiles
    this.#templates.setTemplates(templateFiles)

    if (backupFiles) {
      this.#backups.setBackups(backupFiles)
    }

    if (templateValues) {
      this.#templates.setTemplateValues(templateValues)
    }
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
   * @param options.logger Optional logger instance to use for logging operations
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
    logger,
  }: {
    workspacePath?: string
    templatesPath?: string
    templatesValues?: { [key: string]: string }
    name?: string
    configFileName?: string
    logger?: WorkspaceLogger
  } = {}): Promise<Workspace> {
    // Set the static logger if provided
    if (logger) {
      Workspace.logger = logger
    }

    const currentDir = join(fromFileUrl(import.meta.url), '../..')
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
    const [workspaceFiles, templateFilesFromFileSystem] = await Promise.all([
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
        templateFiles: templateFilesFromFileSystem, // Pass the Map of templates read from FS
        id,
        name,
        templatesValues: templatesValues ?? undefined,
        configFileName,
        workspaceFiles, // Pass the (empty) workspaceFiles Map to be populated
        baseTemplatesPath: validTemplatesPath, // Pass the base path of the templates
      })
    }

    // Create and initialize the workspace
    const workspace = new Workspace({
      id,
      name,
      workspaceFiles,
      templateFiles: templateFilesFromFileSystem,
      ...(templatesValues && { templateValues: templatesValues }),
      configFileName,
      ...(logger && { logger }),
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
    baseTemplatesPath,
  }: {
    workspacePath: string
    templateFiles: Map<string, string>
    id: string
    name?: string
    templatesValues?: { [key: string]: string } | undefined
    configFileName: string
    workspaceFiles: Map<string, string>
    baseTemplatesPath: string
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

    const templateFileList = Array.from(templateFiles.keys()).map((p) =>
      relative(baseTemplatesPath, p)
    )

    const workspaceConfig: WorkspaceConfigFile = {
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
            Workspace.logger.warn(
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
    // Create a set of template filenames for filtering
    const templateFilenames = new Set(
      [...this.#templates.templates.keys()].map((path) => basename(path)),
    )

    // Get the full path of the config file
    const configFilePath = join(this.path, this.configFileName)

    // Perform backup
    const backupFilesMap = await this.#backups.backup(
      this.#files.files,
      this.id,
      templateFilenames,
      configFilePath,
    )

    await this.save()
    return backupFilesMap
  }

  /**
   * Saves the workspace configuration to the file specified by configFileName.
   * Preserves the original file extension (.json or .jsonc).
   */
  async save(): Promise<void> {
    const configFilePath = this.configFileName
    await this.#files.writeFile(configFilePath, await this.toJSON())
  }

  /**
   * Runs a shell command in the specified directory
   *
   * @param command The command to execute (e.g. 'git', 'npm')
   * @param args Command arguments (e.g. ['config', 'user.name'])
   * @param options.useWorkspacePath If true, uses the workspace path; if false, uses current directory
   * @returns The trimmed stdout output of the command
   * @throws Error If the command fails to execute or produces stderr output
   * @example
   * ```ts
   * // Instance usage (uses workspace.path)
   * const output = await workspace.runCommand('git', ['status']);
   *
   * // Static usage (uses current directory)
   * const output = await Workspace.runCommand('git', ['status']);
   * ```
   */
  static async runCommand(
    command: string,
    args: string[] = [],
    options?: { useWorkspacePath?: boolean },
  ): Promise<string> {
    // biome-ignore lint/complexity/noThisInStatic: Required for dual static/instance functionality
    const path = options?.useWorkspacePath ? (this as unknown as Workspace).path : Deno.cwd()

    if (await isBannedDirectory(path)) {
      throw new Error(`Cannot run command in banned directory: ${path}`)
    }

    // Handle special case for deno commands in test mode
    if (command === 'deno' && Deno.env.get('DENO_KIT_ENV') === 'test') {
      // Use a special environment to make deno use local files
      // instead of attempting to download from JSR
      const env: Record<string, string> = {
        DENO_KIT_USE_LOCAL_FILES: 'true',
      }

      const cmdOptions = {
        args,
        stdout: 'piped',
        stderr: 'piped',
        cwd: path,
        env,
      } as const

      try {
        const { stdout, stderr } = await new Deno.Command(command, cmdOptions).output()
        const decoder = new TextDecoder()

        const error = decoder.decode(stderr).trim()
        if (error) throw new Error(`Command '${command}' failed with error: ${error}`)

        return decoder.decode(stdout).trim()
      } catch (error) {
        const errorMessage = error instanceof Error
          ? `${error.message}${error.stack ? `\nStack trace: ${error.stack}` : ''}`
          : String(error)
        throw new Error(
          `Failed to execute command ${
            options?.useWorkspacePath ? 'in workspace' : ''
          } '${command}': ${errorMessage}`,
        )
      }
    }

    // Regular command handling for non-deno or non-test cases
    const cmdOptions = {
      args,
      stdout: 'piped',
      stderr: 'piped',
      cwd: path,
    } as const

    try {
      const { stdout, stderr } = await new Deno.Command(command, cmdOptions).output()
      const decoder = new TextDecoder()

      const error = decoder.decode(stderr).trim()
      if (error) throw new Error(`Command '${command}' failed with error: ${error}`)

      return decoder.decode(stdout).trim()
    } catch (error) {
      const errorMessage = error instanceof Error
        ? `${error.message}${error.stack ? `\nStack trace: ${error.stack}` : ''}`
        : String(error)
      throw new Error(
        `Failed to execute command ${
          options?.useWorkspacePath ? 'in workspace' : ''
        } '${command}': ${errorMessage}`,
      )
    }
  }

  // Instance method implementation
  runCommand(command: string, args: string[] = []): Promise<string> {
    return Workspace.runCommand.call(this, command, args, { useWorkspacePath: true })
  }

  /**
   * Gets the git user name from git config
   *
   * @param options.useWorkspacePath If true, uses the workspace path; if false, uses current directory
   * @returns The git user name or empty string if not found
   * @example
   * ```ts
   * // Instance usage (uses workspace.path)
   * const name = await workspace.getGitUserName();
   *
   * // Static usage (uses current directory)
   * const name = await Workspace.getGitUserName();
   * ```
   */
  static async getGitUserName(options?: { useWorkspacePath?: boolean }): Promise<string> {
    try {
      return await Workspace.runCommand.call(
        // biome-ignore lint/complexity/noThisInStatic: Required for dual static/instance functionality
        this,
        'git',
        ['config', 'user.name'],
        options,
      )
    } catch (_) {
      return ''
    }
  }

  // Instance method implementation
  getGitUserName(): Promise<string> {
    return Workspace.getGitUserName.call(this, { useWorkspacePath: true })
  }

  /**
   * Gets the git user email from git config
   *
   * @param options.useWorkspacePath If true, uses the workspace path; if false, uses current directory
   * @returns The git user email or empty string if not found
   * @example
   * ```ts
   * // Instance usage (uses workspace.path)
   * const email = await workspace.getGitUserEmail();
   *
   * // Static usage (uses current directory)
   * const email = await Workspace.getGitUserEmail();
   * ```
   */
  static async getGitUserEmail(options?: { useWorkspacePath?: boolean }): Promise<string> {
    try {
      return await Workspace.runCommand.call(
        // biome-ignore lint/complexity/noThisInStatic: Required for dual static/instance functionality
        this,
        'git',
        ['config', 'user.email'],
        options,
      )
    } catch (_) {
      return ''
    }
  }

  // Instance method implementation
  getGitUserEmail(): Promise<string> {
    return Workspace.getGitUserEmail.call(this, { useWorkspacePath: true })
  }

  /**
   * Writes a file to the workspace directory using the WorkspaceFiles component
   */
  async writeFile(path: string, content: string, create = true): Promise<void> {
    await this.#files.writeFile(path, content, create)
  }

  /**
   * Compiles and writes templates using the WorkspaceTemplates component
   */
  async compileAndWriteTemplates(
    templateValues?: { [key: string]: string },
    templateFiles?: Map<string, string>,
  ): Promise<void> {
    await this.#templates.compileAndWriteTemplates(templateValues, templateFiles)
    await this.save()
  }

  /**
   * Reset the workspace by copying files from the backup directory to the workspace directory
   * using the WorkspaceBackups component
   */
  async reset(): Promise<void> {
    await this.#backups.reset()
    this.#files = new WorkspaceFiles(this.path, Workspace.logger)
    await this.#files.loadFiles()
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

      // Get template paths and ensure they are relative
      // Fix overly-escaped paths by simplifying to base filename if needed
      const templateFiles = this.#templates.getRelativeTemplatePaths().map((path) => {
        // If the path starts with "../", it's likely a path that couldn't be properly relativized
        // In this case, extract just the filename
        if (path.startsWith('../') || path.includes(':/')) {
          const parts = path.split('/')
          return parts[parts.length - 1]
        }
        return path
      })

      const workspaceSpecification: WorkspaceConfigFile = {
        [packageConfig.name]: packageConfig.version,
        id: this.id,
        name: this.name,
        workspaceFiles: Array.from(this.#files.files.keys()).map((p) => relative(this.path, p)),
        templateFiles,
        backupFiles: this.#backups.originalPathsForBackup.map((p) => relative(this.path, p)),
        templateValues: Object.fromEntries(this.#templates.templateValues.entries()) as {
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
      const configDir = dirname(configFilePath)

      // Read files listed in the config file
      const workspaceFiles = new Map<string, string>()
      const templateFiles = new Map<string, string>()
      const _backupFiles = new Map<string, string>()

      // Load the files from the paths specified in the config
      await Promise.all([
        // Load workspace files
        ...parsedConfig.workspaceFiles.map(async (relativePath) => {
          const absolutePath = join(configDir, relativePath)
          try {
            const content = await Deno.readTextFile(absolutePath)
            workspaceFiles.set(absolutePath, content)
          } catch (error) {
            Workspace.logger.warn(`Failed to read workspace file ${absolutePath}: ${error}`)
          }
        }),
        // Load template files
        ...parsedConfig.templateFiles.map(async (relativePath) => {
          const absolutePath = join(configDir, relativePath)
          try {
            const content = await Deno.readTextFile(absolutePath)
            templateFiles.set(absolutePath, content)
          } catch (error) {
            Workspace.logger.warn(`Failed to read template file ${absolutePath}: ${error}`)
            // Add a placeholder content for missing template files to prevent issues
            templateFiles.set(absolutePath, `# Template placeholder for ${relativePath}`)
          }
        }),
        // Backup files listed in config are original paths, not copies.
        // We will store these original paths (made absolute) for later use if backup() is called.
        // The actual backup copies are not loaded from config by default.
      ])

      // Verify we loaded at least the workspace files
      if (workspaceFiles.size === 0 && parsedConfig.workspaceFiles.length > 0) {
        Workspace.logger.warn(
          'Workspace configuration listed workspace files, but none could be loaded.',
        )
        // Allow loading an empty workspace if workspaceFiles in config is empty
        if (parsedConfig.workspaceFiles.length > 0) {
          throw new Error('No workspace files could be loaded from configuration')
        }
      }

      const originalBackupPaths = parsedConfig.backupFiles.map((relativePath) =>
        join(configDir, relativePath)
      )

      // If we have no workspace files, set config dir as workspace path to avoid empty path errors
      if (workspaceFiles.size === 0) {
        workspaceFiles.set(configFilePath, configContent)
      }

      // Create and return a new workspace instance
      const workspace = new Workspace({
        id: parsedConfig.id,
        ...(parsedConfig.name && { name: parsedConfig.name }),
        workspaceFiles,
        templateFiles,
        // backupFiles Map is not populated here from config, only #originalPathsForBackup
        ...(parsedConfig.templateValues && Object.keys(parsedConfig.templateValues).length > 0 && {
          templateValues: parsedConfig.templateValues,
        }),
        configFileName,
      })

      // Set the original backup paths
      workspace.#backups.setOriginalPathsForBackup(originalBackupPaths)

      return workspace
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
   * Get the path where backups are stored
   */
  get backupsPath(): string {
    return this.#backups.backupsPath
  }
}

export const { create, load, isConfigFile, getGitUserName, getGitUserEmail } = Workspace
export type { WorkspaceConfigFile }
