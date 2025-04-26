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
    unknown: () => true,
  },
}

/**
 * Fetches content from the given URL and extracts it as a zip to the target directory.
 * @param source Source URL, file path, or descriptor (for error messages)
 * @param targetDir Directory to extract the zip contents to
 * @param isLocalFile Whether the source is a local file (vs URL)
 */
async function fetchAndExtractZip(
  source: string,
  targetDir: string,
  isLocalFile = false,
): Promise<void> {
  try {
    // Get the zip data (from URL or file)
    const zipData = isLocalFile
      ? await Deno.readFile(source)
      : new Uint8Array(await (await fetch(source)).arrayBuffer())

    logger.debug(
      `Successfully read ${zipData.byteLength} bytes from ${isLocalFile ? 'file' : 'URL'}`,
    )

    // Extract the zip
    const zipReader = new ZipReader(new Uint8ArrayReader(zipData))
    try {
      const entries = await zipReader.getEntries()
      logger.debug(`Found ${entries.length} entries in zip file`)
      await ensureDir(targetDir)

      // Process entries based on their paths
      for (const entry of entries) {
        if (entry.directory || !entry.getData) continue

        let targetPath: string

        // Handle shared/ folder - extract directly to target
        if (entry.filename.startsWith('shared/')) {
          targetPath = join(targetDir, entry.filename.substring('shared/'.length))
        } // Handle project-specific folders - extract directly to target
        else if (
          /^(cli|library|http-server|websocket-server|sse-server|mcp-server)\//.test(entry.filename)
        ) {
          const parts = entry.filename.split('/')
          if (parts.length >= 2) {
            // Remove the project-type prefix
            parts.shift()
            targetPath = join(targetDir, parts.join('/'))
          } else {
            // Skip entries with unexpected format
            continue
          }
        } // Everything else - extract to target keeping its path
        else {
          targetPath = join(targetDir, entry.filename)
        }

        await ensureDir(dirname(targetPath))
        await Deno.writeFile(targetPath, await entry.getData(new Uint8ArrayWriter()))
      }

      logger.debug(`Extracted zip contents to ${targetDir}`)
    } finally {
      await zipReader.close().catch(() => {})
    }
  } catch (error) {
    const errorType = isLocalFile ? 'read' : 'download'
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to ${errorType} or extract from ${source}: ${message}`)
  }
}

/**
 * Extracts template files from local source folders to target directory.
 * @param templatesBasePath Base path to the templates directory
 * @param projectType Type of project (cli, library, etc.)
 * @param targetDir Directory to extract templates to
 */
async function extractLocalTemplates(
  templatesBasePath: string,
  projectType: string,
  targetDir: string,
): Promise<void> {
  // Copy shared, then project-specific templates (latter overwrites conflicts)
  for (const sourceType of ['shared', projectType]) {
    const sourcePath = join(templatesBasePath, sourceType)
    if (await exists(sourcePath)) {
      await copy(sourcePath, targetDir, { overwrite: true })
    }
  }
}

/**
 * Initializes a new Deno-Kit project
 */
async function command({ args }: { args: Args }): Promise<void> {
  // Set workspace path from args if provided
  if (args._.length > 0) {
    Deno.env.set('DENO_KIT_WORKSPACE', String(args._[0]))
  }

  // Load config and check for existing project
  const config = await loadConfig()
  const targetWorkspace = config.workspace
  await ensureDir(targetWorkspace)

  const configFilePath = join(targetWorkspace, 'kit.json')
  if (await exists(configFilePath)) {
    throw new Error(`A Deno-Kit project already exists at ${configFilePath}`)
  }

  // Get template values for rendering
  const templateValues = await getTemplateValues({
    gitName: await getGitUserName(),
    gitEmail: await getGitUserEmail(),
  })

  // Set up temporary directory for template processing
  const tempDir = await Deno.makeTempDir({ prefix: 'deno-kit-init-' })
  const finalTemplatesDir = join(tempDir, 'templates')
  await ensureDir(finalTemplatesDir)

  try {
    // Prepare templates based on environment
    await prepareTemplates(config.DENO_ENV, finalTemplatesDir, templateValues)

    // Create the workspace with the prepared templates
    const workspace = await createWorkspace({
      name: templateValues.PACKAGE_NAME,
      workspacePath: targetWorkspace,
      templatesPath: finalTemplatesDir,
      configFileName: 'kit.json',
    })

    // Process and write templates, save config, install dependencies
    await workspace.compileAndWriteTemplates(templateValues)
    await workspace.save()
    await workspace.runCommand('deno', ['install'])

    // Set up Cursor config (in all environments)
    await setupOrUpdateCursorConfig(workspace.path)

    // Keep the original log format for test compatibility and add the path info
    logger.info(`Setup ${templateValues.PROJECT_TYPE} project`)
    logger.info(`✅ Project initialized in ${targetWorkspace}`)
  } finally {
    // Clean up temp files
    await Deno.remove(tempDir, { recursive: true })
      .catch((err) => logger.warn(`Cleanup failed: ${err instanceof Error ? err.message : err}`))
  }

  /**
   * Prepares templates based on the current environment
   */
  async function prepareTemplates(
    environment: string,
    templatesDir: string,
    values: Record<string, string>,
  ): Promise<void> {
    const preparers = {
      production: prepareProductionTemplates,
      test: prepareTestTemplates,
      development: prepareDevelopmentTemplates,
    }

    const preparer = preparers[environment as keyof typeof preparers] || prepareDevelopmentTemplates
    await preparer(templatesDir, values)
  }

  /**
   * Prepares templates for production environment by downloading from GitHub
   */
  async function prepareProductionTemplates(
    templatesDir: string,
    _values: Record<string, string>,
  ): Promise<void> {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
    const releaseInfo = await fetch(url, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    }).then((res) => res.json())

    const version = (releaseInfo?.tag_name || '').replace(/^v/, '')
    if (!version) throw new Error('Could not determine latest version')

    await fetchAndExtractZip(
      `https://github.com/${GITHUB_REPO}/releases/download/v${version}/templates.zip`,
      templatesDir,
    )
  }

  /**
   * Prepares templates for test environment using local zip file
   */
  async function prepareTestTemplates(
    templatesDir: string,
    _values: Record<string, string>,
  ): Promise<void> {
    // In test mode, templates.zip should be in the bin directory of the project
    const cwd = Deno.cwd()
    const templatesZipPath = join(cwd, 'bin', 'templates.zip')

    logger.debug(`Looking for test templates at: ${templatesZipPath}`)

    if (!await exists(templatesZipPath)) {
      // Fall back to development mode if templates.zip doesn't exist
      logger.debug('Templates zip not found, falling back to local templates')
      const templatesBasePath = await resolveResourcePath('templates')
      try {
        await extractLocalTemplates(
          templatesBasePath,
          'cli', // Default to CLI templates in test mode
          templatesDir,
        )
        return
      } catch (err) {
        throw new Error(
          `Templates zip not found at ${templatesZipPath} and local templates fallback failed. Make sure to run 'deno task build' before running tests.`,
        )
      }
    }

    logger.debug(`Using test templates zip: ${templatesZipPath}`)
    await fetchAndExtractZip(templatesZipPath, templatesDir, true)

    // Simple verification that extraction succeeded
    const readmeExists = await exists(join(templatesDir, 'README.md'))
    if (!readmeExists) {
      logger.warn('README.md not found after extraction - build test may fail.')
    }
  }

  /**
   * Prepares templates for development environment using local templates
   */
  async function prepareDevelopmentTemplates(
    templatesDir: string,
    values: Record<string, string>,
  ): Promise<void> {
    const templatesBasePath = await resolveResourcePath('templates')
    await extractLocalTemplates(
      templatesBasePath,
      values.PROJECT_TYPE.toLowerCase(),
      templatesDir,
    )
  }
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args, commandRoute.options)
  await commandRoute.command({ args, routes: [commandRoute] })
}

export default commandRoute
