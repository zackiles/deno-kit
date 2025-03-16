/**
 * @module generate
 * @description Template generator for Deno libraries
 *
 * This script generates a new Deno library from templates, replacing placeholders
 * with user-provided values. It handles package metadata, GitHub information,
 * and other configuration details.
 *
 * @example
 * ```bash
 * deno run --allow-read --allow-write --allow-run --allow-env .deno-kit/generate.ts
 * ```
 */

import { dirname, join } from '@std/path'
import { ensureDir } from '@std/fs'
import { getConfig } from '../config.ts'
import { setupOrUpdateCursorConfig } from '../utils/cursor-config.ts'

// Get configuration to access kitDir and templatesDir
const config = await getConfig()

// Define the template placeholders and their corresponding values
interface TemplateValues {
  /** Full package name including scope (e.g., "@deno/example") */
  PACKAGE_NAME: string

  /** Package scope with @ symbol (e.g., "@deno") */
  PACKAGE_SCOPE: string

  /** Semantic version number (e.g., "1.0.0") */
  PACKAGE_VERSION: string

  /** Author's full name (e.g., "John Doe") */
  PACKAGE_AUTHOR_NAME: string

  /** Author's email address (e.g., "john.doe@example.com") */
  PACKAGE_AUTHOR_EMAIL: string

  /** Short description of the package (e.g., "A modern HTTP client for Deno") */
  PACKAGE_DESCRIPTION: string

  /** GitHub username or organization without @ (e.g., "denoland") */
  PACKAGE_GITHUB_USER: string

  /** Current year for license and documentation (e.g., "2024") */
  YEAR: string

  /** Package name without scope (e.g., "example" from "@deno/example") */
  PROJECT_NAME: string

  /** Allow string indexing for dynamic template values */
  [key: string]: string
}

/**
 * Creates dynamic template mappings for template files found in the templates directory.
 * This function supports nested directory structures and recursively finds templates.
 *
 * @param {string} templatesDir - The root directory containing templates
 * @returns {Record<string, string>} A mapping of template paths to destination paths
 */
