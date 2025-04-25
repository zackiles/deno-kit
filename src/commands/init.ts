#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import { create as createWorkspace, type Workspace } from '../workspace.ts'
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

const config = await loadConfig()

const commandRoute: CommandRouteDefinition = {
  name: 'init',
  command: command,
  description: 'Create a new Deno-Kit project in the current or specified path',
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

async function command(): Promise<void> {
  logger.debug(`Setting up project in workspace: ${config.workspace}`)
  await ensureDir(config.workspace)

  // Check if kit.json already exists in the workspace
  const configFilePath = join(config.workspace, 'kit.json')
  if (await exists(configFilePath)) {
    throw new Error(`A Deno-Kit project already exists in ${config.workspace}`)
  }

  const templateValues = await getTemplateValues({
    gitName: await getGitUserName(config.workspace),
    gitEmail: await getGitUserEmail(config.workspace),
  })

  // Create a temporary directory to combine templates
  const tempDir = await Deno.makeTempDir({ prefix: 'deno-kit-' })
  const tempTemplatesDir = join(tempDir, 'templates')
  await ensureDir(tempTemplatesDir)

  try {
    // Get the base templates path depending on environment
    const templatesBasePath = config.DENO_ENV === 'production'
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

    const workspace: Workspace = await createWorkspace({
      name: templateValues.PACKAGE_NAME,
      workspacePath: config.workspace,
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

// Helper functions to get git information without requiring a workspace instance
async function getGitUserName(workspacePath: string): Promise<string> {
  try {
    const process = new Deno.Command('git', {
      args: ['config', 'user.name'],
      cwd: workspacePath,
      stdout: 'piped',
    })
    const output = await process.output()
    return new TextDecoder().decode(output.stdout).trim()
  } catch {
    return ''
  }
}

async function getGitUserEmail(workspacePath: string): Promise<string> {
  try {
    const process = new Deno.Command('git', {
      args: ['config', 'user.email'],
      cwd: workspacePath,
      stdout: 'piped',
    })
    const output = await process.output()
    return new TextDecoder().decode(output.stdout).trim()
  } catch {
    return ''
  }
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args, commandRoute.options)
  await commandRoute.command({ args, routes: [commandRoute] })
}
export default commandRoute
