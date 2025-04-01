#!/usr/bin/env -S deno run -A

/**
 * @module setup
 * @description CLI setup module for Deno libraries
 *
 * This module handles the interactive CLI prompts for setting up a new Deno library,
 * gathering system information, and managing dependencies.
 *
 * @example
 * ```bash
 * deno run -A setup.ts
 * ```
 */

import { parseArgs } from '@std/cli'
import { setupOrUpdateCursorConfig } from '../utils/cursor-config.ts'
import {
  extractProjectName,
  extractScope,
  getPackageForPath,
  isValidPackageName,
} from '../utils/package-info.ts'
import { create } from '../workspace.ts'
import type { TemplateValues } from '../types.ts'
import resolveResourcePath from '../utils/resource-path.ts'
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
      'Enter package name (format: @scope/name)': 'PACKAGE_NAME',
      'Enter package version': 'PACKAGE_VERSION',
      'Enter author name': 'PACKAGE_AUTHOR_NAME',
      'Enter author email': 'PACKAGE_AUTHOR_EMAIL',
      'Enter package description': 'PACKAGE_DESCRIPTION',
      'Enter GitHub username or organization': 'PACKAGE_GITHUB_USER',
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
 * @param {object} workspace - Workspace instance to use for git info
 * @returns {Promise<TemplateValues>} The template values provided by the user
 */
async function gatherSetupValues(workspace: {
  getGitUserName(): Promise<string>
  getGitUserEmail(): Promise<string>
}): Promise<TemplateValues> {
  // Get default values
  const defaultName = await workspace.getGitUserName()
  const defaultEmail = await workspace.getGitUserEmail()
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
 * Ensures the workspace is new and doesn't already have a kit.json config
 *
 * @param {string} workspace - The workspace directory path
 * @returns {Promise<void>}
 */
async function ensureNewWorkspace(workspace: string): Promise<void> {
  const workspaceConfigFile = await getPackageForPath(workspace, {
    packageConfigFiles: ['kit.json'],
  })
  if (workspaceConfigFile) {
    throw new Error('A workspace already exists. Remove the kit.json file and rerun setup.')
  }
}

/**
 * Main setup command function that orchestrates the CLI interaction
 *
 * @param {CommandOptions} options - Configuration options
 * @returns {Promise<void>}
 */
async function command(options: CommandOptions): Promise<void> {
  try {
    console.log('🦕 Deno-Kit Project Setup')
    console.log('---------------------------------')

    // Check if workspace already exists
    await ensureNewWorkspace(options.workspace)

    // Create workspace
    const createWorkspace = await create({
      name: options.workspace ?? (await extractProjectName(Deno.cwd())),
      workspacePath: options.workspace,
      templatesPath: await resolveResourcePath('src/templates'),
    })

    // Gather all values from user input using the workspace instance
    const templateValues = await gatherSetupValues(createWorkspace)

    console.log('\nℹ️ Using the following values:')
    console.table(templateValues)

    // Run deno install
    // await installDependencies()

    // Install Cursor AI configuration
    // console.log('\n🔍 Setting up Cursor AI configuration...')
    // const success = await setupOrUpdateCursorConfig(options.workspace)
    // if (success) {
    //   console.log('✅ Successfully installed Cursor AI rules')
    // } else {
    //   console.warn('⚠️ Failed to install Cursor AI rules')
    // }

    console.log('\n🎉 Setup complete! Your Deno project is ready for initialization.')
    console.log('📦 Package:', templateValues.PACKAGE_NAME)
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error))
    Deno.exit(1)
  }
}

if (import.meta.main) {
  const flags = parseArgs(Deno.args, {
    string: ['workspace'],
    default: { 'workspace': Deno.cwd() },
  })

  await command(flags as CommandOptions)
}

export { gatherSetupValues, getGitUserEmail, getGitUserName, installDependencies }
export default command
export type { CommandOptions }