async function createTemplateMappings(
  templatesDir: string,
): Promise<Record<string, string>> {
  const mappings: Record<string, string> = {}

  // Helper function to recursively scan directories for templates
  async function scanDir(dir: string, relativePath = ''): Promise<void> {
    try {
      for await (const entry of Deno.readDir(dir)) {
        const entryPath = join(dir, entry.name)
        const relPath = relativePath ? join(relativePath, entry.name) : entry.name

        if (entry.isDirectory) {
          // Recursively scan subdirectories
          await scanDir(entryPath, relPath)
        } else if (entry.isFile && entry.name.includes('.template.')) {
          // Create a destination path by removing '.template' from filename
          const destFilename = entry.name.replace('.template', '')
          // Create the destination path, preserving the directory structure
          const destRelPath = dirname(relPath) === '.' ? '' : dirname(relPath)
          const destPath = join('./', destRelPath, destFilename)

          // Add to mappings
          mappings[entryPath] = destPath
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error)
    }
  }

  // Scan the templates directory
  await scanDir(templatesDir)
  return mappings
}

// Template file mappings (source -> destination)
// Define basic mappings but allow for flexible discovery of templates
const TEMPLATE_MAPPINGS = {
  [join(config.templatesDir, 'README.template.md')]: './README.md',
  [join(config.templatesDir, 'deno.template.jsonc')]: './deno.jsonc',
  [join(config.templatesDir, 'CONTRIBUTING.template.md')]: './CONTRIBUTING.md',
  [join(config.templatesDir, 'LICENSE.template')]: './LICENSE',
  [join(config.templatesDir, '.env.template')]: './.env',
  [join(config.templatesDir, 'deno-version.template')]: './.deno-version',
  [join(config.templatesDir, '.editorconfig.template')]: './.editorconfig',
  [join(config.templatesDir, '.vscode', 'settings.template.json')]: './.vscode/settings.json',
  [join(config.templatesDir, '.vscode', 'extensions.template.json')]: './.vscode/extensions.json',
  // Add src directory templates
  [join(config.templatesDir, 'src', 'lib.template.ts')]: './src/lib.ts',
  [join(config.templatesDir, 'src', 'mod.template.ts')]: './src/mod.ts',
  [join(config.templatesDir, 'src', 'types.template.ts')]: './src/types.ts',
  // Add src/utils directory templates
  [join(config.templatesDir, 'src', 'utils', 'telemetry.template.ts')]: './src/utils/telemetry.ts',
}

// Get workspace directory from environment if set
const workspaceDir = Deno.env.get('DENO_KIT_WORKSPACE')

/**
 * Gets the git user name from git config
 *
 * @returns {Promise<string>} The git user name or empty string if not found
 */
async function getGitUserName(): Promise<string> {
  try {
    const command = new Deno.Command('git', {
      args: ['config', 'user.name'],
      stdout: 'piped',
    })

    const { stdout } = await command.output()
    const decoder = new TextDecoder()
    return decoder.decode(stdout).trim()
  } catch (_error) {
    return ''
  }
}

/**
 * Gets the git user email from git config
 *
 * @returns {Promise<string>} The git user email or empty string if not found
 */
async function getGitUserEmail(): Promise<string> {
  try {
    const command = new Deno.Command('git', {
      args: ['config', 'user.email'],
      stdout: 'piped',
    })

    const { stdout } = await command.output()
    const decoder = new TextDecoder()
    return decoder.decode(stdout).trim()
  } catch (_error) {
    return ''
  }
}

/**
 * Prompts the user for input with a default value
 *
 * @param {string} promptText - The text to display to the user
 * @param {string} defaultValue - The default value to use if the user doesn't provide input
 * @returns {Promise<string>} The user input or the default value
 */
async function promptWithDefault(
  promptText: string,
  defaultValue: string,
): Promise<string> {
  // In test mode, use environment variables
  if (Deno.env.get('DENO_KIT_TEST_MODE') === 'true') {
    // Map prompt text to environment variable
    const envMap: Record<string, string> = {
      'Enter package name (format: @scope/name)': 'DENO_KIT_PACKAGE_NAME',
      'Enter package version': 'DENO_KIT_VERSION',
      'Enter author name': 'DENO_KIT_AUTHOR_NAME',
      'Enter author email': 'DENO_KIT_AUTHOR_EMAIL',
      'Enter package description': 'DENO_KIT_DESCRIPTION',
      'Enter GitHub username or organization': 'DENO_KIT_GITHUB_USER',
    }

    const envVar = envMap[promptText.replace(/ \[.*?\]$/, '')]
    if (envVar) {
      const value = Deno.env.get(`DENO_KIT_${envVar}`)
      if (value) {
        return value
      }
    }
  }

  const promptWithDefault = defaultValue ? `${promptText} [${defaultValue}]: ` : `${promptText}: `

  console.log(promptWithDefault)

  const buf = new Uint8Array(1024)
  const n = await Deno.stdin.read(buf)
  if (n === null) {
    return defaultValue
  }

  const input = new TextDecoder().decode(buf.subarray(0, n)).trim()
  return input || defaultValue
}

/**
 * Validates a package name to ensure it's in the format @scope/name
 *
 * @param {string} packageName - The package name to validate
 * @returns {boolean} True if the package name is valid, false otherwise
 */
function isValidPackageName(packageName: string): boolean {
  return /^@[a-z0-9-]+\/[a-z0-9-]+$/.test(packageName)
}

/**
 * Extracts the scope from a package name
 *
 * @param {string} packageName - The package name to extract the scope from
 * @returns {string} The scope (including @) or empty string if not found
 */
function extractScope(packageName: string): string {
  const match = packageName.match(/^(@[a-z0-9-]+)\/[a-z0-9-]+$/)
  return match ? match[1] : ''
}

/**
 * Extracts the project name from a package name (without scope)
 *
 * @param {string} packageName - The package name to extract the project name from
 * @returns {string} The project name (without scope) or the original package name
 */
function extractProjectName(packageName: string): string {
  const match = packageName.match(/^@[a-z0-9-]+\/([a-z0-9-]+)$/)
  return match ? match[1] : packageName
}

/**
 * Gathers all template values from user input
 *
 * @returns {Promise<TemplateValues>} The template values provided by the user
 */
async function gatherTemplateValues(): Promise<TemplateValues> {
  // Get default values
  const defaultName = await getGitUserName()
  const defaultEmail = await getGitUserEmail()
  const currentYear = new Date().getFullYear().toString()

  // Prompt for package name with validation
  let packageName = ''
  do {
    packageName = await promptWithDefault(
      'Enter package name (format: @scope/name)',
      '@my-org/my-lib',
    )

    if (!isValidPackageName(packageName)) {
      console.error(
        'Invalid package name format. It must be in the format @scope/name (e.g., @deno/example)',
      )
    }
  } while (!isValidPackageName(packageName))

  // Extract scope and project name
  const packageScope = extractScope(packageName)
  const projectName = extractProjectName(packageName)

  // Get default GitHub username from package scope (without the @ symbol)
  const defaultGithubUser = packageScope.replace('@', '')

  // Gather remaining values
  const packageVersion = await promptWithDefault(
    'Enter package version',
    '0.0.1',
  )

  const authorName = await promptWithDefault(
    'Enter author name',
    defaultName,
  )

  const authorEmail = await promptWithDefault(
    'Enter author email',
    defaultEmail,
  )

  const packageDescription = await promptWithDefault(
    'Enter package description',
    'A Deno library',
  )

  const githubUser = await promptWithDefault(
    'Enter GitHub username or organization',
    defaultGithubUser,
  )

  // Return all gathered values
  return {
    PACKAGE_NAME: packageName,
    PACKAGE_SCOPE: packageScope,
    PACKAGE_VERSION: packageVersion,
    PACKAGE_AUTHOR_NAME: authorName,
    PACKAGE_AUTHOR_EMAIL: authorEmail,
    PACKAGE_DESCRIPTION: packageDescription,
    PACKAGE_GITHUB_USER: githubUser,
    YEAR: currentYear,
    PROJECT_NAME: projectName,
  }
}

/**
 * Replaces all placeholders in a string with their values
 *
 * @param {string} content - The content containing placeholders
 * @param {TemplateValues} values - The values to replace placeholders with
 * @returns {string} The content with placeholders replaced
 */
function replacePlaceholders(
  content: string,
  values: TemplateValues,
): string {
  return content.replace(
    /{([A-Z_]+)}/g,
    (_match, placeholder) => placeholder in values ? values[placeholder] : _match,
  )
}

/**
 * Creates the backup directory if it doesn't exist
 *
 * @returns {Promise<void>}
 */
async function ensureBackupsDir(): Promise<void> {
  try {
    await Deno.mkdir(config.backupsDir, { recursive: true })
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw error
    }
  }
}

