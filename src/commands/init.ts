#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import { create as createWorkspace, type Workspace } from '../workspace.ts'
import type { CommandRouteDefinition } from '../utils/ command-router.ts'
import resolveResourcePath from '../utils/resource-path.ts'
import logger from '../utils/logger.ts'
import { setupOrUpdateCursorConfig } from '../utils/cursor-config.ts'
import { copy, ensureDir, exists } from '@std/fs'
import getTemplateValues from '../template-values.ts'
import loadConfig from '../config.ts'
import { join } from '@std/path'

const config = await loadConfig()

const commandRoute: CommandRouteDefinition = {
  name: 'init',
  command: command,
  description: 'Create a new Deno-Kit project in the current or specified path',
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

  // Prepare templates based on selected project type
  const projectType = templateValues.PROJECT_TYPE.toLowerCase()
  const sharedTemplatesDir = await resolveResourcePath('templates/shared')
  const projectTypeTemplatesDir = await resolveResourcePath(`templates/${projectType}`)

  // Create a temporary directory to combine templates
  const tempTemplatesDir = await Deno.makeTempDir({ prefix: 'deno-kit-templates-' })

  try {
    // Copy shared templates
    if (await exists(sharedTemplatesDir)) {
      await copy(sharedTemplatesDir, tempTemplatesDir, { overwrite: true })
    }

    // Copy project-specific templates (overwriting shared ones if conflicts)
    if (await exists(projectTypeTemplatesDir)) {
      await copy(projectTypeTemplatesDir, tempTemplatesDir, { overwrite: true })
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
    logger.info(`Setup ${templateValues.PROJECT_TYPE} project in workspace: ${workspace.path}`)
  } finally {
    // Clean up the temporary directory
    await Deno.remove(tempTemplatesDir, { recursive: true })
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
