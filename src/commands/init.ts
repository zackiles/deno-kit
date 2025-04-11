#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import { create as createWorkspace, type Workspace } from '../workspace.ts'
import type { CommandDefinition, CommandOptions } from '../types.ts'
import resolveResourcePath from '../utils/resource-path.ts'
import logger from '../utils/logger.ts'
import { ensureDir } from '@std/fs'
import getTemplateValues from '../template-values.ts'
import loadConfig from '../config.ts'

const config = await loadConfig()

const commandDefinition: CommandDefinition = {
  name: 'init',
  command: command,
  description: 'Create a new Deno-Kit project in the current or specified path',
  options: {
    string: ['workspace'],
    default: { 'workspace': config.DENO_KIT_WORKSPACE || Deno.cwd() },
  },
}

async function command({ args }: CommandOptions): Promise<void> {
  logger.debug(`Setting up project in workspace: ${args.workspace}`)
  await ensureDir(args.workspace)

  const templateValues = await getTemplateValues({
    gitName: await getGitUserName(args.workspace),
    gitEmail: await getGitUserEmail(args.workspace),
  })

  const workspace: Workspace = await createWorkspace({
    name: templateValues.PACKAGE_NAME,
    workspacePath: args.workspace,
    templatesPath: await resolveResourcePath('templates'),
    configFileName: 'kit.json',
  })

  await workspace.compileAndWriteTemplates(templateValues)
  await workspace.save()

  logger.info(`Setup project in workspace: ${workspace.path}`)
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
  const args: Args = parseArgs(Deno.args, commandDefinition.options)
  await commandDefinition.command({ args, routes: [commandDefinition] })
}
export default commandDefinition