/**
 * Backs up an existing file before overwriting it
 *
 * @param {string} filePath - The path of the file to back up
 * @returns {Promise<boolean>} True if the file was backed up, false otherwise
 */
async function backupExistingFile(filePath: string): Promise<boolean> {
  try {
    // Check if the file exists
    await Deno.stat(filePath)

    // Get relative path from workspace
    const workspaceRelativePath = filePath.startsWith(workspaceDir || '')
      ? filePath.slice((workspaceDir?.length || 0) + 1)
      : filePath.startsWith('./')
      ? filePath.slice(2)
      : filePath

    const backupPath = join(
      config.backupsDir,
      `${workspaceRelativePath}.backup`,
    )

    // Ensure backup directory exists
    await ensureDir(dirname(backupPath))

    // Copy the file to backup location
    await Deno.copyFile(filePath, backupPath)
    console.log(`🔄 Backed up ${filePath} to ${backupPath}`)
    return true
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      // File doesn't exist, no backup needed
      return false
    }
    console.error(`⚠️ Failed to backup ${filePath}:`, error)
    return false
  }
}

/**
 * Processes a template file and writes it to the destination
 *
 * @param {string} templatePath - The path to the template file
 * @param {string} destPath - The path to write the processed file to
 * @param {TemplateValues} values - The values to replace placeholders with
 * @returns {Promise<void>}
 */
