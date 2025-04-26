#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import { create as createWorkspace, getGitUserEmail, getGitUserName } from '../workspace.ts'
import type { CommandRouteDefinition } from '../utils/command-router.ts'
import resolveResourcePath from '../utils/resource-path.ts'
import logger from '../utils/logger.ts'
import { setupOrUpdateCursorConfig } from '../utils/cursor-config.ts'
import { copy, ensureDir, exists } from '@std/fs'
// NOTE: Using data-uri is a workaround to avoid an issue with the zip-js library. See https://github.com/gildas-lormeau/zip.js/issues/519
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip-js/zip-js/data-uri'
import getTemplateValues from '../template-values.ts'
import loadConfig from '../config.ts'
import { dirname, join } from '@std/path'

const GITHUB_REPO = 'zackiles/deno-kit'

const commandRoute: CommandRouteDefinition = {
  name: 'init',
  command: command,
  description: 'Create a new Deno-Kit project in the current or specified path',
  options: {
    string: ['workspace', 'w'],
    alias: { w: 'workspace' },
    unknown: () => {
      return true
    },
  },
}

/**
 * Fetches the latest release tag from GitHub API.
 */
async function getLatestGitHubTag(): Promise<string> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
  logger.debug(`Fetching latest release info from: ${url}`)

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        // Add a token if needed for rate limits, but try without first
        // Authorization: `token YOUR_GITHUB_TOKEN`,
      },
    })

    if (!response.ok) {
      throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`)
    }

    const releaseInfo = await response.json()
    const tagName = releaseInfo?.tag_name

    if (!tagName) {
      throw new Error('Could not find tag_name in GitHub API response')
    }

    // Remove potential 'v' prefix
    const version = tagName.startsWith('v') ? tagName.slice(1) : tagName
    logger.debug(`Latest GitHub tag found: ${tagName} -> ${version}`)
    return version
  } catch (error) {
    logger.error('Failed to fetch latest GitHub release tag:', error)
    throw new Error('Could not determine latest version for downloading templates.')
  }
}

/**
 * Downloads and extracts templates.zip from GitHub Release for production.
 * @param version The version tag to download.
 * @param targetDir The directory to extract templates into.
 */
async function downloadAndExtractProductionTemplates(
  version: string,
  targetDir: string,
): Promise<void> {
  const assetUrl = `https://github.com/${GITHUB_REPO}/releases/download/v${version}/templates.zip`
  logger.info(`Downloading templates from ${assetUrl}...`)

  try {
    const response = await fetch(assetUrl)
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download templates.zip: ${response.status} ${response.statusText}`)
    }

    const zipData = new Uint8Array(await response.arrayBuffer())
    logger.debug(`Downloaded ${zipData.byteLength} bytes for templates.zip`)

    logger.info('Extracting templates...')
    const zipReader = new ZipReader(new Uint8ArrayReader(zipData))
    const entries = await zipReader.getEntries()

    await ensureDir(targetDir)
    await Promise.all(entries.map(async (entry) => {
      if (!entry?.getData || entry.directory) return // Skip directories
      const data = await entry.getData(new Uint8ArrayWriter())
      const entryPath = join(targetDir, entry.filename)
      // Ensure the directory for the file exists
      await ensureDir(dirname(entryPath))
      await Deno.writeFile(entryPath, data)
      logger.debug(`Extracted: ${entry.filename}`)
    }))

    await zipReader.close()
    logger.info('Templates extracted successfully.')
  } catch (error) {
    logger.error(`Failed to download or extract templates from ${assetUrl}`, error)
    throw new Error('Could not retrieve project templates for production.')
  }
}

/**
 * Extracts templates.zip from a specific path provided by an environment variable.
 * Used in 'test' environment when running compiled binary tests.
 * @param targetDir The directory to extract templates into.
 */
async function extractTestTemplatesZip(targetDir: string): Promise<void> {
  const templatesZipPath = Deno.env.get('DENO_KIT_TEST_TEMPLATES_ZIP_PATH')
  if (!templatesZipPath) {
    throw new Error('DENO_KIT_TEST_TEMPLATES_ZIP_PATH environment variable is not set.')
  }
  logger.info(`Extracting test templates zip from: ${templatesZipPath}`)

  try {
    // Removed Deno.execPath() logic
    if (!await exists(templatesZipPath)) {
      throw new Error(
        `Test templates.zip not found at path specified by env var: ${templatesZipPath}`,
      )
    }

    const zipData = await Deno.readFile(templatesZipPath)
    const zipReader = new ZipReader(new Uint8ArrayReader(zipData))
    const entries = await zipReader.getEntries()

    await ensureDir(targetDir)
    await Promise.all(entries.map(async (entry) => {
      if (!entry?.getData || entry.directory) return // Skip directories
      const data = await entry.getData(new Uint8ArrayWriter())
      const entryPath = join(targetDir, entry.filename)
      await ensureDir(dirname(entryPath))
      await Deno.writeFile(entryPath, data)
      logger.debug(`Extracted: ${entry.filename}`)
    }))

    await zipReader.close()
    logger.info('Test templates zip extracted successfully.')
  } catch (error) {
    logger.error('Failed to extract test templates.zip', error)
    throw new Error('Could not retrieve project templates for test environment.')
  }
}

async function command({ args }: { args: Args }): Promise<void> {
  // Check for positional argument after "init"
  const workspacePath = args._.length > 0 ? String(args._[0]) : undefined

  // If a positional argument was provided, set it as the workspace path
  if (workspacePath) {
    // This will be picked up by loadConfig() later
    Deno.env.set('DENO_KIT_WORKSPACE', workspacePath)
  }

  // Reload config to pick up any workspace changes
  const updatedConfig = await loadConfig()
  logger.debug(`Setting up project in workspace: ${updatedConfig.workspace}`)
  await ensureDir(updatedConfig.workspace)

  // Check if kit.json already exists in the workspace
  const configFilePath = join(updatedConfig.workspace, 'kit.json')
  if (await exists(configFilePath)) {
    throw new Error(`A Deno-Kit project already exists in ${updatedConfig.workspace}`)
  }

  const templateValues = await getTemplateValues({
    gitName: await getGitUserName(),
    gitEmail: await getGitUserEmail(),
  })

  // Create a temporary directory to hold the final templates
  const tempDir = await Deno.makeTempDir({ prefix: 'deno-kit-init-' })
  const finalTemplatesDir = join(tempDir, 'templates') // This will hold the final combined/downloaded templates
  await ensureDir(finalTemplatesDir)

  try {
    if (updatedConfig.DENO_ENV === 'production') {
      // Production: Download templates from GitHub Release
      logger.info('Production mode detected. Downloading templates...')
      const latestVersion = await getLatestGitHubTag()
      await downloadAndExtractProductionTemplates(latestVersion, finalTemplatesDir)
    } else if (updatedConfig.DENO_ENV === 'test') {
      // Test: Check if we should extract a local zip (usually for compiled binary tests)
      const testZipPath = Deno.env.get('DENO_KIT_TEST_TEMPLATES_ZIP_PATH')
      if (testZipPath) {
        logger.info('Test mode with local zip path detected. Extracting...')
        // Extract zip to an intermediate directory first
        const extractedZipDir = join(tempDir, 'extracted-zip')
        await ensureDir(extractedZipDir)
        await extractTestTemplatesZip(extractedZipDir) // Extract to intermediate dir

        // Now, replicate the dev logic to copy/merge into finalTemplatesDir
        logger.info('Merging extracted test templates...')
        const sharedTemplatesDir = join(extractedZipDir, 'shared') // Source from extracted dir
        const projectTypeTemplatesDir = join(
          extractedZipDir, // Source from extracted dir
          templateValues.PROJECT_TYPE.toLowerCase(),
        )

        logger.debug(`Using shared templates from: ${sharedTemplatesDir}`)
        logger.debug(
          `Using ${templateValues.PROJECT_TYPE} templates from: ${projectTypeTemplatesDir}`,
        )

        if (await exists(sharedTemplatesDir)) {
          logger.debug('Copying shared templates to final dir...')
          await copy(sharedTemplatesDir, finalTemplatesDir, { overwrite: true })
        } else {
          logger.warn(
            `Shared templates directory not found in extracted zip: ${sharedTemplatesDir}`,
          )
        }

        if (await exists(projectTypeTemplatesDir)) {
          logger.debug(`Copying ${templateValues.PROJECT_TYPE} templates to final dir...`)
          await copy(projectTypeTemplatesDir, finalTemplatesDir, { overwrite: true })
        } else {
          logger.warn(
            `Project-specific templates directory not found in extracted zip: ${projectTypeTemplatesDir}`,
          )
        }
        // Clean up intermediate extraction directory (optional, as tempDir is removed anyway)
        // await Deno.remove(extractedZipDir, { recursive: true });
      } else {
        // If test mode but no specific zip path, fall back to dev logic (using source templates)
        logger.info('Test mode detected, using local development templates...')
        // Replicate Development logic here
        const templatesBasePath = await resolveResourcePath('templates')
        const sharedTemplatesDir = join(templatesBasePath, 'shared')
        const projectTypeTemplatesDir = join(
          templatesBasePath,
          templateValues.PROJECT_TYPE.toLowerCase(),
        )
        logger.debug(`Using shared templates from: ${sharedTemplatesDir}`)
        logger.debug(
          `Using ${templateValues.PROJECT_TYPE} templates from: ${projectTypeTemplatesDir}`,
        )
        if (await exists(sharedTemplatesDir)) {
          logger.debug('Copying shared templates...')
          await copy(sharedTemplatesDir, finalTemplatesDir, { overwrite: true })
        } else {
          logger.warn(`Shared templates directory not found: ${sharedTemplatesDir}`)
        }
        if (await exists(projectTypeTemplatesDir)) {
          logger.debug(`Copying ${templateValues.PROJECT_TYPE} templates...`)
          await copy(projectTypeTemplatesDir, finalTemplatesDir, { overwrite: true })
        } else {
          logger.warn(
            `Project-specific templates directory not found: ${projectTypeTemplatesDir}`,
          )
        }
      }
    } else {
      // Development: Copy local templates
      logger.info('Development mode detected. Using local templates...')
      const templatesBasePath = await resolveResourcePath('templates')
      const sharedTemplatesDir = join(templatesBasePath, 'shared')
      const projectTypeTemplatesDir = join(
        templatesBasePath,
        templateValues.PROJECT_TYPE.toLowerCase(),
      )

      logger.debug(`Using shared templates from: ${sharedTemplatesDir}`)
      logger.debug(
        `Using ${templateValues.PROJECT_TYPE} templates from: ${projectTypeTemplatesDir}`,
      )

      // Copy shared templates to the final temp dir
      if (await exists(sharedTemplatesDir)) {
        logger.debug('Copying shared templates...')
        await copy(sharedTemplatesDir, finalTemplatesDir, { overwrite: true })
      } else {
        logger.warn(`Shared templates directory not found: ${sharedTemplatesDir}`)
      }

      // Copy project-specific templates (overwriting shared ones if conflicts)
      if (await exists(projectTypeTemplatesDir)) {
        logger.debug(`Copying ${templateValues.PROJECT_TYPE} templates...`)
        await copy(projectTypeTemplatesDir, finalTemplatesDir, { overwrite: true })
      } else {
        logger.warn(`Project-specific templates directory not found: ${projectTypeTemplatesDir}`)
      }
    }

    // Use the finalTemplatesDir (either downloaded or copied) for workspace creation
    const workspace = await createWorkspace({
      name: templateValues.PACKAGE_NAME,
      workspacePath: updatedConfig.workspace,
      templatesPath: finalTemplatesDir, // Use the populated temp directory
      configFileName: 'kit.json',
    })

    await workspace.compileAndWriteTemplates(templateValues)
    logger.info('✅ Workspace and template files copied successfully')
    await workspace.save()
    logger.info('✅ Workspace configuration file saved successfully')

    // Run deno install in non-interactive mode with force flag
    await workspace.runCommand('deno', ['install'])
    logger.info('✅ Deno dependencies installed successfully')

    // Skip Cursor setup in test environment to avoid async leaks/timeouts
    if (updatedConfig.DENO_ENV !== 'test') {
      await setupOrUpdateCursorConfig(workspace.path)
    }
    logger.info(`Setup ${templateValues.PROJECT_TYPE} project`)
  } finally {
    // Clean up the temporary directory
    await Deno.remove(tempDir, { recursive: true })
  }
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args, commandRoute.options)
  await commandRoute.command({ args, routes: [commandRoute] })
}
export default commandRoute
