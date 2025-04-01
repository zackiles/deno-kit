#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import { create as createWorkspace, type Workspace } from '../workspace.ts'
import type { CommandDefinition, CommandOptions } from '../types.ts'
import resolveResourcePath from '../utils/resource-path.ts'
import logger from '../utils/logger.ts'
import { ensureDir } from '@std/fs'
import getTemplateValues from '../template-values.ts'
const commandDefinition: CommandDefinition = {
  name: 'init',
  command: command,
  description: 'Create a new Deno-Kit project in the current or specified path',
  options: {
    string: ['workspace'],
    //default: { 'workspace': Deno.cwd() },
    default: { 'workspace': '/Users/zacharyiles/dev/temp' },
  },
}

async function command({ args }: CommandOptions): Promise<void> {
  logger.debug(`Setting up project in workspace: ${args.workspace}`)
  await ensureDir(args.workspace)

  const workspace: Workspace = await createWorkspace({
    workspacePath: args.workspace,
    templatesPath: await resolveResourcePath('templates'),
    configFileName: 'kit.json',
  })

  const templateValues = await getTemplateValues({
    gitName: await workspace.getGitUserName(),
    gitEmail: await workspace.getGitUserEmail(),
  })

  await workspace.compileAndWriteTemplates(templateValues)
  await workspace.save()

  logger.info(`Setup project in workspace: ${workspace.path}`)
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args, commandDefinition.options)
  await commandDefinition.command({ args, routes: [commandDefinition] })
}
export default commandDefinition