async function processTemplate(
  templatePath: string,
  destPath: string,
  values: TemplateValues,
): Promise<void> {
  try {
    // Ensure backup directory exists
    await ensureBackupsDir()

    // If workspace directory is set, adjust the destination path
    const finalDestPath = workspaceDir ? join(workspaceDir, destPath) : destPath
    await backupExistingFile(finalDestPath)

    // Read template file - handle both local and remote files
    let content: string
    // Fix URL formatting and improve detection
    const fixedTemplatePath = templatePath.replace(
      /^https:\/([^\/])/,
      'https://$1',
    )
      .replace(/^http:\/([^\/])/, 'http://$1')
      // Fix case sensitivity in file extensions
      .replace(/\.MD$/i, '.md')
      .replace(/\.JSON$/i, '.json')
      .replace(/\.TS$/i, '.ts')
      .replace(/\.JSONC$/i, '.jsonc')

    // More robust URL detection
    if (
      fixedTemplatePath.startsWith('http://') ||
      fixedTemplatePath.startsWith('https://') ||
      fixedTemplatePath.includes('jsr.io')
    ) {
      try {
        // Ensure the URL is properly formatted
        const templateUrl = new URL(fixedTemplatePath)
        console.log(`🌐 Fetching remote template: ${templateUrl.href}`)

        // Handle remote files
        const response = await fetch(templateUrl)
        if (!response.ok) {
          throw new Error(
            `Failed to fetch ${templateUrl.href}: ${response.status} ${response.statusText}`,
          )
        }
        content = await response.text()
      } catch (error: unknown) {
        const fetchError = error instanceof Error ? error : new Error(String(error))
        throw new Error(
          `Failed to fetch remote template: ${fetchError.message}`,
        )
      }
    } else {
      // Handle local files
      content = await Deno.readTextFile(fixedTemplatePath)
    }

    // Replace placeholders
    const processedContent = replacePlaceholders(content, values)

    // Write the processed template to its final destination
    await ensureDir(dirname(finalDestPath))
    await Deno.writeTextFile(finalDestPath, processedContent)

    console.log(`✅ Created ${finalDestPath}`)
  } catch (error) {
    console.error(`❌ Error processing template ${templatePath}:`, error)
  }
}

/**
 * Installs deno-kit and dependencies after template processing
 *
 * @returns {Promise<void>}
 */
async function installDependencies(): Promise<void> {
  console.log('🦕 Running deno install...')

  try {
    const command = new Deno.Command('deno', {
      args: ['install'],
      stdout: 'piped',
      stderr: 'piped',
    })

    const { stdout, stderr } = await command.output()

    const textDecoder = new TextDecoder()
    console.log(textDecoder.decode(stdout))

    const stderrOutput = textDecoder.decode(stderr)
    if (stderrOutput) {
      console.error(stderrOutput)
    }

    console.log('✅ Deno install completed')
  } catch (error) {
    console.error('❌ Error running deno install:', error)
  }
}

/**
 * Main function for template generation
 *
 * @returns {Promise<void>}
 */
async function generate(options: { workspace?: string } = {}): Promise<void> {
  console.log('🦕 Deno-Kit Project Generator')
  console.log('---------------------------------')

  // Store the workspace directory from options or environment
  const workspaceDir = options.workspace || Deno.env.get('DENO_KIT_WORKSPACE')

  // Gather all values from user input
  const templateValues = await gatherTemplateValues()

  console.log('\nℹ️ Using the following values:')
  console.table(templateValues)

  // Get all template mappings
  // First use predefined mappings and then find any additional templates
  const allTemplateMappings = Deno.env.get('DENO_KIT_DISCOVER_TEMPLATES') === 'true'
    ? await createTemplateMappings(config.templatesDir)
    : TEMPLATE_MAPPINGS

  console.log(`\n📁 Templates directory: ${config.templatesDir}`)
  console.log('📝 Processing template files:')

  // Process all template files
  for (const [templatePath, destPath] of Object.entries(allTemplateMappings)) {
    console.log(`  🔄 Processing: ${templatePath} -> ${destPath}`)
    await processTemplate(templatePath, destPath, templateValues)
  }

  // Run deno install
  await installDependencies()

  // Install Cursor AI configuration
  console.log('\n🔍 Setting up Cursor AI configuration...')
  const success = await setupOrUpdateCursorConfig(workspaceDir)
  if (success) {
    console.log('✅ Successfully installed Cursor AI rules')
  } else {
    console.warn('⚠️ Failed to install Cursor AI rules')
  }

  console.log('\n🎉 All done! Your Deno project is ready to use.')
  console.log('📦 Package:', templateValues.PACKAGE_NAME)
}

if (import.meta.main) {
  // Parse command line arguments using a more robust approach with @std/cli
  const args = Deno.args
  const parsedArgs: Record<string, unknown> = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--workspace' && i + 1 < args.length) {
      parsedArgs.workspace = args[++i] // Increment i after usage
    }
    // Add other flags here as needed
  }

  // Pass workspace only if it's defined, avoiding TypeScript errors with exactOptionalPropertyTypes
  const options: { workspace?: string } = {}
  if (typeof parsedArgs.workspace === 'string') {
    options.workspace = parsedArgs.workspace
  }

  await generate(options)
}

export type { TemplateValues }
export {
  backupExistingFile,
  ensureBackupsDir,
  extractProjectName,
  extractScope,
  gatherTemplateValues,
  generate,
  isValidPackageName,
  processTemplate,
  replacePlaceholders,
  TEMPLATE_MAPPINGS,
}
