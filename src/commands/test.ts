#!/usr/bin/env -S deno run -A
import { type Args, parseArgs } from '@std/cli'
import { create as createWorkspace, type Workspace } from '../workspace.ts'
import type { CommandDefinition, CommandOptions } from '../types.ts'
import resolveResourcePath from '../utils/resource-path.ts'
import logger from '../utils/logger.ts'
const commandDefinition: CommandDefinition = {
  name: 'test',
  command: command,
  description: 'Test the Deno-Kit CLI',
  options: {
    string: ['workspace'],
    //default: { 'workspace': Deno.cwd() },
    default: { 'workspace': '/Users/zacharyiles/dev/temp' },
  },
}

async function command({ args }: CommandOptions): Promise<void> {
  logger.debug(`Installing Deno-Kit in workspace: ${args.workspace}`)

  const workspace: Workspace = await createWorkspace({
    workspacePath: args.workspace,
    templatesPath: await resolveResourcePath('templates'),
    configFileName: 'kit.json',
  })

  logger.info('Deno-Kit installed!', await workspace.toJSON())
}

if (import.meta.main) {
  const args: Args = parseArgs(Deno.args, commandDefinition.options)
  await commandDefinition.command({ args, routes: [commandDefinition] })
}
export default commandDefinition
