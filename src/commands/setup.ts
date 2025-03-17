/**
 * @module setup
 * @description CLI setup module for Deno libraries
 *
 * This module handles the interactive CLI prompts for setting up a new Deno library,
 * gathering system information, and managing dependencies.
 *
 * @example
 * ```bash
 * deno run --allow-run --allow-env setup.ts
 * ```
 */

import { getConfig } from '../config.ts'
import { setupOrUpdateCursorConfig } from '../utils/cursor-config.ts'
import { extractProjectName, extractScope, isValidPackageName } from '../utils/package-info.ts'

// Get configuration to access basic settings
const config = await getConfig()

/** Core information gathered during setup */
export interface SetupValues {
  /** Full package name including scope (e.g., "@deno/example") */
  packageName: string

  /** Package scope with @ symbol (e.g., "@deno") */
  packageScope: string

  /** Semantic version number (e.g., "1.0.0") */
  packageVersion: string

  /** Author's full name (e.g., "John Doe") */
  authorName: string

  /** Author's email address (e.g., "john.doe@example.com") */
  authorEmail: string

  /** Short description of the package (e.g., "A modern HTTP client for Deno") */
  packageDescription: string

  /** GitHub username or organization without @ (e.g., "denoland") */
  githubUser: string

  /** Current year for license and documentation (e.g., "2024") */
  year: string

  /** Package name without scope (e.g., "example" from "@deno/example") */
  projectName: string
}

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
 * Gathers all setup values from user input
 *
 * @returns {Promise<SetupValues>} The setup values provided by the user
 */
async function gatherSetupValues(): Promise<SetupValues> {
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
    packageName,
    packageScope,
    packageVersion,
    authorName,
    authorEmail,
    packageDescription,
    githubUser,
    year: currentYear,
    projectName,
  }
}

/**
 * Installs deno-kit and dependencies
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
 * Main setup function that orchestrates the CLI interaction
 *
 * @returns {Promise<void>}
 */
async function setup(options: { workspace?: string } = {}): Promise<void> {
  console.log('🦕 Deno-Kit Project Setup')
  console.log('---------------------------------')

  // Store the workspace directory from options or environment
  const workspaceDir = options.workspace || Deno.env.get('DENO_KIT_WORKSPACE')

  // Gather all values from user input
  const setupValues = await gatherSetupValues()

  console.log('\nℹ️ Using the following values:')
  console.table(setupValues)

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

  console.log('\n🎉 Setup complete! Your Deno project is ready for initialization.')
  console.log('📦 Package:', setupValues.packageName)
}

if (import.meta.main) {
  // Parse command line arguments
  const args = Deno.args
  const parsedArgs: Record<string, unknown> = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--workspace' && i + 1 < args.length) {
      parsedArgs.workspace = args[++i]
    }
  }

  // Pass workspace only if it's defined
  const options: { workspace?: string } = {}
  if (typeof parsedArgs.workspace === 'string') {
    options.workspace = parsedArgs.workspace
  }

  await setup(options)
}

export { gatherSetupValues, getGitUserEmail, getGitUserName, installDependencies, setup }
