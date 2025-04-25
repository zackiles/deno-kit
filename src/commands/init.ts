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
import { dirname, fromFileUrl, join } from '@std/path'

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
 * Extracts templates from templates.zip in production mode
 * @returns Path to the extracted templates
 */
async function extractProductionTemplates(): Promise<string> {
  const templatesPath = join(
    dirname(fromFileUrl(import.meta.url)),
    '..',
    '..',
    'bin',
    'templates.zip',
  )
  const tempDir = await Deno.makeTempDir({ prefix: 'deno-kit-templates-' })
  const targetDir = join(tempDir, 'templates')

  try {
    await ensureDir(targetDir)
    const zipReader = new ZipReader(new Uint8ArrayReader(await Deno.readFile(templatesPath)))
    const entries = await zipReader.getEntries()

    await Promise.all(entries.map(async (entry) => {
      if (!entry?.getData) return
      const data = await entry.getData(new Uint8ArrayWriter())
      const entryPath = join(targetDir, entry.filename)
      await ensureDir(dirname(entryPath))
      await Deno.writeFile(entryPath, data)
    }))

    await zipReader.close()
    return targetDir
  } catch (error) {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {})
    throw error
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

  // Create a temporary directory to combine templates
  const tempDir = await Deno.makeTempDir({ prefix: 'deno-kit-' })
  const tempTemplatesDir = join(tempDir, 'templates')
  await ensureDir(tempTemplatesDir)

  try {
    // Get the base templates path depending on environment
    const templatesBasePath = updatedConfig.DENO_ENV === 'production'
      ? await extractProductionTemplates()
      : await resolveResourcePath('templates')

    // Get paths for shared and project-specific templates
    const sharedTemplatesDir = join(templatesBasePath, 'shared')
    const projectTypeTemplatesDir = join(
      templatesBasePath,
      templateValues.PROJECT_TYPE.toLowerCase(),
    )

    logger.debug(`Using shared templates from: ${sharedTemplatesDir}`)
    logger.debug(`Using ${templateValues.PROJECT_TYPE} templates from: ${projectTypeTemplatesDir}`)

    // Copy shared templates
    if (await exists(sharedTemplatesDir)) {
      logger.debug('Copying shared templates...')
      await copy(sharedTemplatesDir, tempTemplatesDir, { overwrite: true })
    } else {
      logger.warn(`Shared templates directory not found: ${sharedTemplatesDir}`)
    }

    // Copy project-specific templates (overwriting shared ones if conflicts)
    if (await exists(projectTypeTemplatesDir)) {
      logger.debug(`Copying ${templateValues.PROJECT_TYPE} templates...`)
      await copy(projectTypeTemplatesDir, tempTemplatesDir, { overwrite: true })
    } else {
      logger.warn(`Project-specific templates directory not found: ${projectTypeTemplatesDir}`)
    }

    const workspace = await createWorkspace({
      name: templateValues.PACKAGE_NAME,
      workspacePath: updatedConfig.workspace,
      templatesPath: tempTemplatesDir,
      configFileName: 'kit.json',
    })

    await workspace.compileAndWriteTemplates(templateValues)
    logger.info('✅ Workspace and template files copied successfully')
    await workspace.save()
    logger.info('✅ Workspace configuration file saved successfully')

    // Run deno install in non-interactive mode with force flag
    await workspace.runCommand('deno', ['install'])
    logger.info('✅ Deno dependencies installed successfully')

    await setupOrUpdateCursorConfig(workspace.path)
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
